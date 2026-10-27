"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { sendToLead } from "@/lib/outreach";
import { anthropicConfig } from "@/lib/env";
import { qualifyLead, QUALIFY_PROMPT_VERSION, type Qualification } from "@/integrations/ai/qualify";
import { fieldErrors, type FieldErrors } from "@/domain/schemas";
import { normalizeEmail, normalizePhone } from "@/domain/normalize";

export type OutreachState = { error?: string; fieldErrors?: FieldErrors; ok?: boolean; message?: string };

const friendly = (m: string) => (m.includes("row-level security") ? "Your role does not allow this." : m);

// ---------------------------------------------------------------------------
// One-off send from a lead
// ---------------------------------------------------------------------------

const sendSchema = z.object({
  channel: z.enum(["email", "sms"]),
  template_id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  subject: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(200).optional()),
  body: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(5000).optional()),
});

export async function sendMessageAction(leadId: string, _prev: OutreachState, formData: FormData): Promise<OutreachState> {
  const ctx = await requirePermission("workCrm");
  const parsed = sendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  if (!v.template_id && !v.body) return { fieldErrors: { body: ["Write a message or choose a template"] } };
  if (!v.template_id && v.channel === "email" && !v.subject) return { fieldErrors: { subject: ["Add a subject"] } };
  try {
    const r = await sendToLead(ctx.supabase, {
      orgId: ctx.org.id, leadId, channel: v.channel, templateId: v.template_id ?? null,
      subject: v.subject ?? null, body: v.body ?? null, actorId: ctx.userId,
    });
    revalidatePath(`/leads/${leadId}`);
    if (r.status === "sent") return { ok: true, message: "Sent." };
    if (r.status === "blocked") return { error: `Not sent: ${r.decision.reasons.map((x) => x.message).join(" ")}` };
    if (r.status === "held") return { error: `Not sent, held for review: ${r.error ?? r.decision.reasons.map((x) => x.message).join(" ")}` };
    return { error: `Sending failed: ${r.error}` };
  } catch (e) {
    return { error: friendly(e instanceof Error ? e.message : "Send failed") };
  }
}

export async function markThreadReadAction(leadId: string) {
  const ctx = await requirePermission("workCrm");
  await ctx.supabase.from("messages").update({ read_at: new Date().toISOString() })
    .eq("organization_id", ctx.org.id).eq("lead_id", leadId).eq("direction", "inbound").is("read_at", null);
  revalidatePath("/conversations");
  revalidatePath(`/leads/${leadId}`);
}

// ---------------------------------------------------------------------------
// Sequence enrollments
// ---------------------------------------------------------------------------

export async function enrollLeadAction(leadId: string, _prev: OutreachState, formData: FormData): Promise<OutreachState> {
  const ctx = await requirePermission("workCrm");
  const campaignId = String(formData.get("campaign_id") ?? "");
  if (!campaignId) return { error: "Choose a sequence." };
  const { error } = await ctx.supabase.from("campaign_enrollments").insert({
    organization_id: ctx.org.id, campaign_id: campaignId, lead_id: leadId, enrolled_by: ctx.userId,
  });
  if (error) return { error: error.code === "23505" ? "This lead is already in that sequence." : friendly(error.message) };
  revalidatePath(`/leads/${leadId}`);
  return { ok: true, message: "Enrolled. The first step runs on the next scheduled run, after the eligibility check." };
}

export async function enrollStageAction(campaignId: string, _prev: OutreachState, formData: FormData): Promise<OutreachState> {
  const ctx = await requirePermission("assignLeads");
  const stageId = String(formData.get("stage_id") ?? "");
  const { data: leads, error } = await ctx.supabase.from("leads").select("id").eq("organization_id", ctx.org.id).eq("stage_id", stageId).limit(500);
  if (error) return { error: error.message };
  if (!leads?.length) return { error: "No leads in that stage." };
  const { data, error: insError } = await ctx.supabase.from("campaign_enrollments").upsert(
    leads.map((l) => ({ organization_id: ctx.org.id, campaign_id: campaignId, lead_id: l.id, enrolled_by: ctx.userId })),
    { onConflict: "campaign_id,lead_id", ignoreDuplicates: true },
  ).select("id");
  if (insError) return { error: friendly(insError.message) };
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true, message: `${data?.length ?? 0} lead(s) enrolled (already-enrolled leads were skipped). Each step re-checks eligibility before sending.` };
}

