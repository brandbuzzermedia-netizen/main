import type { Db } from "@/lib/db";
import { decryptSecret, encryptSecret, tokenBinding } from "@/lib/security/crypto";
import { getAdapter, oauthConfigFor } from "@/lib/platforms/registry";
import type { AccountCredentials, Platform, TokenSet } from "@/lib/platforms/types";

/**
 * OAuth token storage. Must be called with the SYSTEM connection (gbs_app has no access
 * to oauth_tokens). Every read is keyed by both client_id and social_account_id, and the
 * ciphertext is bound to that pair, so one client's token can never serve another client.
 */
export async function storeToken(
  system: Db,
  p: { organizationId: string; clientId: string; socialAccountId: string; token: TokenSet },
): Promise<void> {
  const binding = tokenBinding(p.clientId, p.socialAccountId);
  await system.query(
    `insert into oauth_tokens (organization_id, client_id, social_account_id, access_token_enc, refresh_token_enc, expires_at, refresh_expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (social_account_id) do update set
       access_token_enc = excluded.access_token_enc,
       refresh_token_enc = coalesce(excluded.refresh_token_enc, oauth_tokens.refresh_token_enc),
       expires_at = excluded.expires_at,
       refresh_expires_at = excluded.refresh_expires_at,
       updated_at = now()
     where oauth_tokens.client_id = excluded.client_id`,
    [
      p.organizationId,
      p.clientId,
      p.socialAccountId,
      encryptSecret(p.token.accessToken, binding),
      p.token.refreshToken ? encryptSecret(p.token.refreshToken, binding) : null,
      p.token.expiresAt ?? null,
      p.token.refreshExpiresAt ?? null,
    ],
  );
}

export class CredentialsUnavailableError extends Error {}

export async function getCredentials(system: Db, p: { clientId: string; socialAccountId: string }): Promise<AccountCredentials & { platform: Platform }> {
  const row = await system.one<{
    id: string;
    client_id: string;
    organization_id: string;
    platform: Platform;
    external_account_id: string;
    handle: string | null;
    status: string;
    metadata: Record<string, unknown>;
    access_token_enc: string;
    refresh_token_enc: string | null;
    expires_at: Date | null;
    token_client_id: string;
  }>(
    `select sa.id, sa.client_id, sa.organization_id, sa.platform, sa.external_account_id, sa.handle, sa.status, sa.metadata,
            t.access_token_enc, t.refresh_token_enc, t.expires_at, t.client_id as token_client_id
     from social_accounts sa join oauth_tokens t on t.social_account_id = sa.id and t.client_id = sa.client_id
     where sa.id = $1 and sa.client_id = $2`,
    [p.socialAccountId, p.clientId],
  );
  if (!row || row.client_id !== p.clientId || row.token_client_id !== p.clientId) {
    throw new CredentialsUnavailableError("No credentials for this client's account.");
  }
  if (row.status !== "connected") throw new CredentialsUnavailableError(`Account is ${row.status}. Reconnect it to continue.`);
  const binding = tokenBinding(p.clientId, p.socialAccountId);
  let accessToken = decryptSecret(row.access_token_enc, binding);

  // Refresh tokens that expire within 10 minutes, where the platform supports refresh.
  if (row.expires_at && row.expires_at.getTime() - Date.now() < 10 * 60_000) {
    const config = oauthConfigFor(row.platform);
    const refresh = row.refresh_token_enc ? decryptSecret(row.refresh_token_enc, binding) : null;
    const next = config && refresh ? await getAdapter(row.platform).refreshToken(refresh, config).catch(() => null) : null;
    if (!next) {
      await system.query("update social_accounts set status = 'expired' where id = $1 and client_id = $2", [row.id, row.client_id]);
      throw new CredentialsUnavailableError("The access token has expired. Reconnect the account.");
    }
    await storeToken(system, { organizationId: row.organization_id, clientId: row.client_id, socialAccountId: row.id, token: next });
    accessToken = next.accessToken;
  }

  return {
    clientId: row.client_id,
    socialAccountId: row.id,
    externalAccountId: row.external_account_id,
    accessToken,
    platform: row.platform,
    metadata: { ...row.metadata, handle: row.handle },
  };
}
