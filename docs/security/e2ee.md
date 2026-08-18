# NM NEXUS — End-to-End Encryption (E2EE)

## Threat model

### What we protect against

- **Honest-but-curious server**: Supabase stores ciphertext only for DMs and private groups. Even with full database access, the server cannot decrypt message content.
- **Network observer**: all traffic is HTTPS/WSS. Even with TLS stripped (e.g. corporate proxy), message bodies are ciphertext.
- **Other users**: RLS prevents User A from reading User B's conversations at the database layer. E2EE prevents it at the cryptographic layer.
- **Compromised server-side backups**: backups contain ciphertext; without the recipient's private key, they are useless.

### What we do NOT protect against

- **Compromised endpoint**: if malware runs on your device, it can read plaintext from memory, capture keystrokes, or exfiltrate your private key from `localStorage`.
- **Coerced key disclosure**: an attacker who forces you to unlock your device can read your messages.
- **Server-side metadata analysis**: the server knows who you talk to, when, and how often. Message bodies are hidden; metadata is not.
- **Social engineering / phishing**: if you click a malicious link, your session can be stolen.

### Trust boundaries

```
┌─────────────────────────┐         ┌─────────────────────────┐
│   YOUR DEVICE (trusted) │         │  SUPABASE (untrusted)   │
│                         │         │                         │
│  - Private keys         │  HTTPS  │  - Ciphertext only      │
│  - Plaintext (transient)│ ◄─────► │  - Public keys          │
│  - Decryption           │         │  - Metadata             │
│                         │         │  - RLS (access control) │
└─────────────────────────┘         └─────────────────────────┘
```

## Cryptographic primitives

All primitives are from **libsodium** (NaCl-derived, audited, standardized). No custom cryptography is used.

| Purpose | Primitive | Key size | Notes |
|---|---|---|---|
| Identity key | X25519 | 32 bytes | Long-term, per-device |
| Signing key | Ed25519 | 32 bytes | Signs the signed prekey |
| Signed prekey | X25519 | 32 bytes | Medium-term, rotates |
| One-time prekey | X25519 | 32 bytes | Consumed once per message |
| Symmetric encryption | XChaCha20-Poly1305 | 32 bytes | 24-byte nonce, AEAD |
| Key derivation | crypto_box_beforenm | — | ECDH shared secret |
| Safety number | crypto_generichash | 8 bytes | BLAKE2b, truncated |

## Key generation flow

```
1. User signs up → trigger creates profile + settings
2. User opens app → E2EE module checks localStorage for keys
3. If no keys:
   a. generateIdentityKeyPair()      → X25519 keypair
   b. generateSigningKeyPair()       → Ed25519 keypair (for signed prekeys)
   c. generateSignedPreKey()         → X25519 keypair, signed by identity key
   d. generateOneTimePreKey() × 50   → X25519 keypairs, consumed one per message
4. Public keys uploaded to:
   - devices table: identity_key_public, signed_prekey_public, signed_prekey_signature
   - user_settings table: one_time_prekeys (JSONB array)
5. Private keys stored in localStorage, NEVER sent to server
6. Future: encrypted backup to user_settings.encrypted_backup (encrypted with user-chosen passphrase)
```

## Message encryption (1:1 DM)

```
Sender (Alice) wants to send "hello" to Bob:

1. Alice's client fetches Bob's prekey bundle:
   - calls RPC fetch_prekey_bundle(bob_id)
   - gets: identity_key, signed_prekey, signature, one_time_prekey
   - server atomically pops the one-time prekey from the JSONB array

2. Alice verifies Bob's signed prekey signature (Ed25519)

3. Alice generates an ephemeral X25519 keypair for this message

4. Alice derives shared secret:
   shared = crypto_box_beforenm(bob_identity_pub, alice_ephemeral_priv)

5. Alice encrypts:
   ciphertext = crypto_aead_xchacha20poly1305_ietf_encrypt(
     plaintext="hello",
     nonce=<24 random bytes>,
     key=shared
   )

6. Alice inserts message row:
   - encrypted_payload: base64(ciphertext)
   - encryption_nonce: base64(nonce)
   - encryption_metadata: { ephemeralKey: base64(alice_ephemeral_pub) }

7. Supabase Realtime broadcasts the INSERT to Bob

8. Bob's client receives the event:
   - Derives shared = crypto_box_beforenm(alice_ephemeral_pub, bob_identity_priv)
   - Decrypts plaintext = crypto_aead_xchacha20poly1305_ietf_decrypt(...)
   - Renders "hello" in the chat UI
```

