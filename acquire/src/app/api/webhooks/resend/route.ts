import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resendConfig } from "@/lib/env";
import { normalizeEmail } from "@/domain/normalize";
import { verifySvix } from "@/domain/outreach";

/** Resend events: delivery, bounces and complaints. Bounces and complaints suppress the address for email. */
export async function POST(request: NextRequest) {
  const { webhookSecret } = resendConfig();
  if (!webhookSecret) return new NextResponse("Email webhooks not configured", { status: 503 });
  const raw = await request.text();
  const ok = verifySvix(webhookSecret, {
    id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature"),
  }, raw);
  if (!ok) return new NextResponse("Invalid signature", { status: 403 });

  const event = JSON.parse(raw) as { type?: string; data?: { email_id?: string; to?: string[] } };
  const emailId = event.data?.email_id;
  if (!emailId) return new NextResponse(null, { status: 204 });
  const db = createAdminClient();
  const { data: msg } = await db.from("messages").select("id, organization_id, lead_id, to_address").eq("provider", "resend").eq("provider_message_id", emailId).maybeSingle();
  if (!msg) return new NextResponse(null, { status: 204 });

  if (event.type === "email.delivered") {
    await db.from("messages").update({ status: "delivered" }).eq("id", msg.id).eq("status", "sent");
  } else if (event.type === "email.bounced" || event.type === "email.complained") {
    if (event.type === "email.bounced") await db.from("messages").update({ status: "bounced" }).eq("id", msg.id);
    const address = normalizeEmail(msg.to_address);
    if (address) {
      await db.from("suppression_entries").upsert({
        organization_id: msg.organization_id, value_type: "email", value: address, channel: "email",
        reason: event.type === "email.bounced" ? "bounce" : "complaint", source: `Resend ${event.type}`, lead_id: msg.lead_id,
      }, { onConflict: "organization_id,value_type,value,channel", ignoreDuplicates: true });
    }
  }
  return new NextResponse(null, { status: 204 });
}
