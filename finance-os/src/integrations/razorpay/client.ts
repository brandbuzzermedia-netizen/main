import "server-only";
import { razorpayConfig } from "@/lib/env";

// RAZORPAY_API_BASE exists only so tests can point at a local stub; never set it in production.
const API = process.env.RAZORPAY_API_BASE ?? "https://api.razorpay.com/v1";

export class RazorpayError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const cfg = razorpayConfig();
  if (!cfg.enabled) throw new RazorpayError("Razorpay is not configured. Set the keys in the environment.", 0, null);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const description = (json as { error?: { description?: string } })?.error?.description;
    throw new RazorpayError(description ? `Razorpay: ${description}` : `Razorpay returned HTTP ${res.status}`, res.status, json);
  }
  return json as T;
}

export type RazorpayPaymentLink = {
  id: string;
  short_url: string;
  status: string;
  amount: number;
  amount_paid: number;
  reference_id: string;
  expire_by: number;
  accept_partial: boolean;
};

export type CreateLinkInput = {
  amountMinor: number;
  currency: string;
  referenceId: string;
  description: string;
  acceptPartial: boolean;
  expireBy: number; // unix seconds
  customer: { name?: string; email?: string; contact?: string };
  notes: Record<string, string>;
};

/** POST /v1/payment_links. Razorpay's own SMS/email notifications stay off; Finance OS sends reminders. */
export function createPaymentLink(input: CreateLinkInput) {
  return call<RazorpayPaymentLink>("POST", "/payment_links", {
    amount: input.amountMinor,
    currency: input.currency,
    accept_partial: input.acceptPartial,
    reference_id: input.referenceId,
    description: input.description,
    expire_by: input.expireBy,
    customer: input.customer,
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: input.notes,
  });
}

export function cancelPaymentLink(id: string) {
  return call<RazorpayPaymentLink>("POST", `/payment_links/${encodeURIComponent(id)}/cancel`);
}
