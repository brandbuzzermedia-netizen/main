"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { appointmentSchema, dealSchema, dealStageSchema, fieldErrors, interactionSchema, taskSchema, type FieldErrors } from "@/domain/schemas";
import { parseAmount } from "@/domain/money";
import { fromLocalInput } from "@/domain/dates";
import { TASK_STATUSES, APPOINTMENT_STATUSES, type TaskStatus, type AppointmentStatus } from "@/domain/labels";

export type CrmFormState = { error?: string; fieldErrors?: FieldErrors; ok?: boolean };

function friendly(message: string): string {
  if (message.includes("row-level security")) return "Your role does not allow this change.";
  if (message.includes("must be a member")) return "Choose someone who is a member of this workspace.";
  if (message.includes("ends_at")) return "The appointment must end after it starts.";
  return message;
}

function refresh(leadId?: string | null) {
  if (leadId) revalidatePath(`/leads/${leadId}`);
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

export async function logInteractionAction(leadId: string, _prev: CrmFormState, formData: FormData): Promise<CrmFormState> {
  const ctx = await requirePermission("workCrm");
  const parsed = interactionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const at = v.occurred_at ? fromLocalInput(v.occurred_at, ctx.org.timezone) : new Date().toISOString();
  if (!at) return { fieldErrors: { occurred_at: ["Enter a valid date and time"] } };
  const { error } = await ctx.supabase.rpc("log_interaction", {
    p_org: ctx.org.id, p_lead: leadId, p_kind: v.kind, p_direction: v.direction,
    p_outcome: v.outcome ?? null, p_summary: v.summary, p_occurred_at: at,
  });
  if (error) return { error: friendly(error.message) };
  refresh(leadId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

function dealValues(formData: FormData) {
  const parsed = dealSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const value = parseAmount(v.value, v.currency);
  const commission = parseAmount(v.commission, v.currency);
  const errors: FieldErrors = {};
  if (Number.isNaN(value)) errors.value = ["Enter a number, e.g. 650000 or 650k"];
  if (Number.isNaN(commission)) errors.commission = ["Enter a number, e.g. 19500"];
  if (Object.keys(errors).length) return { errors };
  return {
    values: {
      title: v.title, deal_type: v.deal_type, value_minor: value, commission_minor: commission, currency: v.currency,
      stage_id: v.stage_id, owner_id: v.owner_id ?? null, expected_close_date: v.expected_close_date ?? null,
      lost_reason: v.lost_reason ?? null, property_ref: v.property_ref ?? null, notes: v.notes ?? null,
    },
  };
}

export async function createDealAction(leadId: string, _prev: CrmFormState, formData: FormData): Promise<CrmFormState> {
  const ctx = await requirePermission("workCrm");
  const r = dealValues(formData);
  if (r.errors) return { fieldErrors: r.errors };
  if (!ctx.can.assignLeads) r.values.owner_id = ctx.userId;
  const { data, error } = await ctx.supabase.from("deals")
    .insert({ ...r.values, organization_id: ctx.org.id, lead_id: leadId, created_by: ctx.userId })
    .select("id").single();
  if (error) return { error: friendly(error.message) };
  refresh(leadId);
  redirect(`/deals/${data.id}`);
}

export async function updateDealAction(dealId: string, _prev: CrmFormState, formData: FormData): Promise<CrmFormState> {
  const ctx = await requirePermission("workCrm");
  const r = dealValues(formData);
  if (r.errors) return { fieldErrors: r.errors };
  const update: Record<string, unknown> = { ...r.values };
  if (!ctx.can.assignLeads) delete update.owner_id;
  const { data, error } = await ctx.supabase.from("deals").update(update).eq("id", dealId).eq("organization_id", ctx.org.id).select("lead_id");
  if (error) return { error: friendly(error.message) };
  if (!data?.length) return { error: "Deal not found, or your role cannot edit it." };
  refresh(data[0].lead_id);
  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

/** Used by the deal board's drag and drop and its keyboard menu. */
export async function moveDealAction(dealId: string, stageId: string): Promise<{ error?: string }> {
  const ctx = await requirePermission("workCrm");
  const { data, error } = await ctx.supabase.from("deals").update({ stage_id: stageId }).eq("id", dealId).eq("organization_id", ctx.org.id).select("lead_id");
  if (error) return { error: friendly(error.message) };
  if (!data?.length) return { error: "You cannot move this deal." };
  refresh(data[0].lead_id);
  revalidatePath("/deals");
  return {};
}

export async function deleteDealAction(dealId: string) {
  const ctx = await requirePermission("assignLeads");
  const { data, error } = await ctx.supabase.from("deals").delete().eq("id", dealId).eq("organization_id", ctx.org.id).select("lead_id");
  if (error) throw new Error(friendly(error.message));
  refresh(data?.[0]?.lead_id);
  redirect("/deals");
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function createTaskAction(leadId: string | null, _prev: CrmFormState, formData: FormData): Promise<CrmFormState> {
  const ctx = await requirePermission("workCrm");
  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const due = v.due_at ? fromLocalInput(v.due_at, ctx.org.timezone) : null;
  if (v.due_at && !due) return { fieldErrors: { due_at: ["Enter a valid date and time"] } };
  const { error } = await ctx.supabase.from("tasks").insert({
    organization_id: ctx.org.id, lead_id: leadId, title: v.title, due_at: due, priority: v.priority, notes: v.notes ?? null,
    assignee_id: ctx.can.assignLeads ? (v.assignee_id ?? ctx.userId) : ctx.userId, created_by: ctx.userId,
  });
  if (error) return { error: friendly(error.message) };
  refresh(leadId);
  return { ok: true };
}

export async function setTaskStatusAction(taskId: string, status: TaskStatus) {
  const ctx = await requirePermission("workCrm");
  if (!TASK_STATUSES.includes(status)) throw new Error("Unknown status");
  const { data, error } = await ctx.supabase.from("tasks").update({ status }).eq("id", taskId).eq("organization_id", ctx.org.id).select("lead_id");
  if (error) throw new Error(friendly(error.message));
  refresh(data?.[0]?.lead_id);
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export async function createAppointmentAction(leadId: string, _prev: CrmFormState, formData: FormData): Promise<CrmFormState> {
  const ctx = await requirePermission("workCrm");
  const parsed = appointmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const start = fromLocalInput(v.starts_at, ctx.org.timezone);
  if (!start) return { fieldErrors: { starts_at: ["Enter a valid date and time"] } };
  const end = new Date(new Date(start).getTime() + v.duration_minutes * 60_000).toISOString();
  const { error } = await ctx.supabase.from("appointments").insert({
    organization_id: ctx.org.id, lead_id: leadId, kind: v.kind, title: v.title, starts_at: start, ends_at: end,
    location: v.location ?? null, notes: v.notes ?? null, created_by: ctx.userId,
    assigned_to: ctx.can.assignLeads ? (v.assigned_to ?? ctx.userId) : ctx.userId,
  });
  if (error) return { error: friendly(error.message) };
  refresh(leadId);
  return { ok: true };
}

export async function setAppointmentStatusAction(appointmentId: string, status: AppointmentStatus) {
  const ctx = await requirePermission("workCrm");
  if (!APPOINTMENT_STATUSES.includes(status)) throw new Error("Unknown status");
  const { data, error } = await ctx.supabase.from("appointments").update({ status }).eq("id", appointmentId).eq("organization_id", ctx.org.id).select("lead_id");
  if (error) throw new Error(friendly(error.message));
  refresh(data?.[0]?.lead_id);
}

// ---------------------------------------------------------------------------
// Lead pipeline board (drag and drop)
// ---------------------------------------------------------------------------

const OPT_OUT_MESSAGE = "To opt someone out, record the opt-out on the lead page. That suppresses their email and phone for every channel and future import.";

async function isOptedOutStage(ctx: Awaited<ReturnType<typeof requirePermission>>, stageId: string) {
  const { data } = await ctx.supabase.from("pipeline_stages").select("category").eq("id", stageId).eq("organization_id", ctx.org.id).maybeSingle();
  return data?.category === "opted_out";
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export async function moveLeadAction(leadId: string, stageId: string): Promise<{ error?: string }> {
  const ctx = await requirePermission("workCrm");
  if (await isOptedOutStage(ctx, stageId)) return { error: OPT_OUT_MESSAGE };
  const { data, error } = await ctx.supabase.from("leads").update({ stage_id: stageId }).eq("id", leadId).eq("organization_id", ctx.org.id).select("id");
  if (error) return { error: friendly(error.message) };
  if (!data?.length) return { error: "You cannot move this lead." };
  refresh(leadId);
  return {};
}

// ---------------------------------------------------------------------------
// Deal stage settings
// ---------------------------------------------------------------------------

export async function updateDealStageAction(stageId: string, formData: FormData) {
  const ctx = await requirePermission("configureDeals");
  const parsed = dealStageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const { data: stage } = await ctx.supabase.from("deal_stages").select("category").eq("id", stageId).single();
  // Won and lost stages have fixed probabilities (100 / 0).
  const update = stage?.category === "open" ? parsed.data : { name: parsed.data.name };
  const { error } = await ctx.supabase.from("deal_stages").update(update).eq("id", stageId).eq("organization_id", ctx.org.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/pipeline");
}

export async function addDealStageAction(_prev: CrmFormState, formData: FormData): Promise<CrmFormState> {
  const ctx = await requirePermission("configureDeals");
  const parsed = dealStageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { data: lastOpen } = await ctx.supabase.from("deal_stages").select("position").eq("organization_id", ctx.org.id).eq("category", "open")
    .order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await ctx.supabase.from("deal_stages").insert({
    organization_id: ctx.org.id, name: parsed.data.name, category: "open", probability: parsed.data.probability, position: (lastOpen?.position ?? 0) + 5,
  });
  if (error) return { error: error.message };
  revalidatePath("/settings/pipeline");
  return { ok: true };
}

export async function deleteDealStageAction(stageId: string) {
  const ctx = await requirePermission("configureDeals");
  const { count } = await ctx.supabase.from("deals").select("id", { count: "exact", head: true }).eq("stage_id", stageId);
  if (count) throw new Error(`${count} deal(s) are in this stage. Move them first.`);
  const { data: stage } = await ctx.supabase.from("deal_stages").select("category").eq("id", stageId).single();
  if (stage?.category !== "open") throw new Error("The won and lost stages cannot be deleted.");
  const { error } = await ctx.supabase.from("deal_stages").delete().eq("id", stageId).eq("organization_id", ctx.org.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/pipeline");
}
