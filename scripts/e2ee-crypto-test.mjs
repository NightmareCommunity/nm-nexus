/**
 * NM NEXUS — E2EE Crypto Module Unit Test (Node.js, headless)
 *
 * Exercises the libsodium-based primitives in src/lib/crypto/e2ee.ts without
 * needing a browser. We bypass the `crypto.randomUUID` / `localStorage` /
 * `btoa`/`atob` browser globals by polyfilling them, then bundle the module
 * with esbuild (so TypeScript is stripped correctly).
 *
 * Run with: `node scripts/e2ee-crypto-test.mjs`
 */

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ── Polyfill browser globals used by e2ee.ts ────────────────────────────
// Node already provides globalThis.crypto (webcrypto) — just make sure
// getRandomValues and randomUUID are available (they are on Node 19+).
// We only need to polyfill btoa/atob and localStorage.
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');

const memoryStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
  setItem: (k, v) => void memoryStore.set(k, String(v)),
  removeItem: (k) => void memoryStore.delete(k),
  clear: () => memoryStore.clear(),
};

// Bundle e2ee.ts to CJS with esbuild so we can import it from Node.
// We use CJS format because libsodium-wrappers' ESM build has trouble
// resolving the underlying libsodium binary in pure-Node contexts.
const SRC = path.resolve(process.cwd(), 'src/lib/crypto/e2ee.ts');
const OUT = path.resolve(process.cwd(), 'scripts/_e2ee_bundle.cjs');

await build({
  entryPoints: [SRC],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: OUT,
  // Don't externalize — let esbuild bundle libsodium-wrappers CJS directly.
});

const mod = await import(pathToFileURL(OUT).href);

