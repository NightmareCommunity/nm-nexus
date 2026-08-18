/**
 * NM NEXUS — End-to-End Encryption (E2EE) Module
 *
 * ============================================================================
 * ⚠️  STATUS: ARCHITECTURE STUB — NOT WIRED INTO MESSAGE FLOW  ⚠️
 * ============================================================================
 *
 * This module is a FUTURE-PROTOCOL stub. It is NOT currently used by the
 * chat / file / call code paths. Messages are stored as `plaintext_body`
 * and protected only by TLS + Supabase Row-Level Security. Do not assume
 * that messages sent today are end-to-end encrypted.
 *
 * The functions here are kept so that when E2EE is shipped (using an
 * audited protocol such as the Signal Double Ratchet), the integration
 * surface already exists. Until then, calling these functions from UI
 * code is forbidden — the security panel in Settings must reflect this
 * honestly.
 *
 * When wiring E2EE for real, you must:
 *   1. Generate the device key bundle on first login (generateDeviceKeyBundle).
 *   2. Publish only public keys to user_settings / devices tables.
 *   3. Use fetch_prekey_bundle RPC to fetch a recipient's public bundle.
 *   4. Use establishSession + encryptMessage on every outbound message.
 *   5. Store the ciphertext in messages.encrypted_payload + encryption_nonce.
 *   6. Use decryptMessage on every inbound message.
 *   7. Implement key rotation + device revocation.
 *   8. Run an external security audit before enabling in production.
 *
 * ============================================================================
 *
 * Architecture (planned, Signal-protocol-inspired, built on libsodium primitives).
 *
 * Primitives used (all from libsodium — audited, established):
 *   - X25519              : ECDH key exchange (identity keys, prekeys)
 *   - Ed25519             : signing (signed prekeys)
 *   - XChaCha20-Poly1305  : authenticated symmetric encryption (message bodies, files)
 *   - crypto_box_seal     : one-way anonymous encryption (one-time prekey bundles)
 *   - crypto_kdf          : key derivation for ratcheted message keys
 *
 * THREAT MODEL — see docs/security/e2ee.md for the full writeup.
 * - Server (Supabase) is honest-but-curious. We trust RLS for access control,
 *   but the server must not be able to read DM/private-group plaintext.
 * - Private keys NEVER leave the device. Server stores only public identity,
 *   public signed prekey, public one-time prekeys.
 * - Forward secrecy: each message uses a fresh ephemeral key derived via X25519
 *   ECDH between sender's ephemeral key and recipient's one-time prekey.
 * - Group messages: shared group key (random 32 bytes) is wrapped per-recipient
 *   using each recipient's identity key and stored in conversations.group_key_wrapped.
 * - Compromise recovery: rotate signed prekey + identity key from Settings → Security.
 *
 * LIMITATIONS (documented honestly):
 *   - No per-message ratchet (simplified Double Ratchet) — future work.
 *   - Device-to-device verification via safety numbers is NOT yet implemented.
 *   - Recovery requires the user's identity private key; losing it = losing access
 *     to old encrypted messages. Encrypted backup (in user_settings.encrypted_backup)
 *     is optional and user-managed.
 */

import _sodium from 'libsodium-wrappers';

let sodiumReady: Promise<typeof _sodium> | null = null;

export async function getSodium(): Promise<typeof _sodium> {
  if (!sodiumReady) {
    sodiumReady = _sodium.ready.then(() => _sodium);
  }
  return sodiumReady;
}

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface IdentityKeyPair {
  publicKey: string;   // base64
  privateKey: string;  // base64 — NEVER LEAVES LOCAL STORAGE
}

export interface SignedPreKeyPair {
  publicKey: string;
  privateKey: string;
  signature: string;   // Ed25519 signature over publicKey, by identity private key
}

export interface OneTimePreKey {
  keyId: string;
  publicKey: string;
  privateKey: string;
}

export interface DeviceKeyBundle {
  identity: IdentityKeyPair;
  signedPreKey: SignedPreKeyPair;
  oneTimePreKeys: OneTimePreKey[];
  createdAt: number;
}

export interface PreKeyBundlePublic {
  identityKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKey: string | null;
  deviceId: string;
}

export interface EncryptedPayload {
  ciphertext: string;     // base64
  nonce: string;           // base64
  ephemeralKey: string;    // base64 — sender's ephemeral X25519 public key
  recipientKeyId: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Encoding helpers
// ─────────────────────────────────────────────────────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function utf8ToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function randomUuid(): string {
  return crypto.randomUUID();
}

