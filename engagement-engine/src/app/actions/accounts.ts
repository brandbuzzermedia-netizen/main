"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { withSystem } from "@/lib/db";
import { notifyClient } from "@/lib/engine/notify";
import { getAdapter, oauthConfigFor } from "@/lib/platforms/registry";
import { consumeOAuthState, readOAuthState } from "@/lib/services/oauth";
import { getCredentials, storeToken } from "@/lib/services/tokens";
import { ForbiddenError, inClient } from "@/lib/server-action";

/** Attaches the accounts the user picked to THIS client and stores their tokens bound to it. */
export async function attachAccounts(clientId: string, state: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const picked = new Set(z.array(z.string().min(1)).min(1, "Choose at least one account").parse(fd.getAll("account")));
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.canManage) throw new ForbiddenError();
      const row = await withSystem((s) => readOAuthState(s, state, user.id));
      if (!row || row.client_id !== clientId || !row.pending) throw new ForbiddenError("This connection has expired. Start again.");
      for (const acct of row.pending.filter((a) => picked.has(a.externalAccountId))) {
        const taken = await withSystem((s) =>
          s.one<{ client_id: string }>(
            `select client_id from social_accounts where organization_id = $1 and platform = $2 and external_account_id = $3 and status <> 'disconnected'`,
            [user.organizationId, acct.platform, acct.externalAccountId],
          ),
        );
        if (taken && taken.client_id !== clientId) {
          throw new ForbiddenError(`${acct.displayName ?? acct.handle} is already connected to another client. An account can belong to only one client.`);
        }
        const sa = await db.one<{ id: string }>(
          `insert into social_accounts (organization_id, client_id, platform, external_account_id, handle, display_name, account_type, scopes, metadata, connected_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           on conflict (organization_id, platform, external_account_id) where status <> 'disconnected'
           do update set status = 'connected', handle = excluded.handle, display_name = excluded.display_name, scopes = excluded.scopes,
             metadata = excluded.metadata, connected_at = now(), connected_by = excluded.connected_by
           returning id`,
          [user.organizationId, clientId, acct.platform, acct.externalAccountId, acct.handle, acct.displayName, acct.accountType, acct.token.scopes, acct.metadata, user.id],
        );
        await withSystem((s) => storeToken(s, { organizationId: user.organizationId, clientId, socialAccountId: sa!.id, token: acct.token }));
        await db.query(`insert into usage_events (organization_id, client_id, kind, platform) values ($1, $2, 'social_account_connected', $3)`, [
          user.organizationId,
          clientId,
          acct.platform,
        ]);
        await audit(db, {
          organizationId: user.organizationId,
          clientId,
          actorId: user.id,
          actorName: user.fullName,
          action: "account.connected",
          entityType: "social_account",
          entityId: sa!.id,
          details: { platform: acct.platform, name: acct.displayName ?? acct.handle },
        });
      }
      await withSystem((s) => consumeOAuthState(s, state));
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/clients/${clientId}`, "layout");
  redirect(`/clients/${clientId}/accounts?connected=1`);
}

export async function disconnectAccount(clientId: string, accountId: string): Promise<ActionResult> {
  try {
    const id = z.string().uuid().parse(accountId);
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.canManage) throw new ForbiddenError();
      const a = await db.one<{ platform: string; display_name: string | null; handle: string | null; demo: boolean }>(
        "select platform, display_name, handle, coalesce((metadata->>'demo')::boolean, false) as demo from social_accounts where id = $1 and client_id = $2",
        [id, clientId],
      );
      if (!a) throw new ForbiddenError("Account not found.");
      await withSystem(async (s) => {
        if (!a.demo) {
          const creds = await getCredentials(s, { clientId, socialAccountId: id }).catch(() => null);
          if (creds) await getAdapter(creds.platform).disconnectAccount(creds, oauthConfigFor(creds.platform) ?? undefined).catch(() => {});
        }
        await s.query("delete from oauth_tokens where social_account_id = $1 and client_id = $2", [id, clientId]);
      });
      await db.query("update social_accounts set status = 'disconnected' where id = $1 and client_id = $2", [id, clientId]);
      await audit(db, {
        organizationId: user.organizationId,
        clientId,
        actorId: user.id,
        actorName: user.fullName,
        action: "account.disconnected",
        entityType: "social_account",
        entityId: id,
        details: { platform: a.platform },
      });
      await withSystem((s) =>
        notifyClient(s, {
          organizationId: user.organizationId,
          clientId,
          kind: "integration_disconnected",
          title: `${a.platform} account ${a.display_name ?? a.handle ?? ""} was disconnected`,
          link: `/clients/${clientId}/accounts`,
          audience: ["managers", "client_owners"],
          excludeUserId: user.id,
        }),
      );
    });
    revalidatePath(`/clients/${clientId}`, "layout");
    return { ok: true, message: "Disconnected. Its token was deleted." };
  } catch (e) {
    return toActionError(e);
  }
}
