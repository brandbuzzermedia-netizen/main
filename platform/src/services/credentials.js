import { open, seal } from '../core/crypto.js';
import { update } from '../db/repo.js';
import { getAdapter } from '../platforms/registry.js';
import { log } from '../core/logger.js';

/**
 * Credential handling.
 *
 * Tokens live sealed in the database and are opened here, in the server
 * process, for the duration of one platform call. They are never returned from
 * an API endpoint, never logged, and never written to the audit trail — see
 * docs/SECURITY.md.
 */

/**
 * @param {any} account a social_accounts row
 * @returns {import('../platforms/adapter.js').Credentials|null}
 */
export function openCredentials(account) {
  if (!account?.access_token_enc) return null;
  try {
    return {
      accessToken: /** @type {string} */ (open(account.access_token_enc)),
      refreshToken: open(account.refresh_token_enc),
      externalId: account.external_id,
      scopes: account.scopes ?? [],
    };
  } catch (err) {
    log.error('credential_open_failed', { account_id: account.id, platform: account.platform });
    return null;
  }
}

/** Store freshly granted or refreshed tokens. */
export function storeCredentials(agencyId, accountId, creds) {
  return update('social_accounts', agencyId, accountId, {
    access_token_enc: seal(creds.accessToken),
    refresh_token_enc: creds.refreshToken ? seal(creds.refreshToken) : undefined,
    token_expires_at: creds.expiresAt ?? null,
    connection_status: 'connected',
    api_status: 'ok',
    last_error: null,
    ...(creds.externalId ? { external_id: creds.externalId } : {}),
    ...(creds.handle ? { handle: creds.handle } : {}),
    ...(creds.scopes ? { scopes: creds.scopes } : {}),
  });
}

/**
 * Return usable credentials, refreshing first if the token is about to expire.
 * Returns null (and marks the account) when the account needs reconnecting.
 */
export async function usableCredentials(agencyId, account) {
  const creds = openCredentials(account);
  if (!creds) {
    update('social_accounts', agencyId, account.id, { connection_status: 'disconnected' });
    return null;
  }

  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : null;
  const expiringSoon = expiresAt !== null && expiresAt - Date.now() < 10 * 60_000;
  if (!expiringSoon) return creds;

  try {
    const adapter = getAdapter(account.platform);
    const refreshed = await adapter.refresh(creds);
    storeCredentials(agencyId, account.id, refreshed);
    log.info('token_refreshed', { account_id: account.id, platform: account.platform });
    return { ...creds, accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken ?? creds.refreshToken };
  } catch (err) {
    update('social_accounts', agencyId, account.id, {
      connection_status: 'expired',
      api_status: 'error',
      last_error: `Token refresh failed: ${String(err.message ?? err)}`,
    });
    return null;
  }
}

/**
 * The only shape a social account may take in an API response. Anything not
 * listed here — every *_enc column above all — never leaves the server.
 */
export function serializeAccount(account) {
  return {
    id: account.id,
    client_id: account.client_id,
    platform: account.platform,
    handle: account.handle,
    display_name: account.display_name,
    external_id: account.external_id,
    scopes: account.scopes ?? [],
    connection_status: account.connection_status,
    api_status: account.api_status,
    // Whether a token exists and when it expires is useful; the token is not.
    has_credentials: Boolean(account.access_token_enc),
    token_expires_at: account.token_expires_at,
    token_status: tokenStatus(account),
    last_error: account.last_error,
    last_sync_at: account.last_sync_at,
    automation_paused: Boolean(account.automation_paused),
    status: account.status,
    created_at: account.created_at,
    updated_at: account.updated_at,
  };
}

function tokenStatus(account) {
  if (!account.access_token_enc) return 'missing';
  if (!account.token_expires_at) return 'valid';
  const ms = new Date(account.token_expires_at).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  if (ms < 72 * 3_600_000) return 'expiring_soon';
  return 'valid';
}
