import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { draftAutoReply } from "@/integrations/ai/claude";

export type OutgoingReply = { channel: "email" | "whatsapp"; to: string; text: string; subject?: string };

/**
 * The AI reply assistant for one incoming email or WhatsApp message from a known lead.
 * Replies only when the company switched it on for that channel, AI is enabled with budget left,
 * the person is not opted out, and today's per-person limit is not reached. Anything the model
 * should not answer is handed to the lead's owner as a high-priority task. Every reply says it
 * comes from an AI assistant.
 */
export async function autoReply(db: SupabaseClient, org: string, contactId: string, channel: string, message: string): Promise<OutgoingReply | null> {
  if (channel !== "email" && channel !== "whatsapp") return null;
  const [{ data: g }, { data: app }, { data: co }, { data: c }] = await Promise.all([
    db.from("growth_settings").select("ai_reply_enabled, ai_reply_channels, ai_knowledge, ai_daily_limit, booking_url").eq("organization_id", org).maybeSingle(),
    db.from("app_settings").select("ai_enabled, ai_monthly_token_limit").eq("organization_id", org).maybeSingle(),
    db.from("organizations").select("name").eq("id", org).single(),
    db.from("contacts").select("full_name, email, phone_e164, owner_id, do_not_contact").eq("id", contactId).single(),
  ]);
  if (!g?.ai_reply_enabled || !(g.ai_reply_channels as string[]).includes(channel) || !app?.ai_enabled || !c || c.do_not_contact) return null;
  const to = channel === "email" ? c.email : c.phone_e164;
  if (!to) return null;
  const { data: sup } = await db.from("suppression_records").select("id").eq("organization_id", org).in("channel", channel === "email" ? ["email", "all"] : ["whatsapp", "phone", "all"])
    .eq("value_normalized", channel === "email" ? to.toLowerCase() : to).limit(1);
  if (sup?.length) return null;

  const IST = 5.5 * 3_600_000; // the AI budget resets on the 1st of each month, India time
  const ist = new Date(Date.now() + IST);
  const monthStart = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST);
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [{ data: used }, { count: today }, { data: hist }] = await Promise.all([
    db.from("ai_usage_log").select("input_tokens, output_tokens").eq("organization_id", org).gte("created_at", monthStart.toISOString()).limit(20000),
    db.from("ai_replies").select("id", { count: "exact", head: true }).eq("contact_id", contactId).eq("action", "replied").gte("created_at", since),
    db.from("outreach_events").select("kind, notes, created_at").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(8),
  ]);
  const spent = (used ?? []).reduce((s, r) => s + Number(r.input_tokens) + Number(r.output_tokens), 0);

  const handOver = async (reason: string, interest: string | null) => {
    await db.from("ai_replies").insert({ organization_id: org, contact_id: contactId, channel, inbound_text: message.slice(0, 4000), action: "handed_over", interest, reason });
    const { data: m } = c.owner_id ? await db.from("memberships").select("user_id").eq("organization_id", org).eq("user_id", c.owner_id).maybeSingle() : { data: null };
    await db.from("tasks").insert({ organization_id: org, title: `Reply needed: ${c.full_name}`.slice(0, 200), details: `${reason}\n\nTheir message (${channel}): ${message.slice(0, 1500)}`,
      due_on: new Date().toISOString().slice(0, 10), assignee_id: m?.user_id ?? null, priority: "high", created_by: null });
    return null;
  };
  if (spent >= Number(app.ai_monthly_token_limit ?? 0)) return handOver("AI monthly budget used up, so a person needs to reply.", null);
  if ((today ?? 0) >= Number(g.ai_daily_limit ?? 3)) return handOver("The AI already replied to this person several times today; a person should take over.", null);

  const history = (hist ?? []).reverse().map((e) => `[${e.kind}] ${String(e.notes ?? "").slice(0, 600)}`).join("\n");
  const { result, usage } = await draftAutoReply({ company: co?.name ?? "our company", knowledge: String(g.ai_knowledge ?? ""), bookingUrl: g.booking_url ?? null, channel, history, message });
  if (!usage.is_mock) await db.from("ai_usage_log").insert({ organization_id: org, user_id: null, purpose: "auto_reply", model: usage.model, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
    is_mock: false, refused: usage.refused, outcome: result?.action === "reply" ? "approved" : "discarded" });
  if (!result) return usage.is_mock ? null : handOver("The AI could not answer this message.", null);
  if (result.interest === "hot") await db.from("contacts").update({ lead_status: "qualified" }).eq("id", contactId).in("lead_status", ["new", "contacted"]);
  if (result.action === "handoff" || !result.reply.trim()) return handOver(result.reason || "Needs a person.", result.interest);

  const text = `${result.reply.trim()}\n\n— ${co?.name ?? "Our"} AI assistant${channel === "email" ? " (reply here to reach our team)" : ""}`;
  await db.from("ai_replies").insert({ organization_id: org, contact_id: contactId, channel, inbound_text: message.slice(0, 4000), action: "replied", reply_text: text, interest: result.interest, reason: result.reason, model: usage.model });
  await db.from("outreach_events").insert({ organization_id: org, contact_id: contactId, kind: channel, outcome: "sent", notes: `AI reply: ${text}`.slice(0, 2000) });
  return { channel, to, text, ...(channel === "email" ? { subject: `Re: your message to ${co?.name ?? "us"}` } : {}) };
}
