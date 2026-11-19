import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchToN8n, n8nConfig } from "@/integrations/n8n/client";
import { todayInBusinessTz } from "@/domain/dates";

/**
 * Scheduled dispatcher (e.g. Vercel Cron every 5 minutes with Authorization: Bearer CRON_SECRET).
 * Queues today's scheduled runs, then claims queued, approved, non-mock runs (skipping
 * emergency-stopped companies) and sends each to its template's n8n webhook (dp-<template>). A failed send marks the run failed; retry rules live in the database.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  // Payment discipline runs every day, with or without n8n: warnings, work holds, team tasks.
  const holds = await db.rpc("evaluate_payment_holds", { p_today: todayInBusinessTz() });
  if (holds.error) return NextResponse.json({ error: "holds_failed" }, { status: 500 });
  // Outreach reminders for leads left on the list also run without n8n (they only create tasks).
  const stale = await db.rpc("run_outreach_rules", { p_today: todayInBusinessTz() });
  if (n8nConfig().mock) return NextResponse.json({ ok: true, holds: holds.data ?? 0, outreach: stale.data ?? 0, dispatched: 0, note: "n8n not configured (mock mode)" });
  await db.rpc("enqueue_hold_alerts", { p_today: todayInBusinessTz() });
  // Today's scheduled runs (daily summary, bill review reminder, rent overdue). Idempotent per day.
  const queued = await db.rpc("enqueue_scheduled_runs", { p_today: todayInBusinessTz() });
  if (queued.error) return NextResponse.json({ error: "enqueue_failed" }, { status: 500 });
  const { data: runs, error } = await db.rpc("claim_automation_runs", { p_limit: 20 });
  if (error) return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  let sent = 0;
  for (const run of (runs ?? []) as { id: string; organization_id: string; workflow_path: string | null; payload_summary: Record<string, unknown> }[]) {
    const res = await dispatchToN8n(run.workflow_path ?? "", { run_id: run.id, organization_id: run.organization_id, input: run.payload_summary });
    if (res.ok) {
      sent += 1;
      if (res.executionId) await db.from("automation_runs").update({ n8n_execution_id: res.executionId }).eq("id", run.id);
    } else {
      await db.from("automation_runs").update({ status: "failed", last_error: res.error ?? "Dispatch failed", finished_at: new Date().toISOString() }).eq("id", run.id);
    }
  }
  return NextResponse.json({ ok: true, holds: holds.data ?? 0, queued: queued.data ?? 0, dispatched: sent });
}
