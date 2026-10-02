import type { Db, DbRunner } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { ClientAccess, SessionUser } from "@/lib/auth/types";
import { loadClientAiContext } from "@/lib/ai/context";
import { getEmbedder } from "@/lib/ai/embeddings";
import { getAdapter } from "@/lib/platforms/registry";
import { approverSide, bulkApprovable, isFullyApproved, type ApprovalMode, type ApprovalSide } from "./approvals";
import { loadHistory, loadOpportunity, qualityFor } from "./generate";
import { approvalAudience, notifyClient, type NotificationKind } from "./notify";

export class WorkflowError extends Error {}

interface CommentRow {
  id: string;
  organization_id: string;
  client_id: string;
  campaign_id: string;
  opportunity_id: string;
  social_account_id: string | null;
  platform: string;
  status: string;
  current_text: string;
  quality_passed: boolean;
  approval_mode: ApprovalMode;
  publish_on_approval: boolean;
  client_name: string;
}

async function loadComment(db: Db, clientId: string, commentId: string): Promise<CommentRow> {
  const c = await db.one<CommentRow>(
    `select c.id, c.organization_id, c.client_id, c.campaign_id, c.opportunity_id, c.social_account_id, c.platform, c.status,
            c.current_text, c.quality_passed, coalesce(ca.approval_mode, cl.approval_mode) as approval_mode,
            cl.publish_on_approval, cl.name as client_name
     from comments c
     join campaigns ca on ca.id = c.campaign_id and ca.client_id = c.client_id
     join clients cl on cl.id = c.client_id
     where c.id = $1 and c.client_id = $2`,
    [commentId, clientId],
  );
  if (!c) throw new WorkflowError("Comment not found.");
  return c;
}

type Notice = { kind: NotificationKind; title: string; body?: string; link: string; audience: Parameters<typeof notifyClient>[1]["audience"] };

/** Collects notifications during a user transaction and sends them via the system connection afterwards. */
export class Outbox {
  notices: (Notice & { organizationId: string; clientId: string; excludeUserId?: string })[] = [];
  push(n: Outbox["notices"][number]) {
    this.notices.push(n);
  }
  async flush(system: DbRunner) {
    if (!this.notices.length) return;
    await system(async (db) => {
      for (const n of this.notices) await notifyClient(db, n);
    });
  }
}

function actor(user: SessionUser) {
  return { actorId: user.id, actorName: user.fullName, organizationId: user.organizationId };
}

// ───────────────────────────── Submit ─────────────────────────────

export async function submitForApproval(db: Db, user: SessionUser, access: ClientAccess, commentId: string, outbox: Outbox) {
  if (!access.canManage && !access.isGbsManager) throw new WorkflowError("You can't submit comments for approval.");
  const c = await loadComment(db, access.clientId, commentId);
  if (c.status !== "generated") throw new WorkflowError("Only generated comments can be submitted.");
  await db.query(
    `update comments set status = 'superseded', is_selected = false
     where opportunity_id = $1 and client_id = $2 and id <> $3 and status in ('generated','pending_approval')`,
    [c.opportunity_id, c.client_id, c.id],
  );
  await db.query(`update comments set status = 'pending_approval', is_selected = true where id = $1 and client_id = $2`, [c.id, c.client_id]);
  await db.query(`update engagement_opportunities set status = 'pending_approval', updated_at = now() where id = $1 and client_id = $2`, [
    c.opportunity_id,
    c.client_id,
  ]);
  await audit(db, { ...actor(user), clientId: c.client_id, campaignId: c.campaign_id, action: "comment.submitted", entityType: "comment", entityId: c.id });
  outbox.push({
    organizationId: c.organization_id,
    clientId: c.client_id,
    kind: "approval_required",
    title: `${c.client_name}: a comment needs approval`,
    body: c.current_text.slice(0, 140),
    link: `/clients/${c.client_id}/approvals`,
    audience: approvalAudience(c.approval_mode),
    excludeUserId: user.id,
  });
}

// ───────────────────────────── Edit / suggest ─────────────────────────────

