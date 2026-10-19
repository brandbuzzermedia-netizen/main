import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay signs webhooks with HMAC-SHA256 over the RAW request body using the webhook secret,
 * hex-encoded in the X-Razorpay-Signature header. Verify before parsing; re-serialised JSON
 * would not match.
 */
export function verifyRazorpaySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  if (!/^[0-9a-f]+$/i.test(signature) || signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature.toLowerCase(), "hex"));
}

export type NormalizedRazorpayEvent = {
  eventType: string;
  linkId: string | null;
  linkStatus: string | null;
  linkAmountPaid: number | null;
  paymentId: string | null;
  paymentAmount: number | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  paidAt: string | null; // ISO
};

type Entity = Record<string, unknown> | undefined;
const entity = (payload: unknown, key: string): Entity =>
  ((payload as Record<string, { entity?: Record<string, unknown> }> | undefined)?.[key]?.entity) ?? undefined;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const int = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) ? v : null);

/** Extract what Finance OS needs from a payment_link.* event, defensively. */
export function normalizeRazorpayEvent(body: unknown): NormalizedRazorpayEvent {
  const b = (body ?? {}) as { event?: unknown; payload?: unknown };
  const link = entity(b.payload, "payment_link");
  const payment = entity(b.payload, "payment");
  const created = int(payment?.created_at);
  return {
    eventType: str(b.event) ?? "unknown",
    linkId: str(link?.id),
    linkStatus: str(link?.status),
    linkAmountPaid: int(link?.amount_paid),
    paymentId: str(payment?.id),
    paymentAmount: int(payment?.amount),
    paymentStatus: str(payment?.status),
    paymentMethod: str(payment?.method),
    paidAt: created ? new Date(created * 1000).toISOString() : null,
  };
}

/** Razorpay reference_id: unique per link, at most 40 characters. */
export function buildReferenceId(invoiceNumber: string, nowMs: number = Date.now()): string {
  const suffix = `-${nowMs.toString(36)}`;
  const base = invoiceNumber.replace(/[^A-Za-z0-9/_-]/g, "").slice(0, 40 - suffix.length);
  return `${base}${suffix}`;
}

/** Bank statement credits that are Razorpay settlements (already recorded per payment via webhook). */
export function isGatewaySettlement(narration: string): boolean {
  return /RAZORPAY|\bRZP\b|RZPX|SETL_|PAYOUT.*RAZOR/i.test(narration);
}