export async function setEnrollmentStatusAction(enrollmentId: string, status: "active" | "stopped") {
  const ctx = await requirePermission("workCrm");
  const update = status === "active"
    ? { status, stop_reason: null, next_run_at: new Date().toISOString(), locked_until: null }
    : { status, stop_reason: "stopped by a person" };
  const { data, error } = await ctx.supabase.from("campaign_enrollments").update(update).eq("id", enrollmentId).eq("organization_id", ctx.org.id).select("lead_id, campaign_id");
  if (error) throw new Error(friendly(error.message));
  if (data?.[0]) {
    revalidatePath(`/leads/${data[0].lead_id}`);
    revalidatePath(`/campaigns/${data[0].campaign_id}`);
  }
}

// ---------------------------------------------------------------------------
// Templates and sequences (managers)
// ---------------------------------------------------------------------------

const templateSchema = z.object({
  name: z.string().trim().min(1, "Name it").max(80),
  channel: z.enum(["email", "sms"]),
  subject: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(200).optional()),
  body: z.string().trim().min(1, "Write the message").max(10000),
});

export async function saveTemplateAction(templateId: string | null, _prev: OutreachState, formData: FormData): Promise<OutreachState> {
  const ctx = await requirePermission("assignLeads");
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  if (v.channel === "email" && !v.subject) return { fieldErrors: { subject: ["Email templates need a subject"] } };
  if (v.channel === "sms" && v.body.length > 1600) return { fieldErrors: { body: ["SMS templates are limited to 1600 characters"] } };
  const row = { name: v.name, channel: v.channel, subject: v.channel === "email" ? v.subject : null, body: v.body };
  const { error } = templateId
    ? await ctx.supabase.from("message_templates").update(row).eq("id", templateId).eq("organization_id", ctx.org.id)
    : await ctx.supabase.from("message_templates").insert({ ...row, organization_id: ctx.org.id, created_by: ctx.userId });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/campaigns/templates");
  return { ok: true, message: templateId ? "Saved. Edited content needs approval again." : "Template created as a draft." };
}

export async function setTemplateStatusAction(templateId: string, status: "draft" | "approved" | "archived") {
  const ctx = await requirePermission("assignLeads");
  const { error } = await ctx.supabase.from("message_templates").update({ status }).eq("id", templateId).eq("organization_id", ctx.org.id);
  if (error) throw new Error(friendly(error.message));
  revalidatePath("/campaigns/templates");
}

const stepSchema = z.object({ channel: z.enum(["email", "sms"]), template_id: z.uuid(), delay_days: z.coerce.number().int().min(0).max(90) });

export async function saveCampaignAction(campaignId: string | null, _prev: OutreachState, formData: FormData): Promise<OutreachState> {
  const ctx = await requirePermission("assignLeads");
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) return { fieldErrors: { name: ["Name the sequence (up to 80 characters)"] } };
  const steps = [];
  for (let i = 0; i < 10; i++) {
    const template_id = String(formData.get(`step_${i}_template`) ?? "");
    if (!template_id) continue;
    const parsed = stepSchema.safeParse({ channel: formData.get(`step_${i}_channel`), template_id, delay_days: formData.get(`step_${i}_delay`) });
    if (!parsed.success) return { error: `Step ${i + 1}: ${parsed.error.issues[0].message}` };
    steps.push(parsed.data);
  }
  const row = { name, steps, stop_on_reply: formData.get("stop_on_reply") === "on" };
  const { data, error } = campaignId
    ? await ctx.supabase.from("campaigns").update(row).eq("id", campaignId).eq("organization_id", ctx.org.id).select("id").single()
    : await ctx.supabase.from("campaigns").insert({ ...row, organization_id: ctx.org.id, created_by: ctx.userId }).select("id").single();
  if (error) return { error: friendly(error.message) };
  revalidatePath("/campaigns");
  if (!campaignId) redirect(`/campaigns/${data.id}`);
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true, message: "Saved." };
}

