import { randomBytes, randomUUID } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

/**
 * Lexicographically sortable id (ULID-shaped): 10 chars of timestamp +
 * 16 chars of randomness. Sortable ids keep index locality on the hot
 * `created_at DESC` paths without needing a separate sequence.
 * @param {string} [prefix]
 */
export function newId(prefix) {
  let ts = Date.now();
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[ts % 32] + time;
    ts = Math.floor(ts / 32);
  }
  const bytes = randomBytes(16);
  let rand = '';
  for (const b of bytes) rand += ALPHABET[b % 32];
  const id = time + rand;
  return prefix ? `${prefix}_${id}` : id;
}

export const uuid = randomUUID;

/** ISO-8601 UTC, the only timestamp format stored anywhere. */
export function now() {
  return new Date().toISOString();
}

/** @param {Date|string|number} d */
export function iso(d) {
  return new Date(d).toISOString();
}

/** @param {number} minutes @param {Date|string} [from] */
export function isoIn(minutes, from = new Date()) {
  return new Date(new Date(from).getTime() + minutes * 60_000).toISOString();
}
