import { createHash } from "node:crypto";
import type { Db } from "@/lib/db";
import { decryptSecret, encryptSecret, randomToken, sha256 } from "@/lib/security/crypto";
import type { ConnectableAccount, Platform } from "@/lib/platforms/types";

const stateBinding = (stateHash: string) => `gbs-oauth-state:v1:${stateHash}`;

export function pkcePair() {
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function createOAuthState(system: Db, p: { organizationId: string; clientId: string; userId: string; platform: Platform; verifier: string }) {
  const state = randomToken(32);
  const hash = sha256(state);
  await system.query(
    `insert into oauth_states (state_hash, organization_id, client_id, user_id, platform, code_verifier, expires_at)
     values ($1, $2, $3, $4, $5, $6, now() + interval '15 minutes')`,
    [hash, p.organizationId, p.clientId, p.userId, p.platform, encryptSecret(p.verifier, stateBinding(hash))],
  );
  await system.query("delete from oauth_states where expires_at < now() - interval '1 day'");
  return state;
}

export interface OAuthStateRow {
  state_hash: string;
  organization_id: string;
  client_id: string;
  user_id: string;
  platform: Platform;
  verifier: string;
  pending: ConnectableAccount[] | null;
}

/** Loads a state the given user created, that hasn't expired or been used. */
export async function readOAuthState(system: Db, state: string, userId: string): Promise<OAuthStateRow | null> {
  const hash = sha256(state);
  const r = await system.one<{
    state_hash: string;
    organization_id: string;
    client_id: string;
    user_id: string;
    platform: Platform;
    code_verifier: string | null;
    pending_accounts_enc: string | null;
  }>(
    `select state_hash, organization_id, client_id, user_id, platform, code_verifier, pending_accounts_enc
     from oauth_states where state_hash = $1 and expires_at > now() and consumed_at is null`,
    [hash],
  );
  if (!r || r.user_id !== userId) return null;
  const b = stateBinding(hash);
  return {
    ...r,
    verifier: r.code_verifier ? decryptSecret(r.code_verifier, b) : "",
    pending: r.pending_accounts_enc ? (JSON.parse(decryptSecret(r.pending_accounts_enc, b)) as ConnectableAccount[]) : null,
  };
}

export async function storePendingAccounts(system: Db, state: string, accounts: ConnectableAccount[]) {
  const hash = sha256(state);
  await system.query(`update oauth_states set pending_accounts_enc = $2, expires_at = now() + interval '15 minutes' where state_hash = $1`, [
    hash,
    encryptSecret(JSON.stringify(accounts), stateBinding(hash)),
  ]);
}

export async function consumeOAuthState(system: Db, state: string) {
  await system.query(`update oauth_states set consumed_at = now(), pending_accounts_enc = null where state_hash = $1`, [sha256(state)]);
}