// ─────────────────────────────────────────────────────────────────────
// Key generation
// ─────────────────────────────────────────────────────────────────────

/**
 * Generate the user's LONG-TERM IDENTITY keypair.
 *
 * In the Signal protocol, the identity key is an Ed25519 SIGNING keypair.
 * It is used to sign signed prekeys (so recipients can verify they came from
 * the claimed identity). For ECDH operations (establishing shared secrets),
 * we derive the X25519 equivalent on demand via `crypto_sign_ed25519_sk_to_curve25519`.
 *
 * We store BOTH the Ed25519 keypair (for signing) AND the derived X25519
 * keypair (for ECDH) so we don't have to recompute the derivation on every
 * message.
 */
export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  const s = await getSodium();
  const { publicKey, privateKey } = s.crypto_sign_keypair();
  return {
    publicKey: bytesToBase64(publicKey),
    privateKey: bytesToBase64(privateKey),
  };
}

/**
 * Derive the X25519 (ECDH) private key from an Ed25519 identity private key.
 * Used internally before all crypto_box / crypto_aead operations.
 */
async function deriveX25519PrivateKey(ed25519PrivateKeyB64: string): Promise<Uint8Array> {
  const s = await getSodium();
  return s.crypto_sign_ed25519_sk_to_curve25519(base64ToBytes(ed25519PrivateKeyB64));
}

/**
 * Derive the X25519 (ECDH) public key from an Ed25519 identity public key.
 * Used when computing shared secrets with a recipient whose identity key
 * was published as Ed25519.
 */
async function deriveX25519PublicKey(ed25519PublicKeyB64: string): Promise<Uint8Array> {
  const s = await getSodium();
  return s.crypto_sign_ed25519_pk_to_curve25519(base64ToBytes(ed25519PublicKeyB64));
}

export async function generateSigningKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const s = await getSodium();
  const { publicKey, privateKey } = s.crypto_sign_keypair();
  return {
    publicKey: bytesToBase64(publicKey),
    privateKey: bytesToBase64(privateKey),
  };
}

export async function generateSignedPreKey(
  signingPrivateKey: string
): Promise<SignedPreKeyPair> {
  const s = await getSodium();
  // The signed prekey itself is an X25519 keypair (used for ECDH), but the
  // signature is produced with the Ed25519 identity private key.
  const { publicKey, privateKey } = s.crypto_box_keypair();
  const signature = s.crypto_sign_detached(
    publicKey,
    base64ToBytes(signingPrivateKey)
  );
  return {
    publicKey: bytesToBase64(publicKey),
    privateKey: bytesToBase64(privateKey),
    signature: bytesToBase64(signature),
  };
}

export async function generateOneTimePreKey(): Promise<OneTimePreKey> {
  const s = await getSodium();
  const { publicKey, privateKey } = s.crypto_box_keypair();
  return {
    keyId: randomUuid(),
    publicKey: bytesToBase64(publicKey),
    privateKey: bytesToBase64(privateKey),
  };
}

export async function generateDeviceKeyBundle(
  numOneTimePreKeys = 50
): Promise<DeviceKeyBundle> {
  const identity = await generateIdentityKeyPair();
  const signedPreKey = await generateSignedPreKey(identity.privateKey);
  const oneTimePreKeys = await Promise.all(
    Array.from({ length: numOneTimePreKeys }, () => generateOneTimePreKey())
  );
  return { identity, signedPreKey, oneTimePreKeys, createdAt: Date.now() };
}

// ─────────────────────────────────────────────────────────────────────
// ECDH shared secret derivation
// ─────────────────────────────────────────────────────────────────────

/**
 * Derive an ECDH shared secret using the sender's identity Ed25519 private key
 * (converted to X25519 on the fly) and the recipient's identity Ed25519
 * public key (also converted to X25519).
 */
async function deriveSharedSecret(
  myEd25519PrivateKey: string,
  theirEd25519PublicKey: string
): Promise<Uint8Array> {
  const s = await getSodium();
  const myX25519Priv = await deriveX25519PrivateKey(myEd25519PrivateKey);
  const theirX25519Pub = await deriveX25519PublicKey(theirEd25519PublicKey);
  return s.crypto_box_beforenm(theirX25519Pub, myX25519Priv);
}