export async function editComment(db: Db, user: SessionUser, access: ClientAccess, commentId: string, newText: string, note?: string) {
  const text = newText.trim();
  if (text.length < 2) throw new WorkflowError("Comment text is empty.");
  const c = await loadComment(db, access.clientId, commentId);
  if (!["generated", "pending_approval"].includes(c.status)) throw new WorkflowError("Approved comments can no longer be edited.");
  if (text === c.current_text) return { kind: "unchanged" as const };

  if (!access.canEditComments) {
    await db.query(
      `insert into comment_edits (organization_id, client_id, comment_id, kind, previous_text, new_text, note, suggestion_status, editor_id)
       values ($1, $2, $3, 'suggestion', $4, $5, $6, 'open', $7)`,
      [c.organization_id, c.client_id, c.id, c.current_text, text, note ?? null, user.id],
    );
    await audit(db, { ...actor(user), clientId: c.client_id, campaignId: c.campaign_id, action: "comment.suggested", entityType: "comment", entityId: c.id });
    return { kind: "suggested" as const };
  }

  // Re-run quality checks on the edited text, using this client's own history.
  const opp = await loadOpportunity(db, c.client_id, c.opportunity_id);
  const ctx = await loadClientAiContext(db, { clientId: c.client_id, campaignId: c.campaign_id });
  const embedder = getEmbedder();
  const [vector] = await embedder.embed([text]);
  const history = (await loadHistory(db, c.client_id)).filter((h) => h.text !== c.current_text);
  const report = qualityFor(ctx, opp!, getAdapter(opp!.platform).commentRules, text, vector, embedder.model, history);

  await db.query(
    `insert into comment_edits (organization_id, client_id, comment_id, kind, previous_text, new_text, note, editor_id)
     values ($1, $2, $3, 'edit', $4, $5, $6, $7)`,
    [c.organization_id, c.client_id, c.id, c.current_text, text, note ?? null, user.id],
  );
  // The comments_guard trigger marks the comment edited and clears approvals given on the old text.
  await db.query(
    `update comments set current_text = $3, quality_score = $4, quality_passed = $5, quality_report = $6, embedding = $7, embedding_model = $8
     where id = $1 and client_id = $2`,
    [c.id, c.client_id, text, report.score, report.passed, JSON.stringify(report), vector, embedder.model],
  );
  await audit(db, {
    ...actor(user),
    clientId: c.client_id,
    campaignId: c.campaign_id,
    action: "comment.edited",
    entityType: "comment",
    entityId: c.id,
    details: { quality: report.score },
  });
  return { kind: "edited" as const, report };
}

export async function acceptSuggestion(db: Db, user: SessionUser, access: ClientAccess, editId: string) {
  const s = await db.one<{ id: string; comment_id: string; new_text: string }>(
    `select id, comment_id, new_text from comment_edits where id = $1 and client_id = $2 and kind = 'suggestion' and suggestion_status = 'open'`,
    [editId, access.clientId],
  );
  if (!s) throw new WorkflowError("Suggestion not found.");
  const r = await editComment(db, user, access, s.comment_id, s.new_text, "Accepted suggestion");
  await db.query(`update comment_edits set suggestion_status = 'accepted' where id = $1 and client_id = $2`, [s.id, access.clientId]);
  return r;
}

// ───────────────────────────── Approve / reject ─────────────────────────────

export type ApproveOutcome = "approved" | "awaiting_other_side";

export async function approveComment(
  db: Db,
  user: SessionUser,
  access: ClientAccess,
  commentId: string,
  outbox: Outbox,
  opts: { requireQualityPass?: boolean } = {},
): Promise<ApproveOutcome> {
  const c = await loadComment(db, access.clientId, commentId);
  if (c.status !== "pending_approval") throw new WorkflowError("This comment isn't awaiting approval.");
  if (opts.requireQualityPass && !bulkApprovable(c)) throw new WorkflowError("Comment hasn't passed quality checks.");
  const side = approverSide(access, c.approval_mode);
  if (!side) throw new WorkflowError("You aren't an approver for this client's approval mode.");

  await db.query(
    `insert into comment_approvals (organization_id, client_id, comment_id, approver_id, approver_side, decision)
     values ($1, $2, $3, $4, $5, 'approved') on conflict (comment_id, approver_side, decision) do nothing`,
    [c.organization_id, c.client_id, c.id, user.id, side],
  );
  const sides = (
    await db.query<{ approver_side: ApprovalSide }>(
      `select approver_side from comment_approvals where comment_id = $1 and client_id = $2 and decision = 'approved'`,
      [c.id, c.client_id],
    )
  ).map((r) => r.approver_side);

  await audit(db, {
    ...actor(user),
    clientId: c.client_id,
    campaignId: c.campaign_id,
    action: "comment.approved",
    entityType: "comment",
    entityId: c.id,
    details: { side, mode: c.approval_mode },
  });

  if (!isFullyApproved(c.approval_mode, sides)) {
    outbox.push({
      organizationId: c.organization_id,
      clientId: c.client_id,
      kind: "approval_required",
      title: `${c.client_name}: approved by ${side === "gbs" ? "GBS" : "client"}, awaiting ${side === "gbs" ? "client" : "GBS"} approval`,
      body: c.current_text.slice(0, 140),
      link: `/clients/${c.client_id}/approvals`,
      audience: side === "gbs" ? ["client_approvers"] : ["managers"],
      excludeUserId: user.id,
    });
    return "awaiting_other_side";
  }

  await db.query(`update comments set status = 'approved', approved_by = $3 where id = $1 and client_id = $2`, [c.id, c.client_id, user.id]);
  await db.query(`update engagement_opportunities set status = 'approved', updated_at = now() where id = $1 and client_id = $2`, [
    c.opportunity_id,
    c.client_id,
  ]);
  if (c.publish_on_approval) await enqueuePublishing(db, user, access, c.id);
  return "approved";
}

