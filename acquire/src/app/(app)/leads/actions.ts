"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContext, requirePermission } from "@/lib/auth";
import { consentFormSchema, fieldErrors, leadFormSchema, normalizeLead, noteSchema, savedViewSchema, suppressionFormSchema, type FieldErrors } from "@/domain/schemas";
import { MAX_IMPORT_BYTES, planImport, type ImportPlan } from "@/domain/lead-import";
import { fromLocalInput } from "@/domain/dates";

export type FormState = { error?: string; fieldErrors?: FieldErrors; ok?: boolean; message?: string };

function friendly(message: string): string {
  if (message.includes("leads_email_unique")) return "A lead with this email already exists in your workspace.";
  if (message.includes("leads_phone_unique")) return "A lead with this phone number already exists in your workspace.";
  if (message.includes("row-level security")) return "Your role does not allow this change.";
  if (message.includes("suppression_unique")) return "This contact is already suppressed for that channel.";
  return message;
}

async function findDuplicate(ctx: Awaited<ReturnType<typeof getContext>>, email: string | null, phone: string | null, exceptId?: string) {
  // Quote values: an email may legally contain characters PostgREST treats as syntax.
  const quote = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const parts = [email && `email_normalized.eq.${quote(email)}`, phone && `phone_e164.eq.${quote(phone)}`].filter(Boolean) as string[];
  if (parts.length === 0) return null;
  let q = ctx.supabase.from("leads").select("id, full_name").eq("organization_id", ctx.org.id).or(parts.join(",")).limit(1);
  if (exceptId) q = q.neq("id", exceptId);
  const { data } = await q.maybeSingle();
  return data;
}

export async function createLeadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("createLeads");
  const parsed = leadFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { errors, values } = normalizeLead(parsed.data, ctx.org.primary_market, ctx.org.timezone);
  if (Object.keys(errors).length) return { fieldErrors: errors };
  // Reps create leads for themselves; RLS rejects anything else.
  if (!ctx.can.assignLeads) values.owner_id = ctx.userId;

  const dup = await findDuplicate(ctx, values.email, values.phone_e164);
  if (dup) return { error: `Possible duplicate: ${dup.full_name} already has this email or phone. Open that lead instead.` };

  const { data, error } = await ctx.supabase
    .from("leads")
    .insert({ ...values, organization_id: ctx.org.id, created_by: ctx.userId })
    .select("id")
    .single();
  if (error) return { error: friendly(error.message) };
  revalidatePath("/leads");
  redirect(`/leads/${data.id}`);
}

export async function updateLeadAction(leadId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("createLeads");
  const parsed = leadFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { errors, values } = normalizeLead(parsed.data, ctx.org.primary_market, ctx.org.timezone);
  if (Object.keys(errors).length) return { fieldErrors: errors };

  const dup = await findDuplicate(ctx, values.email, values.phone_e164, leadId);
  if (dup) return { error: `Another lead (${dup.full_name}) already has this email or phone.` };

  const update: Record<string, unknown> = { ...values };
  if (!ctx.can.assignLeads) delete update.owner_id; // reps cannot reassign
  const { data, error } = await ctx.supabase.from("leads").update(update).eq("id", leadId).eq("organization_id", ctx.org.id).select("id");
  if (error) return { error: friendly(error.message) };
  if (!data?.length) return { error: "Lead not found, or your role cannot edit it." };
  revalidatePath(`/leads/${leadId}`);
  redirect(`/leads/${leadId}`);
}

export async function setStageAction(leadId: string, formData: FormData) {
  const ctx = await requirePermission("createLeads");
  const stageId = String(formData.get("stage_id") ?? "");
  const { data: stage } = await ctx.supabase.from("pipeline_stages").select("category").eq("id", stageId).eq("organization_id", ctx.org.id).maybeSingle();
  if (stage?.category === "opted_out") throw new Error("To opt someone out, use “Record an opt-out” on this page so it applies to every channel.");
  const { error } = await ctx.supabase.from("leads").update({ stage_id: stageId }).eq("id", leadId).eq("organization_id", ctx.org.id);
  if (error) throw new Error(friendly(error.message));
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/pipeline");
}

export async function assignAction(leadId: string, formData: FormData) {
  const ctx = await requirePermission("assignLeads");
  const owner = String(formData.get("owner_id") ?? "");
  const { error } = await ctx.supabase.from("leads").update({ owner_id: owner || null }).eq("id", leadId).eq("organization_id", ctx.org.id);
  if (error) throw new Error(friendly(error.message));
  revalidatePath(`/leads/${leadId}`);
}

export async function bulkAssignAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("assignLeads");
  const ids = formData.getAll("lead_id").map(String).filter(Boolean).slice(0, 500);
  if (ids.length === 0) return { error: "Select at least one lead." };
  const owner = String(formData.get("owner_id") ?? "");
  const { data, error } = await ctx.supabase.from("leads").update({ owner_id: owner || null }).in("id", ids).eq("organization_id", ctx.org.id).select("id");
  if (error) return { error: friendly(error.message) };
  revalidatePath("/leads");
  return { ok: true, message: `${data?.length ?? 0} lead(s) ${owner ? "assigned" : "unassigned"}.` };
}