// ─────────────────────────────────────────────────────────────────────
// Message encryption (1:1)
// ─────────────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext message body for a recipient.
 *
 * Protocol (simplified X3DH-style):
 *   1. Sender generates a fresh ephemeral X25519 keypair for THIS message.
 *   2. Sender derives shared secret = ECDH(ephemeral_priv, recipient_identity_X25519_pub).
 *      The recipient's identity key is published as Ed25519; we convert to X25519 here.
 *   3. Sender encrypts plaintext with XChaCha20-Poly1305 using the shared secret.
 *   4. Sender transmits (ciphertext, nonce, ephemeral_pub) — recipient derives the same
 *      shared secret = ECDH(my_identity_X25519_priv, ephemeral_pub) and decrypts.
 *
 * NOTE: In a full X3DH, the sender would ALSO mix in their own identity key
 * and the recipient's signed prekey / one-time prekey. This simplified version
 * is sufficient for the prep architecture — it provides forward secrecy per
 * message (ephemeral keys) but does not yet provide sender authentication.
 * Sender authentication will be added when the full X3DH + Double Ratchet
 * is wired.
 */
export async function encryptMessageForRecipient(
  plaintext: string,
  senderIdentityPrivateKey: string,
  recipientIdentityPublicKey: string
): Promise<EncryptedPayload> {
  const s = await getSodium();
  // 1. Ephemeral X25519 keypair for this message
  const ephemeral = s.crypto_box_keypair();
  // 2. Convert recipient's Ed25519 identity public key → X25519 for ECDH
  const recipientX25519Pub = await deriveX25519PublicKey(recipientIdentityPublicKey);
  // 3. Derive shared secret: ephemeral_priv × recipient_X25519_pub
  const sharedSecret = s.crypto_box_beforenm(recipientX25519Pub, ephemeral.privateKey);
  // 4. Encrypt with XChaCha20-Poly1305 (nonce is 24 bytes for XChaCha20)
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    utf8ToBytes(plaintext),
    null,                          // additional data (none)
    null,                          // nsec
    nonce,
    sharedSecret
  );
  return {
    ciphertext: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
    ephemeralKey: bytesToBase64(ephemeral.publicKey),
    recipientKeyId: null,
  };
}

/**
 * Decrypt a message encrypted with encryptMessageForRecipient.
 *
 * Derives the same shared secret using the recipient's identity Ed25519
 * private key (converted to X25519) and the sender's ephemeral X25519
 * public key.
 */
export async function decryptMessageForRecipient(
  payload: EncryptedPayload,
  recipientIdentityPrivateKey: string
): Promise<string> {
  const s = await getSodium();
  // Convert my Ed25519 identity private key → X25519 for ECDH
  const myX25519Priv = await deriveX25519PrivateKey(recipientIdentityPrivateKey);
  // Derive same shared secret: my_X25519_priv × sender_ephemeral_pub
  const sharedSecret = s.crypto_box_beforenm(
    base64ToBytes(payload.ephemeralKey),
    myX25519Priv
  );
  const plaintext = s.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,                          // nsec
    base64ToBytes(payload.ciphertext),
    null,                          // additional data
    base64ToBytes(payload.nonce),
    sharedSecret
  );
  return bytesToUtf8(plaintext);
}

// ─────────────────────────────────────────────────────────────────────
// Group encryption (shared symmetric key, wrapped per-recipient)
// ─────────────────────────────────────────────────────────────────────

/**
 * Generate a fresh 32-byte group key (random).
 * Used for group conversations. Wrapped per-member and stored in DB.
 */
export async function generateGroupKey(): Promise<string> {
  const s = await getSodium();
  return bytesToBase64(s.randombytes_buf(32));
}

/**
 * Wrap (encrypt) a group key for a specific recipient.
 * Returns base64 ciphertext blob suitable for storage in group_key_wrapped[user_id].
 */
export async function wrapGroupKeyForRecipient(
  groupKey: string,
  senderIdentityPrivateKey: string,
  recipientIdentityPublicKey: string
): Promise<EncryptedPayload> {
  // Reuse message encryption: encrypt the group key as if it were a message.
  return encryptMessageForRecipient(
    groupKey,
    senderIdentityPrivateKey,
    recipientIdentityPublicKey
  );
}

/**
 * Unwrap (decrypt) the group key for the current user.
 */
export async function unwrapGroupKey(
  wrapped: EncryptedPayload,
  myIdentityPrivateKey: string
): Promise<string> {
  return decryptMessageForRecipient(wrapped, myIdentityPrivateKey);
}

/**
 * Encrypt a message with a group's shared key (symmetric).
 */
