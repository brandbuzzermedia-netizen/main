import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateEligibility, type Basis, type Channel, type EligibilityResult } from "@/domain/eligibility";
import { firstName, renderTemplate, smsSegments, textToHtml, unsubscribeToken } from "@/domain/outreach";
import { appUrl, resendConfig, twilioConfig, unsubscribeSecret } from "@/lib/env";
import { sendEmail } from "@/integrations/email/resend";
import { sendSms } from "@/integrations/sms/twilio";

/**
 * Every outbound message goes through sendToLead(), whether a person clicked Send (user client,
 * RLS applies) or a sequence step is due (service-role client in the job runner).
 *
 * Order: load state → eligibility at this moment → render → record the message with its decision →
 * meter usage (enforces the plan quota) → send → record the provider result.
 * A message that is not "allow" is recorded as blocked/held and never leaves the platform.
 */

type Db = SupabaseClient;

export type SendInput = {
  orgId: string;
  leadId: string;
  channel: "email" | "sms";
  templateId?: string | null;
  subject?: string | null;
  body?: string | null;
  actorId: string | null;
  enrollmentId?: string | null;
  stepIndex?: number | null;
  now?: Date;
};

export type SendResult = {
  messageId: string | null;
  status: "blocked" | "held" | "sent" | "failed";
  decision: EligibilityResult;
  error?: string;
};

type ContactState = {
  lead: { id: string; full_name: string; email: string | null; phone_e164: string | null; country: string | null; timezone: string | null; preferred_location: string | null; property_interest: string | null; owner_id: string | null; stage_id: string };
  org: { name: string };
  settings: { contact_window_start: string; contact_window_end: string; implied_inquiry_days: number; email_from_name: string | null; email_from_address: string | null; postal_address: string | null; sms_from_number: string | null };
  optedOut: boolean;
  suppressedChannels: Set<string>; // "*" = all channels
  consent: Map<string, { status: "granted" | "withdrawn"; basis: Basis | "none_recorded"; captured_at: string; expires_at: string | null }>;
  agentName: string | null;
};

