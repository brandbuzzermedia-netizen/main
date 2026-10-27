import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsubscribeSecret } from "@/lib/env";
import { clientIp, loadPublicForm } from "@/lib/forms";
import { hashIp, parseSubmission } from "@/domain/forms";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * Public lead capture. Accepts an HTML form post (redirects back to the hosted page) or JSON
 * (for embedded forms; answers with JSON and CORS). Rate-limited per form and per IP.
 */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/forms/[key]">) {
  const { key } = await params;
  const isJson = (request.headers.get("content-type") ?? "").includes("application/json");
  const reply = (status: number, body: Record<string, unknown>, redirectQuery?: string) =>
    isJson ? NextResponse.json(body, { status, headers: CORS })
           : NextResponse.redirect(new URL(`/f/${key}${redirectQuery ?? ""}`, request.nextUrl.origin), 303);

  const secret = unsubscribeSecret();
  const form = await loadPublicForm(key);
  if (!form || !secret) return reply(404, { ok: false, error: "This form is not available." }, "?error=unavailable");

  let fields: Record<string, string>;
  try {
    const raw = await request.text();
    if (raw.length > 20_000) return reply(413, { ok: false, error: "Too large" }, "?error=invalid");
    fields = isJson ? Object.fromEntries(Object.entries(JSON.parse(raw) as Record<string, unknown>).map(([k, v]) => [k, typeof v === "boolean" ? (v ? "on" : "") : String(v ?? "")]))
                    : Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return reply(400, { ok: false, error: "Invalid request" }, "?error=invalid");
  }

  const parsed = parseSubmission(fields, form, { market: form.org.primary_market, currency: form.org.default_currency });
  const ipHash = hashIp(secret, clientIp(request.headers));
  const db = createAdminClient();
  if (!parsed.ok && parsed.spam) {
    await db.from("lead_form_submissions").insert({ organization_id: form.organization_id, form_id: form.id, outcome: "spam", ip_hash: ipHash });
    return reply(200, { ok: true }, "?done=1"); // look successful to bots
  }
  if (!parsed.ok) return reply(422, { ok: false, errors: parsed.errors }, `?error=${encodeURIComponent(Object.values(parsed.errors)[0])}`);

  const { data, error } = await db.rpc("submit_lead_form", {
    p_key: key, p_data: parsed.data, p_ip_hash: ipHash, p_user_agent: request.headers.get("user-agent") ?? "",
  });
  if (error) {
    // e.g. the workspace reached its plan's contact limit; don't expose details publicly.
    console.error("submit_lead_form failed", error.message);
    return reply(503, { ok: false, error: "We could not take your details right now. Please try again later." }, "?error=unavailable");
  }
  const r = data as { ok: boolean; error?: string };
  if (!r.ok) return reply(r.error === "rate_limited" ? 429 : 404, { ok: false, error: r.error === "rate_limited" ? "Too many submissions. Try again in a few minutes." : "This form is not available." }, `?error=${r.error}`);
  return reply(200, { ok: true, message: form.thank_you }, "?done=1");
}
