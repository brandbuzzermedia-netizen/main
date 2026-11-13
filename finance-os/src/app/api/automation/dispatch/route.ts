import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchToN8n, n8nConfig } from "@/integrations/n8n/client";

/**
 * Scheduled dispatcher (e.g. Vercel Cron every 5 minutes with Authorization: Bearer CRON_SECRET).
 * Claims queued, approved, non-mock runs (skipping emergency-stopped companies) and sends them to
 * n8n. A failed send marks the run failed; retry rules live in the database.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (n8nConfig().mock) return NextResponse.json({ ok: true, dispatched: 0, note: "n8n not configured (mock mode)" });
  const db = createAdminClient();
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
  return NextResponse.json({ ok: true, dispatched: sent });
}