## Group encryption

Group chats use a shared symmetric key, wrapped per-recipient:

```
1. Group creator generates group_key = random 32 bytes
2. For each member, wraps the group key:
   wrapped[member_id] = encryptMessageForRecipient(group_key, creator_priv, member_pub)
3. Wrapped keys stored in conversations.group_key_wrapped (JSONB map: user_id → wrapped blob)
4. Each message encrypted with the group_key via XChaCha20-Poly1305
5. New members: creator wraps the group key for them and updates the map
6. Member leaves: group_key rotated, re-wrapped for remaining members
```

## File encryption

Files use a fresh symmetric key per file, then the file key is encrypted as a message:

```
1. fileKey = random 32 bytes
2. ciphertext, nonce = encryptFile(fileBytes, fileKey)
3. Upload ciphertext to Supabase Storage (private bucket)
4. Store attachment row with:
   - storage_path: <uid>/<filename>
   - encrypted_metadata: encrypt(file_name, mime_type, file_size, fileKey)
5. Send a message with encryption_metadata containing the wrapped fileKey
6. Recipient downloads ciphertext, decrypts with fileKey, displays original
```

## Key rotation

### Signed prekey rotation

- Signed prekeys should rotate every ~1-2 weeks.
- Old signed prekeys remain valid for decryption of old messages.
- New messages use the latest signed prekey.

### Identity key rotation

- Identity key rotation invalidates your ability to decrypt old messages.
- Requires all contacts to re-establish a secure session.
- Available in Settings → Security → Regenerate keys.

### One-time prekey replenishment

- Each message consumes one one-time prekey.
- When supply drops below 10, client generates 50 new ones and uploads.
- If supply is exhausted, falls back to signed prekey only (still secure, slightly less forward secrecy).

## Device management

Each device gets its own identity key pair. Multiple devices for the same user:

- Each device can decrypt only messages encrypted to its key.
- Sending a message to a user with N devices wraps the message N times (once per device).
- Device revocation (Settings → Devices → Revoke):
  - Deletes the device row from `public.devices`
  - Future messages are not encrypted to that device
  - Old messages on that device remain decryptable (until local key is cleared)

## Recovery limitations (be honest)

- **No centralized key escrow** — your private key is only on your device.
- **Lost device = lost access** to old encrypted messages.
- **Browser data clear = lost access** — back up your keys.
- **Future: encrypted backup** — optional, encrypted with a user-chosen recovery passphrase, stored in `user_settings.encrypted_backup`.

## Safety number (fingerprint verification)

To detect man-in-the-middle attacks:

```
safety_number = BLAKE2b(
  sort(identityKeyA, identityKeyB)
).toString().slice(0, 12)
// Format: "1234 5678 9012"
```

Both users compare this number out-of-band (in person, via phone call). If they match, the channel is secure.

The `computeSafetyNumber()` function exists in `src/lib/crypto/e2ee.ts` but is not yet exposed in the UI. Future work.

## What's NOT yet implemented (honest)

1. **Double Ratchet** — currently each message uses the same shared secret. The Double Ratchet algorithm would derive a fresh key per message, providing stronger forward secrecy. Planned for v1.1.
2. **Post-quantum key exchange** — X25519 is vulnerable to a future quantum computer. ML-KEM (Kyber) integration is planned for v2.0.
3. **Multi-device message fan-out** — currently only the latest device receives messages. Multi-device sync requires wrapping per device.
4. **Encrypted backup** — the `encrypted_backup` column exists but the backup/restore flow is not yet built.
5. **Safety number UI** — function exists, no UI yet.

## Audit checklist

Before declaring E2EE production-ready:

- [ ] Independent crypto audit (Cure53, NCC Group, or similar)
- [ ] Double Ratchet implementation
- [ ] Safety number UI + QR code verification
- [ ] Encrypted backup + restore
- [ ] Multi-device message fan-out
- [ ] Post-quantum key exchange (ML-KEM)
- [ ] Key revocation propagation
- [ ] Forward secrecy test suite
- [ ] Threat model review with external cryptographer

## References

- [Signal Protocol specification](https://signal.org/docs/specifications/doubleratchet/)
- [X3DH key agreement](https://signal.org/docs/specifications/x3dh/)
- [libsodium documentation](https://doc.libsodium.org/)
- [RFC 8439 — ChaCha20-Poly1305](https://datatracker.ietf.org/doc/html/rfc8439)
- [RFC 7748 — Elliptic Curves for Security (X25519)](https://datatracker.ietf.org/doc/html/rfc7748)
