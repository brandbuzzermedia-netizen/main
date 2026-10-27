import "server-only";
import { twilioConfig } from "@/lib/env";

/** Sends one SMS through Twilio's REST API. Returns the message SID or throws with Twilio's message. */
export async function sendSms(msg: { from: string; to: string; body: string; statusCallback?: string }): Promise<{ id: string }> {
  const { accountSid, authToken, enabled } = twilioConfig();
  if (!enabled) throw new Error("SMS is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN).");
  const form = new URLSearchParams({ From: msg.from, To: msg.to, Body: msg.body });
  if (msg.statusCallback) form.set("StatusCallback", msg.statusCallback);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
  if (!res.ok || !body.sid) throw new Error(`Twilio ${res.status}${body.code ? ` (${body.code})` : ""}: ${body.message ?? "unknown error"}`);
  return { id: body.sid };
}