export async function bulkApprove(db: Db, user: SessionUser, access: ClientAccess, ids: string[], outbox: Outbox) {
  const results: { id: string; outcome: ApproveOutcome | "skipped"; reason?: string }[] = [];
  for (const id of ids) {
    try {
      results.push({ id, outcome: await approveComment(db, user, access, id, outbox, { requireQualityPass: true }) });
    } catch (e) {
      if (!(e instanceof WorkflowError)) throw e;
      results.push({ id, outcome: "skipped", reason: e.message });
    }
  }
  return results;
}

export async function rejectComment(db: Db, user: SessionUser, access: ClientAccess, commentId: string, reason: string) {
  const c = await loadComment(db, access.clientId, commentId);
  if (!["generated", "pending_approval", "approved", "failed"].includes(c.status)) {
    throw new WorkflowError("This comment can no longer be rejected.");
  }
  const side = approverSide(access, c.approval_mode) ?? (access.canApproveGbs ? "gbs" : access.canApproveClient ? "client" : null);
  if (!side) throw new WorkflowError("You can't reject comments for this client.");
  await db.query(
    `insert into comment_approvals (organization_id, client_id, comment_id, approver_id, approver_side, decision, note)
     values ($1, $2, $3, $4, $5, 'rejected', $6) on conflict (comment_id, approver_side, decision) do nothing`,
    [c.organization_id, c.client_id, c.id, user.id, side, reason || null],
  );
  await db.query(
    `update comments set status = 'rejected', rejected_at = now(), rejected_by = $3, rejection_reason = $4 where id = $1 and client_id = $2`,
    [c.id, c.client_id, user.id, reason || null],
  );
  await db.query(`update engagement_opportunities set status = 'rejected', updated_at = now() where id = $1 and client_id = $2`, [
    c.opportunity_id,
    c.client_id,
  ]);
  await audit(db, {
    ...actor(user),
    clientId: c.client_id,
    campaignId: c.campaign_id,
    action: "comment.rejected",
    entityType: "comment",
    entityId: c.id,
    details: { reason },
  });
}

// ───────────────────────────── Publishing queue ─────────────────────────────

export async function enqueuePublishing(db: Db, user: SessionUser, access: ClientAccess, commentId: string, scheduledFor?: Date) {
  if (!access.canApproveGbs && !access.canApproveClient) throw new WorkflowError("You can't schedule publishing for this client.");
  const c = await loadComment(db, access.clientId, commentId);
  if (c.status !== "approved") throw new WorkflowError("Only approved comments can be queued.");
  const account =
    c.social_account_id ??
    (
      await db.one<{ id: string }>(
        `select id from social_accounts where client_id = $1 and platform = $2 and status = 'connected' order by connected_at limit 1`,
        [c.client_id, c.platform],
      )
    )?.id ??
    null;
  await db.query(
    `insert into publishing_jobs (organization_id, client_id, comment_id, social_account_id, platform, scheduled_for, approved_by, created_by)
     values ($1, $2, $3, $4, $5, $6, (select approved_by from comments where id = $3), $7)`,
    [c.organization_id, c.client_id, c.id, account, c.platform, scheduledFor ?? new Date(), user.id],
  );
  await db.query(`update comments set status = 'queued', social_account_id = coalesce(social_account_id, $3) where id = $1 and client_id = $2`, [
    c.id,
    c.client_id,
    account,
  ]);
  await db.query(`update engagement_opportunities set status = 'queued', updated_at = now() where id = $1 and client_id = $2`, [
    c.opportunity_id,
    c.client_id,
  ]);
  await audit(db, { ...actor(user), clientId: c.client_id, campaignId: c.campaign_id, action: "publishing.queued", entityType: "comment", entityId: c.id });
}

