"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl, hasServiceRole } from "@/lib/env";
import { fieldErrors, memberSchema, settingsSchema, sourceSchema, stageSchema, type FieldErrors } from "@/domain/schemas";
import { ROLES, type Role } from "@/domain/labels";

export type FormState = { error?: string; fieldErrors?: FieldErrors; ok?: boolean; message?: string };

export async function updateSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("manageSettings");
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const [org, settings] = await Promise.all([
    ctx.supabase.from("organizations").update({ name: v.name, timezone: v.timezone }).eq("id", ctx.org.id),
    ctx.supabase.from("organization_settings").update({
      contact_window_start: v.contact_window_start, contact_window_end: v.contact_window_end, implied_inquiry_days: v.implied_inquiry_days,
    }).eq("organization_id", ctx.org.id),
  ]);
  const error = org.error ?? settings.error;
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

/**
 * Adds a colleague. Existing users are added directly; new emails get a Supabase invite first.
 * The service-role client is used only to look up / invite the auth user; the membership itself
 * is written as the caller through add_member(), which re-checks the admin role and seat limit.
 */
export async function inviteMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("manageTeam");
  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  if (!hasServiceRole()) return { error: "Inviting needs SUPABASE_SERVICE_ROLE_KEY on the server. See docs/DEPLOYMENT.md." };
  const admin = createAdminClient();
  const { email, role } = parsed.data;

  let userId: string | null = null;
  const { data: existing, error: lookupError } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  if (lookupError) return { error: lookupError.message };
  if (existing) {
    userId = existing.id;
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${appUrl()}/auth/callback?next=/` });
    if (error) return { error: `Could not send the invite: ${error.message}` };
    userId = data.user.id;
  }
  const { error } = await ctx.supabase.rpc("add_member", { p_org: ctx.org.id, p_user: userId, p_role: role });
  if (error) return { error: error.message };
  revalidatePath("/settings/team");
  return { ok: true, message: existing ? `${email} now has access.` : `Invite sent to ${email}.` };
}

export async function changeRoleAction(userId: string, formData: FormData) {
  const ctx = await requirePermission("manageTeam");
  const role = String(formData.get("role")) as Role;
  if (!ROLES.includes(role)) throw new Error("Unknown role");
  const { error } = await ctx.supabase.from("memberships").update({ role }).eq("organization_id", ctx.org.id).eq("user_id", userId);
  if (error) throw new Error(error.message.includes("at least one agency admin") ? "The workspace must keep at least one agency admin." : error.message);
  revalidatePath("/settings/team");
}

export async function removeMemberAction(userId: string) {
  const ctx = await requirePermission("manageTeam");
  if (userId === ctx.userId) throw new Error("You cannot remove yourself.");
  // Their leads become unassigned rather than invisible.
  const { error: unassign } = await ctx.supabase.from("leads").update({ owner_id: null }).eq("organization_id", ctx.org.id).eq("owner_id", userId);
  if (unassign) throw new Error(unassign.message);
  const { error } = await ctx.supabase.from("memberships").delete().eq("organization_id", ctx.org.id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/team");
}

// ---------------------------------------------------------------------------
// Pipeline stages and sources
// ---------------------------------------------------------------------------

function stageKey(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "s_$1").slice(0, 30) || "stage";
  return `${base}_${Math.random().toString(36).slice(2, 6)}`;
}

export async function addStageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("configurePipeline");
  const parsed = stageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  if (parsed.data.category === "opted_out") return { fieldErrors: { category: ["Only the built-in Opted out stage can use that category"] } };
  const { data: last } = await ctx.supabase.from("pipeline_stages").select("position").eq("organization_id", ctx.org.id).neq("category", "opted_out")
    .order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await ctx.supabase.from("pipeline_stages").insert({
    organization_id: ctx.org.id, key: stageKey(parsed.data.name), name: parsed.data.name, category: parsed.data.category, position: (last?.position ?? 0) + 5,
  });
  if (error) return { error: error.message };
  revalidatePath("/settings/pipeline");
  return { ok: true };
}

export async function updateStageAction(stageId: string, formData: FormData) {
  const ctx = await requirePermission("configurePipeline");
  const parsed = stageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const { data: stage } = await ctx.supabase.from("pipeline_stages").select("is_system, category").eq("id", stageId).single();
  // System stages keep their category, because automation depends on it.
  const update = stage?.is_system ? { name: parsed.data.name } : parsed.data.category === "opted_out" ? { name: parsed.data.name } : parsed.data;
  const { error } = await ctx.supabase.from("pipeline_stages").update(update).eq("id", stageId).eq("organization_id", ctx.org.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/pipeline");
}

export async function moveStageAction(stageId: string, direction: "up" | "down") {
  const ctx = await requirePermission("configurePipeline");
  const { data } = await ctx.supabase.from("pipeline_stages").select("id, position").eq("organization_id", ctx.org.id).order("position");
  const list = data ?? [];
  const i = list.findIndex((s) => s.id === stageId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  // Rewrite positions in steps of 10 so later inserts have room.
  for (const [idx, s] of list.entries()) {
    const { error } = await ctx.supabase.from("pipeline_stages").update({ position: (idx + 1) * 10 }).eq("id", s.id);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/settings/pipeline");
}

export async function deleteStageAction(stageId: string) {
  const ctx = await requirePermission("configurePipeline");
  const { count } = await ctx.supabase.from("leads").select("id", { count: "exact", head: true }).eq("stage_id", stageId);
  if (count) throw new Error(`${count} lead(s) are in this stage. Move them first.`);
  const { error } = await ctx.supabase.from("pipeline_stages").delete().eq("id", stageId).eq("organization_id", ctx.org.id).eq("is_system", false);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/pipeline");
}

export async function addSourceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("configurePipeline");
  const parsed = sourceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await ctx.supabase.from("lead_sources").insert({ ...parsed.data, provenance_note: parsed.data.provenance_note ?? null, organization_id: ctx.org.id });
  if (error) return { error: error.message.includes("lead_sources_name_unique") ? "A source with that name already exists." : error.message };
  revalidatePath("/settings/sources");
  return { ok: true };
}

export async function toggleSourceAction(sourceId: string, active: boolean) {
  const ctx = await requirePermission("configurePipeline");
  const { error } = await ctx.supabase.from("lead_sources").update({ is_active: active }).eq("id", sourceId).eq("organization_id", ctx.org.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/sources");
}
