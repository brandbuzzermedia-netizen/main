import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshAgency, principalFor } from './helpers.js';
import { find, list, insert, update, rawScoped } from '../src/db/repo.js';
import { assertClientAccess } from '../src/core/tenancy.js';
import { AppError } from '../src/core/errors.js';

/** Tenant isolation is the product's central safety property (§3, §50). */

test('a repository query cannot be built without an agency scope', () => {
  assert.throws(() => list('clients', null), /agency scope/);
  assert.throws(() => list('clients', undefined), /agency scope/);
  assert.throws(() => find('keywords', '', 'anything'), /agency scope/);
});

test('one agency cannot read another agency’s rows', () => {
  const a = freshAgency({ slug: 'iso-a' });
  const b = freshAgency({ slug: 'iso-b' });

  assert.equal(find('clients', a.agencyId, a.client.id)?.id, a.client.id);
  assert.equal(find('clients', b.agencyId, a.client.id), undefined,
    'agency B must not be able to read agency A’s client');

  const visibleToB = list('clients', b.agencyId);
  assert.ok(!visibleToB.some((c) => c.id === a.client.id));
});

test('one agency cannot write to another agency’s rows', () => {
  const a = freshAgency({ slug: 'iso-c' });
  const b = freshAgency({ slug: 'iso-d' });
  assert.throws(() => update('clients', b.agencyId, a.client.id, { name: 'hijacked' }), /not found/i);
  assert.equal(find('clients', a.agencyId, a.client.id).name, a.client.name);
});

test('a client-scoped user is confined to their own clients', () => {
  const { agencyId, client, user } = freshAgency({ slug: 'iso-e' });
  const other = insert('clients', { agency_id: agencyId, name: 'Other client' });

  const scoped = principalFor(agencyId, { ...user, role: 'client', client_scope: [client.id] });
  assert.doesNotThrow(() => assertClientAccess(scoped, client));
  assert.throws(() => assertClientAccess(scoped, other), /not scoped/);
});

test('a cross-agency client lookup reports not-found, never forbidden', () => {
  // Returning 403 would confirm the id exists in another tenant.
  const a = freshAgency({ slug: 'iso-f' });
  const b = freshAgency({ slug: 'iso-g' });
  const principal = principalFor(b.agencyId, b.user);
  try {
    assertClientAccess(principal, a.client);
    assert.fail('expected a throw');
  } catch (err) {
    assert.equal(err.status, 404);
  }
});

test('rawScoped refuses SQL that does not filter on agency_id', () => {
  const { agencyId } = freshAgency({ slug: 'iso-h' });
  assert.throws(() => rawScoped('SELECT * FROM clients', agencyId), /must filter on agency_id/);
  assert.throws(() => rawScoped('SELECT * FROM clients WHERE agency_id = ?', null), /requires an agency id/);
  assert.doesNotThrow(() => rawScoped('SELECT * FROM clients WHERE agency_id = ?', agencyId, [agencyId]));
});
