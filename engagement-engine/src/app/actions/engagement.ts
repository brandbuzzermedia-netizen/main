"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { requireClientAccess } from "@/lib/auth/session";
import { systemRunner, userRunner, withUser } from "@/lib/db";
import { addManualOpportunity } from "@/lib/engine/discovery";
import { generateForOpportunity } from "@/lib/engine/generate";
import { processDueJobs } from "@/lib/engine/publisher";
import {
  acceptSuggestion,
  approveComment,
  bulkApprove,
  cancelPublishing,
  editComment,
  enqueuePublishing,
  Outbox,
  recordManualPublication,
  rejectComment,
  retryPublishing,
  submitForApproval,
} from "@/lib/engine/workflow";
import { ForbiddenError, inClient, optStr, rateLimit, str } from "@/lib/server-action";

const uuid = z.string().uuid();
const refresh = (clientId: string) => revalidatePath(`/clients/${clientId}`, "layout");

async function withOutbox<T>(fn: (o: Outbox) => Promise<T>): Promise<T> {
  const o = new Outbox();
  const r = await fn(o);
  await o.flush(systemRunner);
  return r;
}

// ───────────── Opportunities ─────────────

export async function addOpportunity(clientId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const input = {
      campaignId: uuid.parse(fd.get("campaign_id")),
      platform: z.enum(["instagram", "facebook", "linkedin", "youtube"]).parse(fd.get("platform")),
      url: z.string().url().max(500).parse(str(fd.get("url"), 500)),
      content: z.string().min(10, "Paste the post text (at least a sentence)").max(5000).parse(str(fd.get("content"), 5000)),
      authorHandle: optStr(fd.get("author_handle"), 120)?.replace(/^@/, "") ?? null,
      authorName: optStr(fd.get("author_name"), 120),
      authorBio: optStr(fd.get("author_bio"), 500),
      authorFollowers: fd.get("author_followers") ? z.coerce.number().int().min(0).parse(fd.get("author_followers")) : null,
    };
    const r = await inClient(clientId, async ({ db, user, access }) => {
      if (!access.canManage) throw new ForbiddenError("Only GBS and the client owner can add opportunities.");
      return addManualOpportunity(db, clientId, input.campaignId, input, { id: user.id, name: user.fullName });
    });
    refresh(clientId);
    if (!r.created) return { ok: false, message: r.reason ?? "That post is already an opportunity in this campaign." };
    return { ok: true, message: `Added — scored ${r.score}/100.`, data: { id: r.opportunityId } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function dismissOpportunity(clientId: string, opportunityId: string): Promise<ActionResult> {
  try {
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.canManage) throw new ForbiddenError();
      await db.query(
        `update engagement_opportunities set status = 'dismissed', updated_at = now() where id = $1 and client_id = $2 and status in ('discovered','analyzed','comment_generated','rejected')`,
        [uuid.parse(opportunityId), clientId],
      );
      await db.query(`update comments set status = 'superseded' where opportunity_id = $1 and client_id = $2 and status = 'generated'`, [opportunityId, clientId]);
      await audit(db, { organizationId: user.organizationId, clientId, actorId: user.id, actorName: user.fullName, action: "opportunity.dismissed", entityType: "opportunity", entityId: opportunityId });
    });
    refresh(clientId);
    return { ok: true, message: "Dismissed." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function generateComments(clientId: string, opportunityId: string, _p?: ActionResult, fd?: FormData): Promise<ActionResult> {
  try {
    const { user, access } = await requireClientAccess(clientId);
    if (!access.canManage) throw new ForbiddenError("Only GBS and the client owner can generate comments.");
    await rateLimit(`generate:${user.id}`, 60, 3600);
    const note = fd ? optStr(fd.get("note"), 500) : null;
    await generateForOpportunity(userRunner(user.id), {
      clientId,
      opportunityId: uuid.parse(opportunityId),
      actor: { id: user.id, name: user.fullName },
      regenerationNote: note,
    });
    refresh(clientId);
    return { ok: true, message: note ? "Regenerated three new options." : "Generated three comments and ran quality checks." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Regenerate from the approval queue: new drafts replace the pending one, which must be re-submitted. */
export async function regenerateComment(clientId: string, commentId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const opp = await inClient(clientId, async ({ db, access }) => {
      if (!access.canManage && !access.canEditComments) throw new ForbiddenError();
      const c = await db.one<{ opportunity_id: string }>("select opportunity_id from comments where id = $1 and client_id = $2", [uuid.parse(commentId), clientId]);
      if (!c) throw new ForbiddenError("Comment not found.");
      return c.opportunity_id;
    });
    const r = await generateComments(clientId, opp, null, fd);
    if (r?.ok) r.message = "Regenerated. Pick a version on the opportunity and submit it for approval.";
    return r;
  } catch (e) {
    return toActionError(e);
  }
}

// ───────────── Comments ─────────────

export async function submitComment(clientId: string, commentId: string): Promise<ActionResult> {
  try {
    await withOutbox((o) => inClient(clientId, ({ db, user, access }) => submitForApproval(db, user, access, uuid.parse(commentId), o)));
    refresh(clientId);
    return { ok: true, message: "Sent for approval." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveCommentEdit(clientId: string, commentId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const text = z.string().min(2).max(5000).parse(str(fd.get("text"), 5000));
    const r = await inClient(clientId, ({ db, user, access }) => editComment(db, user, access, uuid.parse(commentId), text, optStr(fd.get("note"), 500) ?? undefined));
    refresh(clientId);
    if (r.kind === "suggested") return { ok: true, message: "Suggestion sent to the approvers." };
    if (r.kind === "unchanged") return { ok: true, message: "No changes." };
    return { ok: true, message: `Saved. Quality ${r.report.score}/100${r.report.passed ? "" : " — check the warnings"}.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resolveSuggestion(clientId: string, editId: string, accept: boolean): Promise<ActionResult> {
  try {
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.canEditComments) throw new ForbiddenError();
      if (accept) await acceptSuggestion(db, user, access, uuid.parse(editId));
      else await db.query("update comment_edits set suggestion_status = 'dismissed' where id = $1 and client_id = $2", [editId, clientId]);
    });
    refresh(clientId);
    return { ok: true, message: accept ? "Suggestion applied." : "Suggestion dismissed." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function approve(clientId: string, commentId: string): Promise<ActionResult> {
  try {
    const outcome = await withOutbox((o) => inClient(clientId, ({ db, user, access }) => approveComment(db, user, access, uuid.parse(commentId), o)));
    refresh(clientId);
    return { ok: true, message: outcome === "approved" ? "Approved." : "Your approval is recorded. Waiting for the other approver." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function approveSelected(clientId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const ids = z.array(uuid).min(1, "Select at least one comment").max(100).parse(fd.getAll("ids"));
    const confirmed = z.coerce.number().int().parse(fd.get("confirmed_count"));
    if (confirmed !== ids.length) throw new ForbiddenError("Selection changed. Review and confirm again.");
    const results = await withOutbox((o) => inClient(clientId, ({ db, user, access }) => bulkApprove(db, user, access, ids, o)));
    refresh(clientId);
    const done = results.filter((r) => r.outcome !== "skipped").length;
    const skipped = results.length - done;
    return { ok: done > 0, message: `Approved ${done} comment${done === 1 ? "" : "s"}.${skipped ? ` Skipped ${skipped} (not quality-passed or not awaiting your approval).` : ""}` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reject(clientId: string, commentId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const reason = str(fd.get("reason"), 500);
    await inClient(clientId, ({ db, user, access }) => rejectComment(db, user, access, uuid.parse(commentId), reason));
    refresh(clientId);
    return { ok: true, message: "Rejected." };
  } catch (e) {
    return toActionError(e);
  }
}

// ───────────── Publishing ─────────────

export async function queueComment(clientId: string, commentId: string, _p?: ActionResult, fd?: FormData): Promise<ActionResult> {
  try {
    const when = fd ? optStr(fd.get("scheduled_for"), 40) : null;
    const at = when ? new Date(when) : undefined;
    if (at && Number.isNaN(at.getTime())) throw new ForbiddenError("Invalid schedule time.");
    await inClient(clientId, ({ db, user, access }) => enqueuePublishing(db, user, access, uuid.parse(commentId), at));
    refresh(clientId);
    return { ok: true, message: "Added to the publishing queue." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelJob(clientId: string, jobId: string): Promise<ActionResult> {
  try {
    await inClient(clientId, ({ db, user, access }) => cancelPublishing(db, user, access, uuid.parse(jobId)));
    refresh(clientId);
    return { ok: true, message: "Removed from the queue." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function retryJob(clientId: string, jobId: string): Promise<ActionResult> {
  try {
    await inClient(clientId, ({ db, user, access }) => retryPublishing(db, user, access, uuid.parse(jobId)));
    refresh(clientId);
    return { ok: true, message: "Queued for another attempt." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function markPublished(clientId: string, jobId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const url = z.string().url("Paste the link to the published comment or post").max(500).parse(str(fd.get("url"), 500));
    await inClient(clientId, ({ db, user, access }) => recordManualPublication(db, user, access, uuid.parse(jobId), url));
    refresh(clientId);
    return { ok: true, message: "Recorded as published." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function processQueueNow(clientId: string): Promise<ActionResult> {
  try {
    const { user, access } = await requireClientAccess(clientId);
    if (!access.isGbsManager) throw new ForbiddenError("Only GBS can run the queue manually.");
    await rateLimit(`queue:${user.id}`, 20, 600);
    const r = await processDueJobs(systemRunner, { clientId, limit: 10, workerId: `manual:${user.id}` });
    refresh(clientId);
    if (!r.length) return { ok: true, message: "Nothing is due right now." };
    const counts = r.reduce<Record<string, number>>((m, x) => ((m[x.status] = (m[x.status] ?? 0) + 1), m), {});
    return { ok: true, message: Object.entries(counts).map(([k, v]) => `${v} ${k.replace("_", " ")}`).join(", ") };
  } catch (e) {
    return toActionError(e);
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const { requireUser } = await import("@/lib/auth/session");
  const user = await requireUser();
  await withUser(user.id, (db) => db.query("update notifications set read_at = now() where user_id = $1 and read_at is null", [user.id]));
  revalidatePath("/", "layout");
}
