"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCompanyContext, type Permission } from "@/lib/workspace";
import { parseMoneyToMinor } from "@/domain/money";
import { MODULE_KEYS, CORE_MODULES } from "@/domain/registry";

/**
 * Company-scoped mutations. Each one re-resolves the company from the slug (membership
 * required), checks the permission here for a clear message, and then writes through the
 * user's own Supabase client so RLS enforces the same rule in the database.
 */

export type FormState = { error?: string; ok?: string; fields?: Record<string, string[] | undefined> };

async function scoped(slug: string, perm: Permission) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can(perm)) throw new Error("Your role does not allow this.");
  return ctx;
}

const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").optional().or(z.literal("")).transform((v) => v || null);
const uuid = z.uuid();

const dealSchema = z.object({
  title: z.string().trim().min(1, "Give the deal a name").max(200),
  account_name: optText(200),
  stage_id: uuid,
  value: z.string().trim().default("0"),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code").default("INR"),
  owner_id: uuid.optional().or(z.literal("")).transform((v) => v || null),
  is_hot: z.literal("on").optional(),
  expected_close_on: optDate,
  next_action: optText(300),
  next_action_on: optDate,
  source: optText(80),
});

function formToObject(fd: FormData) {
  return Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

export async function createDealAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await scoped(slug, "crm.write");
  const parsed = dealSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { error: "Check the highlighted fields.", fields: z.flattenError(parsed.error).fieldErrors };
  let value: number;
  try {
    value = parseMoneyToMinor(parsed.data.value || "0");
  } catch (e) {
    return { fields: { value: [(e as Error).message] } };
  }
  // Without crm.read_all a person can only create deals they own.
  const owner = ctx.can("crm.read_all") ? parsed.data.owner_id ?? ctx.userId : ctx.userId;
  const { is_hot, value: _v, ...rest } = parsed.data;
  void _v;
  const { error } = await ctx.supabase.from("deals").insert({
    ...rest, organization_id: ctx.company.id, value_minor: value, owner_id: owner, is_hot: Boolean(is_hot),
  });
  if (error) return { error: error.message };
  revalidatePath(`/c/${slug}`, "layout");
  redirect(`/c/${slug}/pipeline`);
}

const stageMove = z.object({ deal_id: uuid, stage_id: uuid });

export async function moveDealAction(slug: string, fd: FormData) {
  const ctx = await scoped(slug, "crm.write");
  const { deal_id, stage_id } = stageMove.parse(formToObject(fd));
  const { error, count } = await ctx.supabase.from("deals").update({ stage_id }, { count: "exact" })
    .eq("id", deal_id).eq("organization_id", ctx.company.id);
  if (error) throw new Error(error.message);
  if (count === 0) throw new Error("That deal was not found or you cannot change it.");
  revalidatePath(`/c/${slug}`, "layout");
}

export async function toggleHotAction(slug: string, fd: FormData) {
  const ctx = await scoped(slug, "crm.write");
  const { deal_id } = z.object({ deal_id: uuid }).parse(formToObject(fd));
  const hot = fd.get("hot") === "true";
  const { error } = await ctx.supabase.from("deals").update({ is_hot: hot }).eq("id", deal_id).eq("organization_id", ctx.company.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}`, "layout");
}

const meetingSchema = z.object({
  title: z.string().trim().min(1, "Give the meeting a title").max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time"),
  duration: z.coerce.number().int().min(5).max(600).default(30),
  deal_id: uuid.optional().or(z.literal("")).transform((v) => v || null),
  location: optText(200),
  owner_id: uuid.optional().or(z.literal("")).transform((v) => v || null),
});

export async function createMeetingAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await scoped(slug, "crm.write");
  const parsed = meetingSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { error: "Check the highlighted fields.", fields: z.flattenError(parsed.error).fieldErrors };
  const m = parsed.data;
  // Times are entered in India time.
  const starts = new Date(`${m.date}T${m.time}:00+05:30`);
  const owner = ctx.can("crm.read_all") ? m.owner_id ?? ctx.userId : ctx.userId;
  const { error } = await ctx.supabase.from("meetings").insert({
    organization_id: ctx.company.id, title: m.title, starts_at: starts.toISOString(),
    ends_at: new Date(starts.getTime() + m.duration * 60_000).toISOString(), deal_id: m.deal_id, location: m.location, owner_id: owner,
  });
  if (error) return { error: error.message };
  revalidatePath(`/c/${slug}`, "layout");
  return { ok: "Meeting added." };
}

const meetingStatus = z.object({ meeting_id: uuid, status: z.enum(["completed", "cancelled", "no_show"]) });

export async function setMeetingStatusAction(slug: string, fd: FormData) {
  const ctx = await scoped(slug, "crm.write");
  const { meeting_id, status } = meetingStatus.parse(formToObject(fd));
  const { error } = await ctx.supabase.from("meetings").update({ status }).eq("id", meeting_id).eq("organization_id", ctx.company.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}`, "layout");
}