export async function setCampaignStatusAction(campaignId: string, status: "active" | "paused" | "archived" | "draft") {
  const ctx = await requirePermission("assignLeads");
  const { error } = await ctx.supabase.from("campaigns").update({ status }).eq("id", campaignId).eq("organization_id", ctx.org.id);
  if (error) throw new Error(friendly(error.message));
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

// ---------------------------------------------------------------------------
// Sender settings
// ---------------------------------------------------------------------------

export async function saveSendingSettingsAction(_prev: OutreachState, formData: FormData): Promise<OutreachState> {
  const ctx = await requirePermission("manageSettings");
  const fromName = String(formData.get("email_from_name") ?? "").trim().slice(0, 80) || null;
  const rawFrom = String(formData.get("email_from_address") ?? "").trim();
  const from = rawFrom ? normalizeEmail(rawFrom) : null;
  if (rawFrom && !from) return { fieldErrors: { email_from_address: ["Enter a valid email address"] } };
  const postal = String(formData.get("postal_address") ?? "").trim().slice(0, 300) || null;
  const rawSms = String(formData.get("sms_from_number") ?? "").trim();
  const sms = rawSms ? normalizePhone(rawSms, ctx.org.primary_market) : null;
  if (rawSms && !sms) return { fieldErrors: { sms_from_number: ["Enter the number in international format, e.g. +12125550123"] } };
  const { error } = await ctx.supabase.from("organization_settings").update({
    email_from_name: fromName, email_from_address: from, postal_address: postal, sms_from_number: sms,
  }).eq("organization_id", ctx.org.id);
  if (error) return { error: error.message.includes("org_sms_number_unique") ? "That SMS number belongs to another workspace." : error.message };
  revalidatePath("/settings");
  return { ok: true, message: "Saved." };
}

// ---------------------------------------------------------------------------
// AI qualification
// ---------------------------------------------------------------------------

export async function qualifyLeadAction(leadId: string): Promise<OutreachState> {
  const ctx = await requirePermission("workCrm");
  if (!anthropicConfig().enabled) return { error: "AI is not connected. Set ANTHROPIC_API_KEY on the server." };
  const [{ data: lead }, { data: acts }, { data: msgs }] = await Promise.all([
    ctx.supabase.from("leads").select("full_name, segment, property_interest, property_type, preferred_location, budget_min_minor, budget_max_minor, currency, timeline, notes, custom_fields")
      .eq("id", leadId).eq("organization_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("lead_activities").select("kind, summary, occurred_at").eq("lead_id", leadId)
      .in("kind", ["note", "call", "email", "sms", "whatsapp", "meeting", "appointment"]).order("occurred_at", { ascending: false }).limit(40),
    ctx.supabase.from("messages").select("direction, channel, body, created_at").eq("lead_id", leadId).neq("status", "blocked").order("created_at", { ascending: false }).limit(30),
  ]);
  if (!lead) return { error: "Lead not found." };
  // Only what the assessment needs: no email, phone or other contact identifiers.
  const record = JSON.stringify({
    lead: { ...lead, full_name: undefined, first_name: lead.full_name.split(" ")[0] },
    activity: (acts ?? []).reverse(),
    messages: (msgs ?? []).reverse(),
  }, null, 1).slice(0, 60_000);

  const r = await qualifyLead(record);
  const { error } = await ctx.supabase.from("ai_runs").insert({
    organization_id: ctx.org.id, lead_id: leadId, task: "qualify_lead", model: r.model, prompt_version: QUALIFY_PROMPT_VERSION,
    status: r.ok ? "succeeded" : r.refused ? "rejected" : "failed", output: r.ok ? r.output : null, error: r.ok ? null : r.error,
    input_tokens: r.inputTokens ?? null, output_tokens: r.outputTokens ?? null, latency_ms: r.latencyMs, created_by: ctx.userId,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/leads/${leadId}`);
  return r.ok ? { ok: true } : { error: r.error };
}

const STAGE_FOR_SUGGESTION: Record<Exclude<Qualification["suggested_stage"], "no_change">, string> = {
  engaged: "engaged", qualified: "qualified", interested: "interested", nurturing: "nurturing", unqualified: "unqualified",
};

/** A person accepts the AI's suggestion: the score is applied, and optionally the suggested stage. */
export async function applyQualificationAction(runId: string, applyStage: boolean) {
  const ctx = await requirePermission("workCrm");
  const { data: run } = await ctx.supabase.from("ai_runs").select("lead_id, output, status, applied_at").eq("id", runId).eq("organization_id", ctx.org.id).single();
  if (!run || run.status !== "succeeded" || !run.lead_id) throw new Error("Nothing to apply.");
  const out = run.output as Qualification;
  const update: Record<string, unknown> = { score: out.score };
  if (applyStage && out.suggested_stage !== "no_change") {
    const { data: stage } = await ctx.supabase.from("pipeline_stages").select("id").eq("organization_id", ctx.org.id).eq("key", STAGE_FOR_SUGGESTION[out.suggested_stage]).maybeSingle();
    if (stage) update.stage_id = stage.id;
  }
  const { error } = await ctx.supabase.from("leads").update(update).eq("id", run.lead_id).eq("organization_id", ctx.org.id);
  if (error) throw new Error(friendly(error.message));
  await ctx.supabase.from("ai_runs").update({ applied_by: ctx.userId, applied_at: new Date().toISOString() }).eq("id", runId);
  await ctx.supabase.from("lead_activities").insert({
    organization_id: ctx.org.id, lead_id: run.lead_id, kind: "note", actor_id: ctx.userId,
    summary: `Applied AI assessment: score ${out.score}${update.stage_id ? `, stage → ${out.suggested_stage}` : ""}. ${out.summary}`,
  });
  revalidatePath(`/leads/${run.lead_id}`);
}
