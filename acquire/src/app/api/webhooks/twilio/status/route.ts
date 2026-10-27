import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl, twilioConfig } from "@/lib/env";
import { verifyTwilio } from "@/domain/outreach";

const STATUS: Record<string, string> = { delivered: "delivered", undelivered: "failed", failed: "failed" };

/** Delivery status callbacks for outbound SMS. Unknown or intermediate statuses are ignored. */
export async function POST(request: NextRequest) {
  const { authToken, enabled } = twilioConfig();
  if (!enabled) return new NextResponse("SMS not configured", { status: 503 });
  const params = Object.fromEntries(new URLSearchParams(await request.text())) as Record<string, string>;
  if (!verifyTwilio(authToken, `${appUrl()}/api/webhooks/twilio/status`, params, request.headers.get("x-twilio-signature"))) {
    return new NextResponse("Invalid signature", { status: 403 });
  }
  const status = STATUS[params.MessageStatus ?? ""];
  if (status && params.MessageSid) {
    await createAdminClient().from("messages")
      .update({ status, error: status === "failed" ? `Twilio error ${params.ErrorCode ?? ""}`.trim() : null })
      .eq("provider", "twilio").eq("provider_message_id", params.MessageSid).in("status", ["sent", "delivered"]);
  }
  return new NextResponse(null, { status: 204 });
}
