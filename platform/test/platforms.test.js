import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAdapter, PLATFORMS, capabilityMatrix } from '../src/platforms/registry.js';
import { PlatformAdapter } from '../src/platforms/adapter.js';
import { ManualActionRequired } from '../src/core/errors.js';

/** Adapter contract and the "never work around a platform" rule (§2, §55). */

test('every named platform has a registered adapter', () => {
  const expected = ['instagram', 'facebook', 'linkedin', 'x', 'reddit', 'quora', 'threads', 'youtube'];
  assert.deepEqual([...PLATFORMS].sort(), expected.sort());
  for (const platform of expected) {
    assert.ok(getAdapter(platform) instanceof PlatformAdapter);
  }
});

test('an unknown platform is rejected, not silently ignored', () => {
  assert.throws(() => getAdapter('myspace'), /Unknown platform/);
});

test('every adapter declares a complete capability matrix', () => {
  for (const entry of capabilityMatrix()) {
    const c = entry.capabilities;
    assert.ok(Array.isArray(c.publish), `${entry.platform} must declare publishable types`);
    for (const key of ['comment', 'readPublicSearch', 'readOwnInsights', 'readMentions', 'scheduleNatively']) {
      assert.equal(typeof c[key], 'boolean', `${entry.platform}.${key} must be a boolean`);
    }
  }
});

test('an unsupported content type raises MANUAL_ACTION_REQUIRED with guidance', async () => {
  const instagram = getAdapter('instagram');
  assert.equal(instagram.supportsPublishing('text'), false);
  await assert.rejects(
    instagram.publish({ accessToken: 'x' }, { contentType: 'text', caption: 'hi' }),
    (err) => {
      assert.ok(err instanceof ManualActionRequired);
      assert.equal(err.code, 'manual_action_required');
      assert.equal(err.platform, 'instagram');
      assert.ok(err.howTo, 'a manual-action error must tell the operator what to do instead');
      return true;
    },
  );
});

test('Instagram stories are manual, not worked around', async () => {
  const instagram = getAdapter('instagram');
  assert.equal(instagram.supportsPublishing('story'), false);
  assert.match(instagram.capabilities.notes.story, /Instagram app/);
});

test('Quora reports manual action for every write path and never scrapes', async () => {
  const quora = getAdapter('quora');
  assert.deepEqual(quora.capabilities.publish, []);
  assert.equal(quora.capabilities.comment, false);
  assert.equal(quora.capabilities.readPublicSearch, false);

  await assert.rejects(quora.publish(), ManualActionRequired);
  await assert.rejects(quora.publishComment(), ManualActionRequired);
  assert.throws(() => quora.authorizeUrl({}), ManualActionRequired);
  assert.deepEqual(await quora.searchPublic(), [], 'search must return nothing, not scraped results');
});

test('platforms without a public-search API return nothing rather than improvising', async () => {
  for (const platform of ['instagram', 'facebook', 'linkedin', 'threads']) {
    const adapter = getAdapter(platform);
    assert.equal(adapter.capabilities.readPublicSearch, false);
    assert.deepEqual(await adapter.searchPublic(null, { query: 'anything' }), []);
  }
});

test('OAuth is refused when the deployment has no app credentials', () => {
  const previous = process.env.META_APP_ID;
  delete process.env.META_APP_ID;
  assert.throws(
    () => getAdapter('instagram').authorizeUrl({ state: 's', redirectUri: 'https://x.test/cb' }),
    /META_APP_ID/,
  );
  if (previous !== undefined) process.env.META_APP_ID = previous;
});

test('authorisation URLs request only the declared scopes', () => {
  process.env.META_APP_ID = 'test-app-id';
  const url = new URL(getAdapter('facebook').authorizeUrl({ state: 'abc', redirectUri: 'https://x.test/cb' }));
  assert.equal(url.searchParams.get('client_id'), 'test-app-id');
  assert.equal(url.searchParams.get('state'), 'abc');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.deepEqual(
    url.searchParams.get('scope').split(','),
    /** @type {any} */ (getAdapter('facebook').constructor).requiredScopes,
  );
  delete process.env.META_APP_ID;
});

test('X uses PKCE with an S256 challenge', async () => {
  const { XAdapter } = await import('../src/platforms/x.js');
  const { verifier, challenge } = XAdapter.pkce();
  assert.ok(verifier.length > 40);
  assert.notEqual(verifier, challenge);
});

test('a post over the X character limit becomes a manual action, not a truncated post', async () => {
  await assert.rejects(
    getAdapter('x').publish({ accessToken: 't' }, { contentType: 'text', caption: 'x'.repeat(400) }),
    (err) => {
      assert.ok(err instanceof ManualActionRequired);
      assert.match(err.message, /280/);
      return true;
    },
  );
});
