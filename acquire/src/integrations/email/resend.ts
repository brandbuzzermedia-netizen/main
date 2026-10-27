import "server-only";
import { resendConfig } from "@/lib/env";

export type EmailSend = { from: string; to: string; subject: string; html: string; text: string; headers?: Record<string, string>; idempotencyKey: string };

/** Sends one email through Resend's REST API. Returns the provider id or throws with the provider's message. */
export async function sendEmail(msg: EmailSend): Promise<{ id: string }> {
  const { apiKey, enabled } = resendConfig();
  if (!enabled) throw new Error("Email is not configured (RESEND_API_KEY).");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": msg.idempotencyKey },
    body: JSON.stringify({ from: msg.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? body.name ?? "unknown error"}`);
  return { id: body.id };
}