export async function loadContactState(db: Db, orgId: string, leadId: string): Promise<ContactState | null> {
  const { data: lead } = await db.from("leads")
    .select("id, full_name, email, phone_e164, country, timezone, preferred_location, property_interest, owner_id, stage_id")
    .eq("id", leadId).eq("organization_id", orgId).maybeSingle();
  if (!lead) return null;
  const values = [lead.email && `and(value_type.eq.email,value.eq."${lead.email.toLowerCase().trim().replace(/"/g, "")}")`, lead.phone_e164 && `and(value_type.eq.phone,value.eq.${lead.phone_e164})`].filter(Boolean);
  const [org, settings, stage, supp, consent, owner] = await Promise.all([
    db.from("organizations").select("name").eq("id", orgId).single(),
    db.from("organization_settings").select("contact_window_start, contact_window_end, implied_inquiry_days, email_from_name, email_from_address, postal_address, sms_from_number").eq("organization_id", orgId).single(),
    db.from("pipeline_stages").select("category").eq("id", lead.stage_id).single(),
    db.from("suppression_entries").select("value_type, channel").eq("organization_id", orgId).or(values.join(",")),
    db.from("lead_consent_latest").select("channel, status, basis, captured_at, expires_at").eq("lead_id", leadId),
    lead.owner_id ? db.from("users").select("full_name, email").eq("id", lead.owner_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (org.error || settings.error) throw new Error((org.error ?? settings.error)!.message);
  const suppressedChannels = new Set<string>();
  for (const s of supp.data ?? []) {
    // Email suppression affects email; phone suppression affects every phone channel.
    const channels = s.value_type === "email" ? ["email"] : ["sms", "phone_call", "ai_voice_call", "whatsapp"];
    for (const c of channels) if (s.channel === null || s.channel === c) suppressedChannels.add(c);
  }
  return {
    lead,
    org: org.data,
    settings: settings.data,
    optedOut: stage.data?.category === "opted_out",
    suppressedChannels,
    consent: new Map((consent.data ?? []).map((c) => [c.channel, c])),
    agentName: owner.data?.full_name ?? null,
  };
}

export function eligibilityFor(state: ContactState, channel: Channel, now: Date): EligibilityResult {
  const c = state.consent.get(channel);
  return evaluateEligibility({
    channel,
    country: state.lead.country,
    timezone: state.lead.timezone,
    hasContactValue: Boolean(channel === "email" ? state.lead.email : state.lead.phone_e164),
    suppressed: state.suppressedChannels.has(channel),
    optedOutStage: state.optedOut,
    consent: c && { status: c.status, basis: c.basis, capturedAt: new Date(c.captured_at), expiresAt: c.expires_at ? new Date(c.expires_at) : null },
    now,
    orgWindow: { start: state.settings.contact_window_start.slice(0, 5), end: state.settings.contact_window_end.slice(0, 5) },
    impliedInquiryDays: state.settings.implied_inquiry_days,
  });
}

/** Sender problems that stop a send regardless of eligibility. */
export function senderProblems(state: ContactState, channel: "email" | "sms"): string[] {
  const p: string[] = [];
  if (channel === "email") {
    if (!resendConfig().enabled) p.push("Email provider is not connected (RESEND_API_KEY).");
    if (!unsubscribeSecret()) p.push("UNSUBSCRIBE_SECRET is not set, so emails cannot carry an unsubscribe link.");
    if (!state.settings.email_from_address) p.push("Set a sender email address in Settings → Sending.");
    if (!state.settings.postal_address) p.push("Set your postal address in Settings → Sending (required in marketing email).");
  } else {
    if (!twilioConfig().enabled) p.push("SMS provider is not connected (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN).");
    if (!state.settings.sms_from_number) p.push("Set your SMS number in Settings → Sending.");
  }
  return p;
}

export async function sendToLead(db: Db, input: SendInput): Promise<SendResult> {
  const now = input.now ?? new Date();
  const state = await loadContactState(db, input.orgId, input.leadId);
  if (!state) throw new Error("Lead not found, or your role cannot reach it.");
  const decision = eligibilityFor(state, input.channel, now);

  let subject = input.subject ?? null;
  let body = input.body ?? "";
  if (input.templateId) {
    const { data: t } = await db.from("message_templates").select("channel, subject, body, status").eq("id", input.templateId).eq("organization_id", input.orgId).maybeSingle();
    if (!t || t.status !== "approved" || t.channel !== input.channel) throw new Error("Choose an approved template for this channel.");
    subject = t.subject;
    body = t.body;
  }
  const vars = {
    first_name: firstName(state.lead.full_name), full_name: state.lead.full_name, preferred_location: state.lead.preferred_location,
    property_interest: state.lead.property_interest, agent_name: state.agentName ?? state.org.name, company: state.org.name,
  };
  const renderedBody = renderTemplate(body, vars);
  const renderedSubject = subject ? renderTemplate(subject, vars) : null;
  const missing = [...new Set([...renderedBody.missing, ...(renderedSubject?.missing ?? [])])];
  if (!renderedBody.text) throw new Error("The message is empty.");

  const to = input.channel === "email" ? state.lead.email : state.lead.phone_e164;
  const problems = [
    ...senderProblems(state, input.channel),
    ...(missing.length ? [`The lead has no value for: ${missing.join(", ")}. Edit the lead or the message.`] : []),
  ];
  const status: "blocked" | "held" | "queued" =
    decision.decision === "block" ? "blocked" : decision.decision !== "allow" || problems.length ? "held" : "queued";

  // SMS: identify the sender and the opt-out route in every message that lacks them.
  let finalBody = renderedBody.text;
  if (input.channel === "sms" && !/\bSTOP\b/.test(finalBody)) finalBody = `${finalBody}\n${state.org.name}: reply STOP to opt out.`;

  const { data: msg, error } = await db.from("messages").insert({
    organization_id: input.orgId, lead_id: input.leadId, channel: input.channel, direction: "outbound",
    to_address: to ?? "(none)", subject: renderedSubject?.text ?? null, body: finalBody, status,
    decision: { decision: decision.decision, reasons: decision.reasons, market: decision.market, ruleset: decision.rulesetVersion, problems },
    template_id: input.templateId ?? null, enrollment_id: input.enrollmentId ?? null, step_index: input.stepIndex ?? null,
    error: status === "held" && problems.length ? problems.join(" ") : null, created_by: input.actorId,
  }).select("id").single();
  if (error) throw new Error(error.message);
  if (status !== "queued" || !to) return { messageId: msg.id, status: status === "queued" ? "held" : status, decision, error: problems.join(" ") || undefined };

  // Meter first: this enforces the plan quota before any provider cost is incurred.
  const quantity = input.channel === "sms" ? smsSegments(finalBody) : 1;
  const metered = await db.rpc("meter_usage", { p_org: input.orgId, p_metric: input.channel, p_quantity: quantity, p_ref: msg.id });
  if (metered.error) {
    await db.from("messages").update({ status: "failed", error: metered.error.message }).eq("id", msg.id);
    return { messageId: msg.id, status: "failed", decision, error: metered.error.message };
  }

  try {
    let providerId: string;
    if (input.channel === "email") {
      const token = unsubscribeToken(unsubscribeSecret()!, input.orgId, input.leadId);
      const unsubscribeUrl = `${appUrl()}/u/${token}`;
      const oneClickUrl = `${appUrl()}/api/unsubscribe/${token}`;
      const footer = `\n\n—\n${state.org.name} · ${state.settings.postal_address}\nYou can unsubscribe at any time: ${unsubscribeUrl}`;
      const sent = await sendEmail({
        from: state.settings.email_from_name ? `${state.settings.email_from_name} <${state.settings.email_from_address}>` : state.settings.email_from_address!,
        to, subject: renderedSubject?.text ?? "(no subject)", text: finalBody + footer, html: textToHtml(finalBody + footer),
        headers: { "List-Unsubscribe": `<${oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        idempotencyKey: msg.id,
      });
      providerId = sent.id;
    } else {
      const sent = await sendSms({ from: state.settings.sms_from_number!, to, body: finalBody, statusCallback: `${appUrl()}/api/webhooks/twilio/status` });
      providerId = sent.id;
    }
    await db.from("messages").update({ status: "sent", provider: input.channel === "email" ? "resend" : "twilio", provider_message_id: providerId, sent_at: new Date().toISOString() }).eq("id", msg.id);
    return { messageId: msg.id, status: "sent", decision };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    await db.from("messages").update({ status: "failed", error: message }).eq("id", msg.id);
    return { messageId: msg.id, status: "failed", decision, error: message };
  }
}