const taskSchema = z.object({
  title: z.string().trim().min(1, "Describe the task").max(200),
  due_on: optDate,
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  assignee_id: uuid.optional().or(z.literal("")).transform((v) => v || null),
  details: optText(2000),
});

export async function createTaskAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await scoped(slug, "tasks.write");
  const parsed = taskSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { error: "Check the highlighted fields.", fields: z.flattenError(parsed.error).fieldErrors };
  const assignee = ctx.can("tasks.read_all") ? parsed.data.assignee_id ?? ctx.userId : ctx.userId;
  const { error } = await ctx.supabase.from("tasks").insert({ ...parsed.data, assignee_id: assignee, organization_id: ctx.company.id, created_by: ctx.userId });
  if (error) return { error: error.message };
  revalidatePath(`/c/${slug}`, "layout");
  return { ok: "Task added." };
}

const taskStatus = z.object({ task_id: uuid, status: z.enum(["open", "in_progress", "done", "cancelled"]) });

export async function setTaskStatusAction(slug: string, fd: FormData) {
  const ctx = await scoped(slug, "tasks.write");
  const { task_id, status } = taskStatus.parse(formToObject(fd));
  const { error, count } = await ctx.supabase.from("tasks").update({ status }, { count: "exact" }).eq("id", task_id).eq("organization_id", ctx.company.id);
  if (error) throw new Error(error.message);
  if (count === 0) throw new Error("That task was not found or is not assigned to you.");
  revalidatePath(`/c/${slug}`, "layout");
}

const COMPANY_ROLES = ["owner", "company_admin", "finance", "viewer", "account_manager", "sales_manager", "sales_rep",
  "operations_manager", "marketing_manager", "staff", "accountant", "partner"] as const;

export async function addMemberAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await scoped(slug, "members.manage");
  const parsed = z.object({ email: z.string().trim().email("Enter an email address"), role: z.enum(COMPANY_ROLES) }).safeParse(formToObject(fd));
  if (!parsed.success) return { fields: z.flattenError(parsed.error).fieldErrors };
  const { data, error } = await ctx.supabase.rpc("invite_member", { p_org: ctx.company.id, p_email: parsed.data.email, p_role: parsed.data.role });
  if (error) return { error: error.message };
  revalidatePath(`/c/${slug}/team`);
  return data === "invited"
    ? { ok: `${parsed.data.email} is invited. They get this role the first time they sign in with that email (link valid 14 days).` }
    : { ok: `${parsed.data.email} added.` };
}

export async function revokeInvitationAction(slug: string, fd: FormData) {
  const ctx = await scoped(slug, "members.manage");
  const { error } = await ctx.supabase.rpc("revoke_invitation", { p_invitation: uuid.parse(fd.get("invitation_id")) });
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/team`);
}

/** Deactivation archives the membership with a reason; it can be restored. Nothing the person created is removed. */
export async function deactivateMemberAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await scoped(slug, "members.manage");
  const parsed = z.object({ membership_id: uuid, reason: z.string().trim().min(3, "Say why (a few words)").max(300) }).safeParse(formToObject(fd));
  if (!parsed.success) return { fields: z.flattenError(parsed.error).fieldErrors };
  const { error } = await ctx.supabase.rpc("deactivate_member", { p_membership: parsed.data.membership_id, p_reason: parsed.data.reason });
  if (error) return { error: error.message.includes("last owner") ? "A company must keep at least one owner." : error.message };
  revalidatePath(`/c/${slug}/team`);
  redirect(`/c/${slug}/team`);
}

export async function reactivateMemberAction(slug: string, fd: FormData) {
  const ctx = await scoped(slug, "members.manage");
  const { error } = await ctx.supabase.rpc("reactivate_member", { p_history: uuid.parse(fd.get("history_id")) });
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/team`);
}

