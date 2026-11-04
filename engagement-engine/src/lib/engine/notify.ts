import type { Db } from "@/lib/db";

export type NotificationKind =
  | "opportunities_found"
  | "approval_required"
  | "comment_published"
  | "publishing_failed"
  | "oauth_expired"
  | "integration_disconnected"
  | "campaign_paused"
  | "daily_limit_reached"
  | "daily_report"
  | "manual_action_required";

/** Who should hear about an event. Recipients are always drawn from THIS client's own memberships. */
export type Audience = "managers" | "client_approvers" | "client_owners" | "everyone";

export async function notifyClient(
  system: Db,
  p: {
    organizationId: string;
    clientId: string;
    kind: NotificationKind;
    title: string;
    body?: string;
    link?: string;
    audience: Audience[];
    excludeUserId?: string | null;
  },
): Promise<number> {
  const wants = (a: Audience) => p.audience.includes(a) || p.audience.includes("everyone");
  const rows = await system.query<{ user_id: string }>(
    `select distinct user_id from (
       select am.user_id from account_managers am where am.client_id = $1 and $2::boolean
       union
       select cu.user_id from client_users cu where cu.client_id = $1 and (
         ($3::boolean and (cu.role = 'owner' or cu.can_approve) and cu.receives_approval_requests)
         or ($4::boolean and cu.role = 'owner')
         or $5::boolean)
     ) r join users u on u.id = r.user_id
     where u.status = 'active' and u.organization_id = $6`,
    [p.clientId, wants("managers"), wants("client_approvers"), wants("client_owners"), p.audience.includes("everyone"), p.organizationId],
  );
  let recipients = rows.map((r) => r.user_id).filter((id) => id !== p.excludeUserId);
  // A client with no assigned account manager still needs someone at GBS to hear about it.
  if (wants("managers") && recipients.length === 0) {
    const admins = await system.query<{ id: string }>(
      "select id from users where organization_id = $1 and platform_role = 'super_admin' and status = 'active'",
      [p.organizationId],
    );
    recipients = admins.map((a) => a.id).filter((id) => id !== p.excludeUserId);
  }
  for (const userId of recipients) {
    await system.query(
      `insert into notifications (organization_id, client_id, user_id, kind, title, body, link) values ($1, $2, $3, $4, $5, $6, $7)`,
      [p.organizationId, p.clientId, userId, p.kind, p.title, p.body ?? null, p.link ?? null],
    );
  }
  return recipients.length;
}

export function approvalAudience(mode: "manual" | "gbs" | "dual"): Audience[] {
  return mode === "manual" ? ["client_approvers"] : mode === "gbs" ? ["managers"] : ["managers", "client_approvers"];
}