export async function addNoteAction(leadId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("createLeads");
  const parsed = noteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await ctx.supabase.from("lead_activities").insert({
    organization_id: ctx.org.id, lead_id: leadId, kind: "note", summary: parsed.data.summary, actor_id: ctx.userId,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function recordConsentAction(leadId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("createLeads");
  const parsed = consentFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const captured = v.captured_at ? new Date(fromLocalInput(v.captured_at, ctx.org.timezone) ?? "invalid") : new Date();
  const expires = v.expires_at ? new Date(fromLocalInput(v.expires_at, ctx.org.timezone) ?? "invalid") : null;
  if (Number.isNaN(captured.getTime()) || captured.getTime() > Date.now() + 60_000) return { fieldErrors: { captured_at: ["Enter a date that is not in the future"] } };
  if (expires && (Number.isNaN(expires.getTime()) || expires <= captured)) return { fieldErrors: { expires_at: ["Expiry must be after capture"] } };
  const { error } = await ctx.supabase.from("consent_records").insert({
    organization_id: ctx.org.id,
    lead_id: leadId,
    channel: v.channel,
    status: v.status,
    basis: v.status === "withdrawn" ? "none_recorded" : v.basis,
    source: v.source,
    evidence_url: v.evidence_url ?? null,
    captured_at: captured.toISOString(),
    expires_at: expires?.toISOString() ?? null,
    recorded_by: ctx.userId,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function suppressAction(leadId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("createLeads");
  const parsed = suppressionFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { data: lead } = await ctx.supabase.from("leads").select("email_normalized, phone_e164").eq("id", leadId).maybeSingle();
  if (!lead) return { error: "Lead not found." };
  const v = parsed.data;
  const targets = [
    (v.target === "email" || v.target === "both") && lead.email_normalized ? { value_type: "email", value: lead.email_normalized } : null,
    (v.target === "phone" || v.target === "both") && lead.phone_e164 ? { value_type: "phone", value: lead.phone_e164 } : null,
  ].filter(Boolean) as { value_type: string; value: string }[];
  if (targets.length === 0) return { error: "This lead has no value of that type to suppress." };
  const { error } = await ctx.supabase.from("suppression_entries").insert(
    targets.map((t) => ({
      ...t, organization_id: ctx.org.id, channel: v.channel ?? null, reason: v.reason, source: v.source ?? null, lead_id: leadId, created_by: ctx.userId,
    })),
  );
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function liftSuppressionAction(leadId: string, suppressionId: string) {
  const ctx = await requirePermission("liftSuppression");
  const { error } = await ctx.supabase.from("suppression_entries").delete().eq("id", suppressionId).eq("organization_id", ctx.org.id);
  if (error) throw new Error(friendly(error.message));
  revalidatePath(`/leads/${leadId}`);
}

export async function eraseLeadAction(leadId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("eraseLeads");
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "ERASE") return { fieldErrors: { confirm: ["Type ERASE to confirm"] } };
  const { error } = await ctx.supabase.rpc("erase_lead", {
    p_org: ctx.org.id, p_lead: leadId, p_keep_suppression: formData.get("keep_suppression") === "on",
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/leads");
  redirect("/leads?erased=1");
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type PreviewState = { error?: string; plan?: ImportPlan; fileName?: string; sha256?: string };
export type CommitState = {
  error?: string;
  sha256?: string;
  result?: { import_id: string; created: number; updated: number; skipped: number; suppressed: number };
};

async function readCsv(formData: FormData): Promise<{ text: string; name: string; sha256: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a CSV file.");
  if (file.size > MAX_IMPORT_BYTES) throw new Error("The file is larger than 5 MB. Split it into smaller files.");
  if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") throw new Error("Upload a .csv file. Excel users: File → Save As → CSV UTF-8.");
  const buf = Buffer.from(await file.arrayBuffer());
  return { text: buf.toString("utf8"), name: file.name.slice(0, 200), sha256: createHash("sha256").update(buf).digest("hex") };
}

export async function previewImportAction(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const ctx = await requirePermission("importLeads");
  try {
    const { text, name, sha256 } = await readCsv(formData);
    const plan = planImport(text, { defaultCountry: ctx.org.primary_market, defaultCurrency: ctx.org.default_currency });
    return { plan, fileName: name, sha256 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read the file." };
  }
}

export async function commitImportAction(_prev: CommitState, formData: FormData): Promise<CommitState> {
  const ctx = await requirePermission("importLeads");
  try {
    // Re-plan from the uploaded bytes on the server; never trust a plan sent by the browser.
    const { text, name, sha256 } = await readCsv(formData);
    const plan = planImport(text, { defaultCountry: ctx.org.primary_market, defaultCurrency: ctx.org.default_currency });
    if (plan.missingColumns.length) return { error: "The file is missing required columns.", sha256 };
    if (plan.rows.length === 0) return { error: "No valid rows to import.", sha256 };
    const onDuplicate = formData.get("on_duplicate") === "update" ? "update" : "skip";
    const source = String(formData.get("source_id") ?? "") || null;
    const owner = String(formData.get("owner_id") ?? "") || null;
    const { data, error } = await ctx.supabase.rpc("import_leads", {
      p_org: ctx.org.id, p_rows: plan.rows, p_source: source, p_on_duplicate: onDuplicate,
      p_file_name: name, p_file_sha256: sha256, p_owner: owner,
    });
    if (error) return { error: friendly(error.message), sha256 };
    revalidatePath("/leads");
    return { result: data as CommitState["result"], sha256 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import failed." };
  }
}

// ---------------------------------------------------------------------------
// Saved views
// ---------------------------------------------------------------------------

export async function saveViewAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await getContext();
  const parsed = savedViewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await ctx.supabase.from("saved_views").insert({
    organization_id: ctx.org.id, user_id: ctx.userId, name: parsed.data.name,
    query: parsed.data.query.replace(/^\?/, ""), is_shared: parsed.data.is_shared && ctx.can.assignLeads,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/leads");
  return { ok: true };
}

export async function deleteViewAction(viewId: string) {
  const ctx = await getContext();
  const { error } = await ctx.supabase.from("saved_views").delete().eq("id", viewId).eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}
