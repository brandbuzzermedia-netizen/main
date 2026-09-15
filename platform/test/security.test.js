import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshAgency } from './helpers.js';
import { seal, open, hashPassword, verifyPassword, textFingerprint } from '../src/core/crypto.js';
import { serializeAccount } from '../src/services/credentials.js';
import { serializeUser } from '../src/api/context.js';
import { insert } from '../src/db/repo.js';
import { can, permissionsFor } from '../src/core/rbac.js';

/** Credential handling and RBAC (§5, §50). */

test('sealed credentials round-trip and are not readable as plaintext', () => {
  const token = 'ya29.super-secret-oauth-token';
  const sealed = seal(token);
  assert.notEqual(sealed, token);
  assert.ok(!sealed.includes(token));
  assert.ok(sealed.startsWith('v1.'));
  assert.equal(open(sealed), token);
});

test('every seal of the same value differs (random IV)', () => {
  assert.notEqual(seal('same'), seal('same'));
});

test('a tampered ciphertext fails authentication rather than decrypting', () => {
  const sealed = seal('secret');
  const parts = sealed.split('.');
  parts[3] = Buffer.from('tampered-payload').toString('base64url');
  assert.throws(() => open(parts.join('.')));
});

test('a social account serialises without any token material', () => {
  const { agencyId, client } = freshAgency({ slug: 'sec-a' });
  const account = insert('social_accounts', {
    agency_id: agencyId, client_id: client.id, platform: 'instagram',
    handle: '@test', access_token_enc: seal('secret-token'), refresh_token_enc: seal('refresh'),
  });

  const payload = serializeAccount(account);
  const json = JSON.stringify(payload);
  for (const forbidden of ['secret-token', 'refresh', 'access_token_enc', 'refresh_token_enc']) {
    assert.ok(!json.includes(forbidden), `serialised account leaked "${forbidden}"`);
  }
  assert.equal(payload.has_credentials, true);
  assert.equal(payload.handle, '@test');
});

test('a user serialises without their password hash', () => {
  const { user } = freshAgency({ slug: 'sec-b' });
  const json = JSON.stringify(serializeUser(user));
  assert.ok(!json.includes('password_hash'));
  assert.ok(!json.includes('scrypt$'));
});

test('passwords verify correctly and reject wrong input', () => {
  const stored = hashPassword('correct horse battery staple');
  assert.ok(verifyPassword('correct horse battery staple', stored));
  assert.ok(!verifyPassword('wrong password', stored));
  assert.ok(!verifyPassword('', stored));
  assert.ok(!verifyPassword('x', 'not-a-hash'));
});

test('RBAC denies what a role should not reach', () => {
  assert.ok(can({ role: 'admin' }, 'publish:execute'));
  assert.ok(can({ role: 'social_media_manager' }, 'publish:execute'));

  assert.ok(!can({ role: 'content_creator' }, 'publish:execute'),
    'a content creator must not be able to publish');
  assert.ok(!can({ role: 'reviewer' }, 'client:write'));
  assert.ok(!can({ role: 'client' }, 'account:write'));
  assert.ok(!can({ role: 'client' }, 'publish:execute'));
  assert.ok(!can({ role: undefined }, 'client:read'));
  assert.ok(can({ role: 'client' }, 'approval:decide'));
});

test('no role except admin holds a wildcard grant', () => {
  for (const role of ['social_media_manager', 'content_creator', 'reviewer', 'client']) {
    assert.ok(!permissionsFor(role).includes('*'), `${role} must not hold a wildcard`);
  }
});

test('text fingerprints ignore cosmetic differences but not meaning', () => {
  assert.equal(textFingerprint('Hello, world!'), textFingerprint('hello world'));
  assert.notEqual(textFingerprint('Hello world'), textFingerprint('Goodbye world'));
});