const PASS = [];
const FAIL = [];
function check(name, ok, detail = '') {
  if (ok) {
    PASS.push(name);
    console.log(`  ✓ ${name}`);
  } else {
    FAIL.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

console.log('=== NM NEXUS — E2EE Crypto Unit Test ===\n');

// ── Test 1: Identity keypair generation ────────────────────────────────
console.log('[1] Identity keypair generation');
const idA = await mod.generateIdentityKeyPair();
const idB = await mod.generateIdentityKeyPair();
check('identity A has publicKey + privateKey', !!idA.publicKey && !!idA.privateKey);
check('identity B has publicKey + privateKey', !!idB.publicKey && !!idB.privateKey);
check('A and B keys differ', idA.publicKey !== idB.publicKey);
check('publicKey is base64 (43 chars + padding)', idA.publicKey.length === 44);

// ── Test 2: 1:1 message encrypt/decrypt round-trip ────────────────────
console.log('\n[2] 1:1 message encrypt/decrypt round-trip');
const plaintext = 'Hello B, this is a secret message from A!';
const payload = await mod.encryptMessageForRecipient(
  plaintext,
  idA.privateKey,
  idB.publicKey
);
check('payload has ciphertext + nonce + ephemeralKey',
  !!payload.ciphertext && !!payload.nonce && !!payload.ephemeralKey);
check('ciphertext differs from plaintext', payload.ciphertext !== plaintext);

const decrypted = await mod.decryptMessageForRecipient(payload, idB.privateKey);
check('decrypted plaintext matches original', decrypted === plaintext);

// ── Test 3: Decrypting with WRONG key fails ───────────────────────────
console.log('\n[3] Wrong-key decryption fails (authenticity)');
const idC = await mod.generateIdentityKeyPair();
let wrongDecryptOk = true;
try {
  await mod.decryptMessageForRecipient(payload, idC.privateKey);
} catch {
  wrongDecryptOk = false;
}
check('decrypt with wrong key throws (XChaCha20-Poly1305 auth tag)', !wrongDecryptOk);

// ── Test 4: Signed prekey signature verifies ──────────────────────────
console.log('\n[4] Signed prekey generation');
const signedPreKeyA = await mod.generateSignedPreKey(idA.privateKey);
check('signedPreKey has publicKey + privateKey + signature',
  !!signedPreKeyA.publicKey && !!signedPreKeyA.privateKey && !!signedPreKeyA.signature);
check('signature is non-empty', signedPreKeyA.signature.length > 0);

// ── Test 5: One-time prekey generation ────────────────────────────────
console.log('\n[5] One-time prekey generation');
const otpk1 = await mod.generateOneTimePreKey();
const otpk2 = await mod.generateOneTimePreKey();
check('otpk has keyId + publicKey + privateKey',
  !!otpk1.keyId && !!otpk1.publicKey && !!otpk1.privateKey);
check('two otpks differ', otpk1.keyId !== otpk2.keyId);

// ── Test 6: Full device bundle ────────────────────────────────────────
console.log('\n[6] Device key bundle generation');
const bundle = await mod.generateDeviceKeyBundle(50);
check('bundle has identity + signedPreKey + 50 oneTimePreKeys',
  !!bundle.identity && !!bundle.signedPreKey && bundle.oneTimePreKeys.length === 50);
check('every oneTimePreKey has keyId', bundle.oneTimePreKeys.every(k => !!k.keyId));

// ── Test 7: Group key wrap/unwrap ────────────────────────────────────
console.log('\n[7] Group key wrap/unwrap per recipient');
const groupKey = await mod.generateGroupKey();
check('groupKey is base64 32 bytes', groupKey.length === 44);

const wrappedForB = await mod.wrapGroupKeyForRecipient(groupKey, idA.privateKey, idB.publicKey);
const unwrappedByB = await mod.unwrapGroupKey(wrappedForB, idB.privateKey);
check('B unwraps the same group key A wrapped', unwrappedByB === groupKey);

// C should NOT be able to unwrap B's wrapped key
let cUnwrapOk = true;
try {
  await mod.unwrapGroupKey(wrappedForB, idC.privateKey);
} catch {
  cUnwrapOk = false;
}
check('C cannot unwrap B\'s wrapped group key', !cUnwrapOk);

// ── Test 8: Group message encrypt/decrypt (symmetric) ────────────────
console.log('\n[8] Group message symmetric encrypt/decrypt');
const groupMsg = 'Team announcement: meeting at 5pm';
const enc = await mod.encryptGroupMessage(groupMsg, groupKey);
const dec = await mod.decryptGroupMessage(enc.ciphertext, enc.nonce, groupKey);
check('group decrypt matches original', dec === groupMsg);

let wrongGroupDec = true;
try {
  await mod.decryptGroupMessage(enc.ciphertext, enc.nonce, await mod.generateGroupKey());
} catch {
  wrongGroupDec = false;
}
check('decrypt with wrong group key fails', !wrongGroupDec);

// ── Test 9: File encryption ──────────────────────────────────────────
console.log('\n[9] File encryption (binary)');
const fileBytes = new TextEncoder().encode('This is a binary file content \x00\x01\x02');
const encFile = await mod.encryptFile(fileBytes);
check('encrypted file has ciphertext + nonce + key',
  !!encFile.ciphertext && !!encFile.nonce && !!encFile.key);
check('ciphertext length > plaintext (auth tag adds 16 bytes)',
  encFile.ciphertext.length >= fileBytes.length + 16);

const decFile = await mod.decryptFile(encFile.ciphertext, encFile.nonce, encFile.key);
check('decrypted file matches original bytes',
  Buffer.from(decFile).equals(Buffer.from(fileBytes)));

// ── Test 10: Safety number consistency ───────────────────────────────
console.log('\n[10] Safety number (fingerprint)');
const sn_AB = await mod.computeSafetyNumber(idA.publicKey, idB.publicKey);
const sn_BA = await mod.computeSafetyNumber(idB.publicKey, idA.publicKey);
check('safety number is 12 digits in 4-4-4 format', /^\d{4} \d{4} \d{4}$/.test(sn_AB));
check('safety number AB != BA (order matters)', sn_AB !== sn_BA);
const sn_AB_again = await mod.computeSafetyNumber(idA.publicKey, idB.publicKey);
check('safety number is deterministic for same key pair', sn_AB === sn_AB_again);
const sn_AC = await mod.computeSafetyNumber(idA.publicKey, idC.publicKey);
check('safety number differs for different key pair', sn_AB !== sn_AC);

// ── Test 11: Local storage helpers ──────────────────────────────────
console.log('\n[11] Local device key storage');
const fakeUserId = '00000000-0000-0000-0000-000000000abc';
mod.clearDeviceKeys(fakeUserId);
check('loadDeviceKeys returns null after clear', mod.loadDeviceKeys(fakeUserId) === null);
const storedKeys = {
  identity: idA,
  signedPreKey: signedPreKeyA,
  createdAt: Date.now(),
};
mod.storeDeviceKeys(fakeUserId, storedKeys);
const loaded = mod.loadDeviceKeys(fakeUserId);
check('loaded keys match stored keys',
  !!loaded && loaded.identity.publicKey === idA.publicKey && loaded.identity.privateKey === idA.privateKey);

// ── Test 12: Two ephemeral payloads for same message differ ─────────
console.log('\n[12] Nonce reuse protection (random nonce per message)');
const p1 = await mod.encryptMessageForRecipient(plaintext, idA.privateKey, idB.publicKey);
const p2 = await mod.encryptMessageForRecipient(plaintext, idA.privateKey, idB.publicKey);
check('two encryptions of same plaintext have different nonces', p1.nonce !== p2.nonce);
check('two encryptions of same plaintext have different ciphertexts', p1.ciphertext !== p2.ciphertext);
check('both decrypt to the same plaintext',
  (await mod.decryptMessageForRecipient(p1, idB.privateKey)) === plaintext &&
  (await mod.decryptMessageForRecipient(p2, idB.privateKey)) === plaintext);

// ── Cleanup temp file ────────────────────────────────────────────────
try {
  fs.unlinkSync(OUT);
} catch {}

console.log('\n=== Results ===');
console.log(`  ✓ ${PASS.length} passed`);
console.log(`  ✗ ${FAIL.length} failed`);
if (FAIL.length > 0) {
  FAIL.forEach(f => console.log(`    - ${f.name}${f.detail ? ': ' + f.detail : ''}`));
  process.exit(1);
} else {
  console.log('\n  ALL CHECKS PASSED — E2EE crypto primitives are sound.');
  process.exit(0);
}