export async function cancelPublishing(db: Db, user: SessionUser, access: ClientAccess, jobId: string) {
  const j = await db.one<{ id: string; comment_id: string; status: string; campaign_id: string }>(
    `select j.id, j.comment_id, j.status, c.campaign_id from publishing_jobs j join comments c on c.id = j.comment_id and c.client_id = j.client_id
     where j.id = $1 and j.client_id = $2`,
    [jobId, access.clientId],
  );
  if (!j || !["queued", "manual_required", "failed"].includes(j.status)) throw new WorkflowError("This job can't be cancelled.");
  await db.query(
    `update comments set status = case when status = 'failed' then 'rejected' else 'approved' end where id = $1 and client_id = $2`,
    [j.comment_id, access.clientId],
  );
  await db.query(`delete from publishing_jobs where id = $1 and client_id = $2`, [j.id, access.clientId]);
  await audit(db, { ...actor(user), clientId: access.clientId, campaignId: j.campaign_id, action: "publishing.cancelled", entityType: "comment", entityId: j.comment_id });
}

export async function retryPublishing(db: Db, user: SessionUser, access: ClientAccess, jobId: string) {
  const j = await db.one<{ id: string; comment_id: string; status: string }>(
    `select id, comment_id, status from publishing_jobs where id = $1 and client_id = $2`,
    [jobId, access.clientId],
  );
  if (!j || j.status !== "failed") throw new WorkflowError("Only failed jobs can be retried.");
  await db.query(
    `update publishing_jobs set status = 'queued', attempts = 0, last_error = null, scheduled_for = now(), updated_at = now()
     where id = $1 and client_id = $2`,
    [j.id, access.clientId],
  );
  await db.query(`update comments set status = 'queued' where id = $1 and client_id = $2`, [j.comment_id, access.clientId]);
  await audit(db, { ...actor(user), clientId: access.clientId, action: "publishing.retried", entityType: "comment", entityId: j.comment_id });
}

/** A person posted the approved comment themselves (API couldn't); record it so analytics stay complete. */
export async function recordManualPublication(db: Db, user: SessionUser, access: ClientAccess, jobId: string, url: string) {
  if (!access.canEditComments && !access.canApproveClient) throw new WorkflowError("You can't record publications for this client.");
  const j = await db.one<{ id: string; comment_id: string; status: string; organization_id: string; campaign_id: string; opportunity_id: string }>(
    `select j.id, j.comment_id, j.status, j.organization_id, c.campaign_id, c.opportunity_id
     from publishing_jobs j join comments c on c.id = j.comment_id and c.client_id = j.client_id
     where j.id = $1 and j.client_id = $2`,
    [jobId, access.clientId],
  );
  if (!j || !["manual_required", "queued", "failed"].includes(j.status)) throw new WorkflowError("This job can't be marked as published.");
  if (j.status === "failed") await db.query(`update comments set status = 'queued' where id = $1 and client_id = $2`, [j.comment_id, access.clientId]);
  await db.query(`update publishing_jobs set status = 'published', updated_at = now() where id = $1 and client_id = $2`, [j.id, access.clientId]);
  await db.query(
    `update comments set status = 'published', published_at = now(), external_url = $3 where id = $1 and client_id = $2`,
    [j.comment_id, access.clientId, url],
  );
  await db.query(`update engagement_opportunities set status = 'published', updated_at = now() where id = $1 and client_id = $2`, [
    j.opportunity_id,
    access.clientId,
  ]);
  await db.query(
    `insert into publishing_results (organization_id, client_id, job_id, comment_id, success, method, external_url, recorded_by)
     values ($1, $2, $3, $4, true, 'manual', $5, $6)`,
    [j.organization_id, access.clientId, j.id, j.comment_id, url, user.id],
  );
  await db.query(
    `insert into usage_events (organization_id, client_id, kind, quantity, metadata) values ($1, $2, 'comment_published', 1, '{"method":"manual"}')`,
    [j.organization_id, access.clientId],
  );
  await audit(db, {
    ...actor(user),
    clientId: access.clientId,
    campaignId: j.campaign_id,
    action: "comment.published_manually",
    entityType: "comment",
    entityId: j.comment_id,
    details: { url },
  });
}
