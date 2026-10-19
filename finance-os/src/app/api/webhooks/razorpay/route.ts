import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { razorpayConfig } from "@/lib/env";
import { normalizeRazorpayEvent, verifyRazorpaySignature } from "@/integrations/razorpay/webhook";
import { createHash } from "node:crypto";

const HANDLED = new Set(["payment_link.paid", "payment_link.partially_paid", "payment_link.expired", "payment_link.cancelled"]);

/**
 * Razorpay webhook. Configure in Razorpay Dashboard → Settings → Webhooks:
 *   URL:    https://<app>/api/webhooks/razorpay
 *   Secret: same value as RAZORPAY_WEBHOOK_SECRET
 *   Events: payment_link.paid, payment_link.partially_paid, payment_link.expired, payment_link.cancelled
 * Responses: 200 when handled or a known duplicate; 401 for a bad signature; 500 so Razorpay retries.
 */
export async function POST(request: NextRequest) {
  const cfg = razorpayConfig();
  const raw = await request.text();
  if (!cfg.webhookSecret) {
    return NextResponse.json({ error: "Razorpay webhook secret is not configured" }, { status: 503 });
  }
  if (!verifyRazorpaySignature(raw, request.headers.get("x-razorpay-signature"), cfg.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body is not JSON" }, { status: 400 });
  }
  const e = normalizeRazorpayEvent(body);
  if (!HANDLED.has(e.eventType) || !e.linkId) {
    return NextResponse.json({ ok: true, result: "ignored" });
  }
  // Razorpay sends a unique id per event in this header; fall back to a body hash so retries still dedupe.
  const eventId = request.headers.get("x-razorpay-event-id") ?? `sha256:${createHash("sha256").update(raw).digest("hex")}`;
  const paymentOk = e.paymentStatus === null || e.paymentStatus === "captured";

  const { data, error } = await createAdminClient().rpc("apply_razorpay_event", {
    p_event_id: eventId,
    p_event_type: e.eventType,
    p_link_id: e.linkId,
    p_link_status: e.linkStatus,
    p_link_amount_paid: e.linkAmountPaid,
    p_payment_id: paymentOk ? e.paymentId : null,
    p_payment_amount: paymentOk ? e.paymentAmount : null,
    p_payment_method: e.paymentMethod,
    p_paid_at: e.paidAt,
    p_payload: body,
  });
  if (error) {
    console.error("razorpay webhook failed", eventId, error.message);
    return NextResponse.json({ error: "Could not record the event" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, result: data });
}