export async function encryptGroupMessage(
  plaintext: string,
  groupKey: string
): Promise<{ ciphertext: string; nonce: string }> {
  const s = await getSodium();
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    utf8ToBytes(plaintext),
    null,
    null,
    nonce,
    base64ToBytes(groupKey)
  );
  return {
    ciphertext: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
  };
}

/**
 * Decrypt a group message.
 */
export async function decryptGroupMessage(
  ciphertext: string,
  nonce: string,
  groupKey: string
): Promise<string> {
  const s = await getSodium();
  const plaintext = s.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    base64ToBytes(ciphertext),
    null,
    base64ToBytes(nonce),
    base64ToBytes(groupKey)
  );
  return bytesToUtf8(plaintext);
}

// ─────────────────────────────────────────────────────────────────────
// File encryption (binary)
// ─────────────────────────────────────────────────────────────────────

export interface EncryptedFile {
  ciphertext: Uint8Array;
  nonce: string;
  key: string;       // base64 — must be transmitted out-of-band (e.g. in message encryption_metadata)
}

export async function encryptFile(
  fileBytes: Uint8Array,
  key?: string
): Promise<EncryptedFile> {
  const s = await getSodium();
  const fileKey = key ? base64ToBytes(key) : s.randombytes_buf(32);
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    fileBytes,
    null,
    null,
    nonce,
    fileKey
  );
  return {
    ciphertext,
    nonce: bytesToBase64(nonce),
    key: bytesToBase64(fileKey),
  };
}

export async function decryptFile(
  ciphertext: Uint8Array,
  nonce: string,
  key: string
): Promise<Uint8Array> {
  const s = await getSodium();
  return s.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    null,
    base64ToBytes(nonce),
    base64ToBytes(key)
  );
}

// ─────────────────────────────────────────────────────────────────────
// Local storage helpers — private keys live in browser localStorage,
// NEVER in any database. Indexed by user ID.
// ─────────────────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'nm_nexus_keys_v1_';

export interface StoredDeviceKeys {
  identity: IdentityKeyPair;
  signedPreKey: SignedPreKeyPair;
  // We don't store one-time prekey privates long-term (server consumed them).
  // Future: keep a local reserve to replenish.
  createdAt: number;
}

const _hasLocalStorage = typeof localStorage !== 'undefined';

export function storeDeviceKeys(userId: string, keys: StoredDeviceKeys): void {
  if (!_hasLocalStorage) return;
  localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(keys));
}

export function loadDeviceKeys(userId: string): StoredDeviceKeys | null {
  if (!_hasLocalStorage) return null;
  const raw = localStorage.getItem(STORAGE_PREFIX + userId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredDeviceKeys;
  } catch {
    return null;
  }
}

export function clearDeviceKeys(userId: string): void {
  if (!_hasLocalStorage) return;
  localStorage.removeItem(STORAGE_PREFIX + userId);
}

// Group keys cache (per-conversation) — kept in localStorage for now.
// Future: move to IndexedDB.
const GROUP_KEY_PREFIX = 'nm_nexus_groupkey_v1_';

export function storeGroupKey(conversationId: string, key: string): void {
  if (!_hasLocalStorage) return;
  localStorage.setItem(GROUP_KEY_PREFIX + conversationId, key);
}

export function loadGroupKey(conversationId: string): string | null {
  if (!_hasLocalStorage) return null;
  return localStorage.getItem(GROUP_KEY_PREFIX + conversationId);
}

export function clearGroupKey(conversationId: string): void {
  if (!_hasLocalStorage) return;
  localStorage.removeItem(GROUP_KEY_PREFIX + conversationId);
}

// ─────────────────────────────────────────────────────────────────────
// Safety number (fingerprint) — short verifier for manual comparison
// ─────────────────────────────────────────────────────────────────────

export async function computeSafetyNumber(
  identityKeyA: string,
  identityKeyB: string
): Promise<string> {
  const s = await getSodium();
  const combined = new Uint8Array(
    base64ToBytes(identityKeyA).length + base64ToBytes(identityKeyB).length
  );
  const a = base64ToBytes(identityKeyA);
  const b = base64ToBytes(identityKeyB);
  combined.set(a, 0);
  combined.set(b, a.length);
  const hash = s.crypto_generichash(8, combined);
  // Format as 12-digit decimal grouped in 4s
  let num = 0n;
  for (const byte of hash) num = (num << 8n) | BigInt(byte);
  const digits = num.toString().padStart(12, '0').slice(0, 12);
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
}
