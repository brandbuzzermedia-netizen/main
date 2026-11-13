import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verify } from "@/integrations/n8n/signing";

/**
 * n8n reports a run result here. Signed (HMAC + timestamp + single-use nonce), schema-validated,
 * and scoped: the run must belong to the company named in the payload. Results are recorded once.
 */
const schema = z.object({
  run_id: z.uuid(),
  organization_id: z.uuid(),
  status: z.enum(["running", "succeeded", "failed"]),
  execution_id: z.string().max(200).optional(),
  error: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const secret = process.env.N8N_SIGNING_SECRET ?? "";
  const body = await request.text();
  if (body.length > 64_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const h = request.headers;
  const check = verify(secret, { timestamp: h.get("x-dp-timestamp"), nonce: h.get("x-dp-nonce"), signature: h.get("x-dp-signature") }, body);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 401 });

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(JSON.parse(body));
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const db = createAdminClient();
  // Replay protection: each nonce is accepted once.
  const nonce = await db.from("webhook_nonces").insert({ nonce: h.get("x-dp-nonce") });
  if (nonce.error) return NextResponse.json({ error: "replayed" }, { status: 409 });

  const { data: run, error } = await db.from("automation_runs").select("id, organization_id, status")
    .eq("id", parsed.run_id).eq("organization_id", parsed.organization_id).maybeSingle();
  if (error) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  if (!run) return NextResponse.json({ error: "unknown_run" }, { status: 404 });
  if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") {
    return NextResponse.json({ ok: true, duplicate: true }); // already final: record once
  }
  const now = new Date().toISOString();
  const update = await db.from("automation_runs").update({
    status: parsed.status,
    n8n_execution_id: parsed.execution_id ?? null,
    last_error: parsed.status === "failed" ? (parsed.error ?? "Failed without a message") : null,
    started_at: parsed.status === "running" ? now : undefined,
    finished_at: parsed.status === "running" ? null : now,
  }).eq("id", run.id);
  if (update.error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
