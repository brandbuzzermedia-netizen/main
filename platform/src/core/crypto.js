import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors.js';

/**
 * Envelope encryption for platform credentials.
 *
 * Tokens are sealed with AES-256-GCM under a key derived from
 * CREDENTIAL_ENCRYPTION_KEY. Sealed values are the only form that ever touches
 * the database, and they are never included in an API response — see
 * docs/SECURITY.md and the serializer allowlist in api/social-accounts.js.
 */

let cachedKey = null;

function key() {
  if (cachedKey) return cachedKey;
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) {
    throw new AppError(500, 'missing_encryption_key',
      'CREDENTIAL_ENCRYPTION_KEY is not set. Refusing to handle platform credentials.');
  }
  // Accept either a 32-byte base64 key or a passphrase (derived with scrypt).
  const decoded = Buffer.from(raw, 'base64');
  cachedKey = decoded.length === 32 ? decoded : scryptSync(raw, 'social-os/credential/v1', 32);
  return cachedKey;
}

/** For tests that swap the key at runtime. */
export function resetKeyCache() { cachedKey = null; }

/** @param {string|null|undefined} plaintext @returns {string|null} */
export function seal(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ct.toString('base64url')}`;
}

/** @param {string|null|undefined} sealed @returns {string|null} */
export function open(sealed) {
  if (!sealed) return null;
  const [version, ivB64, tagB64, ctB64] = String(sealed).split('.');
  if (version !== 'v1' || !ivB64 || !tagB64 || !ctB64) {
    throw new AppError(500, 'bad_ciphertext', 'Stored credential is not a valid sealed value');
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
}

/** Password hashing: scrypt with a per-user salt. */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length,
      { N: Number(N), r: Number(r), p: Number(p) });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Session tokens: random secret to the client, SHA-256 digest at rest. */
export function newSessionToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, digest: sha256(token) };
}

export const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

/**
 * Normalised fingerprint used for duplicate/near-duplicate comment detection.
 * Lowercases, strips punctuation and collapses whitespace so cosmetic
 * rewording of the same comment still collides.
 */
export function textFingerprint(text) {
  const normalised = String(text ?? '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sha256(normalised);
}
