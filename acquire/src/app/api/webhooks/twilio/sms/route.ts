import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl, twilioConfig } from "@/lib/env";
import { isOptOut, verifyTwilio } from "@/domain/outreach";

const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Inbound SMS. Stores the reply (which stops sequences), and records STOP-style replies as an opt-out. */
export async function POST(request: NextRequest) {
  const { authToken, enabled } = twilioConfig();
  if (!enabled) return new NextResponse("SMS not configured", { status: 503 });
  const params = Object.fromEntries(new URLSearchParams(await request.text())) as Record<string, string>;
  // Twilio signs the public URL it called; behind a proxy request.url can differ, so use APP_URL.
  if (!verifyTwilio(authToken, `${appUrl()}/api/webhooks/twilio/sms`, params, request.headers.get("x-twilio-signature"))) {
    return new NextResponse("Invalid signature", { status: 403 });
  }
  const db = createAdminClient();
  const { To: to, From: from, Body: body = "", MessageSid: sid } = params;
  const { data: org } = await db.from("organization_settings").select("organization_id").eq("sms_from_number", to).maybeSingle();
  if (!org || !sid) return new NextResponse(TWIML_EMPTY, { headers: { "Content-Type": "text/xml" } });
  const orgId = org.organization_id;
  const { data: lead } = await db.from("leads").select("id").eq("organization_id", orgId).eq("phone_e164", from).maybeSingle();

  const { error } = await db.from("messages").insert({
    organization_id: orgId, lead_id: lead?.id ?? null, channel: "sms", direction: "inbound", to_address: to, from_address: from,
    body: body.slice(0, 5000), status: "received", provider: "twilio", provider_message_id: sid,
  });
  const duplicate = error?.code === "23505";
  if (error && !duplicate) return new NextResponse("Could not store message", { status: 500 }); // Twilio retries
  if (!duplicate && isOptOut(body) && /^\+[1-9]\d{6,14}$/.test(from)) {
    // Conservative: an SMS STOP suppresses every phone channel for this number.
    await db.from("suppression_entries").insert({
      organization_id: orgId, value_type: "phone", value: from, channel: null, reason: "opt_out",
      source: `Replied "${body.trim().slice(0, 40)}" by SMS`, lead_id: lead?.id ?? null,
    });
  }
  return new NextResponse(TWIML_EMPTY, { headers: { "Content-Type": "text/xml" } });
}