/** Two-step sign-in requirement for owner, admin and finance roles. The database checks MFA is in use. */
export async function requireMfaAction(slug: string, fd: FormData) {
  const ctx = await scoped(slug, "company.settings");
  const { error } = await ctx.supabase.rpc("set_require_mfa", { p_org: ctx.company.id, p_on: fd.get("on") === "true" });
  if (error) redirect(`/c/${slug}/settings?mfa_error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/c/${slug}`, "layout");
}

export async function changeRoleAction(slug: string, fd: FormData) {
  const ctx = await scoped(slug, "members.manage");
  const { membership_id, role } = z.object({ membership_id: uuid, role: z.enum(COMPANY_ROLES) }).parse(formToObject(fd));
  const { error, count } = await ctx.supabase.from("memberships").update({ role }, { count: "exact" })
    .eq("id", membership_id).eq("organization_id", ctx.company.id);
  if (error) throw new Error(error.message);
  if (count === 0) throw new Error("You cannot change that membership.");
  revalidatePath(`/c/${slug}/team`);
}

export async function saveModulesAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await scoped(slug, "company.settings");
  const chosen = fd.getAll("modules").filter((m): m is string => typeof m === "string");
  const modules = MODULE_KEYS.filter((k) => chosen.includes(k) || CORE_MODULES.includes(k));
  const colors = z.object({
    sidebar_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a #RRGGBB colour"),
    accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a #RRGGBB colour"),
  }).safeParse(formToObject(fd));
  if (!colors.success) return { fields: z.flattenError(colors.error).fieldErrors };
  const { error } = await ctx.supabase.from("organizations").update({ enabled_modules: modules, ...colors.data }).eq("id", ctx.company.id);
  if (error) return { error: error.message };
  revalidatePath(`/c/${slug}`, "layout");
  return { ok: "Settings saved." };
}

export async function emergencyStopAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await scoped(slug, "company.emergency_stop");
  const on = fd.get("on") === "true";
  const reason = String(fd.get("reason") ?? "").trim();
  if (on && reason.length < 5) return { fields: { reason: ["Say why (at least a few words). It is recorded in the audit log."] } };
  const { error } = await ctx.supabase.rpc("set_emergency_stop", { p_org: ctx.company.id, p_on: on, p_reason: on ? reason : null });
  if (error) return { error: error.message };
  revalidatePath(`/c/${slug}`, "layout");
  return { ok: on ? "Emergency stop is on." : "Company resumed." };
}

export async function aiSettingsAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await scoped(slug, "finance.approve");
  const limit = z.coerce.number().int().min(0).max(50_000_000).safeParse(fd.get("ai_monthly_token_limit"));
  const self = z.string().trim().default("0").safeParse(fd.get("self_approval_limit"));
  if (!limit.success || !self.success) return { error: "Enter whole numbers." };
  let selfMinor: number;
  try { selfMinor = parseMoneyToMinor(self.data || "0"); } catch (e) { return { error: (e as Error).message }; }
  const { error } = await ctx.supabase.from("app_settings").update({ ai_enabled: fd.get("ai_enabled") === "on", ai_monthly_token_limit: limit.data, self_approval_limit_minor: selfMinor })
    .eq("organization_id", ctx.company.id);
  if (error) return { error: error.message };
  revalidatePath(`/c/${slug}/settings`);
  return { ok: "Saved." };
}

/** Sidebar emergency-stop toggle (reason required to stop; audited by the database). */
export async function toggleStopAction(slug: string, fd: FormData): Promise<void> {
  const res = await emergencyStopAction(slug, {}, fd);
  if (res.error || res.fields) throw new Error(res.error ?? res.fields?.reason?.[0] ?? "Could not change the emergency stop");
}

/** Settings switch for one module (the design's module registry). */
export async function toggleModuleAction(slug: string, fd: FormData): Promise<void> {
  const ctx = await scoped(slug, "company.settings");
  const key = z.enum(MODULE_KEYS as [string, ...string[]]).parse(fd.get("module"));
  if (CORE_MODULES.includes(key as never)) return;
  const on = fd.get("on") === "true";
  const next = on ? Array.from(new Set([...ctx.company.enabled_modules, key])) : ctx.company.enabled_modules.filter((m) => m !== key);
  const { error } = await ctx.supabase.from("organizations").update({ enabled_modules: next }).eq("id", ctx.company.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}`, "layout");
}
