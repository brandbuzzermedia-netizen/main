import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decideStep, nextRunAt, type Step } from "@/domain/outreach";
import { eligibilityFor, loadContactState, sendToLead } from "@/lib/outreach";

export type RunSummary = { claimed: number; sent: number; deferred: number; held: number; skipped: number; completed: number; failed: number; errors: string[] };

/**
 * Processes due sequence steps. Called by the scheduled job with the service-role client.
 * Each enrollment is claimed with a short lock first, so overlapping runs never send a step twice.
 */
export async function runDueSequences(db: SupabaseClient, limit = 50, now = new Date()): Promise<RunSummary> {
  const s: RunSummary = { claimed: 0, sent: 0, deferred: 0, held: 0, skipped: 0, completed: 0, failed: 0, errors: [] };
  const { data: due, error } = await db.from("campaign_enrollments")
    .select("id, organization_id, campaign_id, lead_id, current_step")
    .eq("status", "active").lte("next_run_at", now.toISOString())
    .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`)
    .order("next_run_at").limit(limit);
  if (error) throw new Error(error.message);

  for (const e of due ?? []) {
    const lockUntil = new Date(now.getTime() + 5 * 60_000).toISOString();
    const { data: claimed } = await db.from("campaign_enrollments").update({ locked_until: lockUntil })
      .eq("id", e.id).eq("status", "active").eq("current_step", e.current_step)
      .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`).select("id");
    if (!claimed?.length) continue;
    s.claimed++;
    try {
      const { data: campaign } = await db.from("campaigns").select("status, steps").eq("id", e.campaign_id).single();
      if (!campaign || campaign.status !== "active") {
        // Paused or archived campaign: leave the enrollment due; it resumes when the campaign does.
        await db.from("campaign_enrollments").update({ locked_until: null }).eq("id", e.id);
        continue;
      }
      const steps = campaign.steps as Step[];
      const step = steps[e.current_step];
      if (!step) {
        await db.from("campaign_enrollments").update({ status: "completed", locked_until: null }).eq("id", e.id);
        s.completed++;
        continue;
      }
      const state = await loadContactState(db, e.organization_id, e.lead_id);
      if (!state) {
        await db.from("campaign_enrollments").update({ status: "stopped", stop_reason: "lead not found", locked_until: null }).eq("id", e.id);
        continue;
      }
      const outcome = decideStep(eligibilityFor(state, step.channel, now));
      if (outcome.kind === "defer") {
        await db.from("campaign_enrollments").update({ next_run_at: outcome.until.toISOString(), locked_until: null }).eq("id", e.id);
        s.deferred++;
        continue;
      }
      if (outcome.kind === "hold") {
        await db.from("campaign_enrollments").update({ status: "held", stop_reason: outcome.reason.slice(0, 500), locked_until: null }).eq("id", e.id);
        s.held++;
        continue;
      }
      // "send" and "skip" both go through sendToLead: a blocked step is recorded as a blocked message.
      const result = await sendToLead(db, {
        orgId: e.organization_id, leadId: e.lead_id, channel: step.channel, templateId: step.template_id,
        actorId: null, enrollmentId: e.id, stepIndex: e.current_step, now,
      });
      if (result.status === "held") {
        await db.from("campaign_enrollments").update({ status: "held", stop_reason: (result.error ?? "Needs review").slice(0, 500), locked_until: null }).eq("id", e.id);
        s.held++;
        continue;
      }
      if (result.status === "failed") s.failed++;
      else if (result.status === "blocked") s.skipped++;
      else s.sent++;
      const nextIndex = e.current_step + 1;
      const next = nextRunAt(steps, nextIndex, now);
      await db.from("campaign_enrollments").update(
        next ? { current_step: nextIndex, next_run_at: next.toISOString(), locked_until: null }
             : { current_step: nextIndex, status: "completed", locked_until: null },
      ).eq("id", e.id);
      if (!next) s.completed++;
    } catch (err) {
      s.errors.push(`${e.id}: ${err instanceof Error ? err.message : "error"}`);
      // Release after the lock expires; the next run retries.
    }
  }
  return s;
}
