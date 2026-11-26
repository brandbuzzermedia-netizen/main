"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";

const go = (slug: string, m: string) => redirect(`/c/${slug}/settings?growth=${encodeURIComponent(m)}#growth`);
async function manager(slug: string) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.manage")) go(slug, "Only a sales manager or owner can change this.");
  return ctx;
}

/** Booking link, round-robin lead routing and when onboarding starts. */
export async function saveGrowthAction(slug: string, fd: FormData) {
  const ctx = await manager(slug);
  const url = String(fd.get("booking_url") ?? "").trim();
  if (url && !/^https:\/\/\S+$/.test(url)) go(slug, "The booking link must start with https://");
  const members = fd.getAll("routing_members").map((v) => z.uuid().parse(v));
  const { error } = await ctx.supabase.from("growth_settings").upsert({
    organization_id: ctx.company.id, booking_url: url || null, routing_enabled: fd.get("routing_enabled") === "on" && members.length > 0, routing_members: members,
    onboarding_on: z.enum(["first_payment", "full_payment"]).parse(fd.get("onboarding_on")), record_calls: fd.get("record_calls") === "on", updated_at: new Date().toISOString(),
  });
  revalidatePath(`/c/${slug}/settings`);
  go(slug, error ? error.message : "Saved.");
}

export async function addOnboardingStepAction(slug: string, fd: FormData) {
  const ctx = await manager(slug);
  const { count } = await ctx.supabase.from("onboarding_steps").select("id", { count: "exact", head: true }).eq("organization_id", ctx.company.id);
  const { error } = await ctx.supabase.from("onboarding_steps").insert({
    organization_id: ctx.company.id, title: z.string().trim().min(2).max(200).parse(fd.get("title")),
    due_after_days: z.coerce.number().int().min(0).max(365).catch(0).parse(fd.get("due_after_days")),
    assignee_id: z.uuid().nullable().catch(null).parse(fd.get("assignee_id") || null), position: (count ?? 0) + 1,
  });
  revalidatePath(`/c/${slug}/settings`);
  go(slug, error ? error.message : "Step added.");
}

export async function removeOnboardingStepAction(slug: string, fd: FormData) {
  const ctx = await manager(slug);
  await ctx.supabase.from("onboarding_steps").delete().eq("id", z.uuid().parse(fd.get("id"))).eq("organization_id", ctx.company.id);
  revalidatePath(`/c/${slug}/settings`);
  go(slug, "Step removed.");
}

/** AI reply assistant: on/off, channels, what it may say, and replies per person per day. */
export async function saveAiAssistantAction(slug: string, fd: FormData) {
  const ctx = await manager(slug);
  const channels = fd.getAll("ai_reply_channels").map(String).filter((c) => c === "email" || c === "whatsapp");
  const { error } = await ctx.supabase.from("growth_settings").upsert({
    organization_id: ctx.company.id, ai_reply_enabled: fd.get("ai_reply_enabled") === "on" && channels.length > 0, ai_reply_channels: channels.length ? channels : ["email", "whatsapp"],
    ai_knowledge: String(fd.get("ai_knowledge") ?? "").trim().slice(0, 8000) || null,
    ai_daily_limit: z.coerce.number().int().min(1).max(10).catch(3).parse(fd.get("ai_daily_limit")), updated_at: new Date().toISOString(),
  });
  revalidatePath(`/c/${slug}/settings`);
  redirect(`/c/${slug}/settings?ai=${encodeURIComponent(error ? error.message : "AI reply assistant saved.")}#ai`);
}

/** Company monthly target, default GST, services sold, and each person's monthly target ("Name: amount" per line). */
export async function saveSalesSettingsAction(slug: string, fd: FormData) {
  const ctx = await manager(slug);
  const back = (m: string) => redirect(`/c/${slug}/settings?sales=${encodeURIComponent(m)}#sales`);
  const target = z.coerce.number().min(0).max(1e10).catch(0).parse(fd.get("monthly_target"));
  const gst = z.coerce.number().min(0).max(28).catch(18).parse(fd.get("default_gst"));
  const services = String(fd.get("services") ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 40).map((x) => x.slice(0, 80));
  const { error } = await ctx.supabase.from("company_targets").upsert({ organization_id: ctx.company.id, monthly_target_minor: Math.round(target * 100), default_gst_bp: Math.round(gst * 100), services, updated_at: new Date().toISOString() });
  if (error) back(error.message);
  const { data: ms } = await ctx.supabase.from("memberships").select("user_id, user:users(full_name, email)").eq("organization_id", ctx.company.id);
  const people = ((ms ?? []) as unknown as { user_id: string; user: { full_name: string | null; email: string | null } | null }[]);
  const unknown: string[] = [];
  for (const line of String(fd.get("member_targets") ?? "").split("\n").map((x) => x.trim()).filter(Boolean)) {
    const m = line.match(/^(.+?)\s*[:=-]\s*₹?\s*([\d,.]+)\s*$/);
    if (!m) { unknown.push(line); continue; }
    const who = m[1].toLowerCase();
    const p = people.find((x) => (x.user?.full_name ?? "").toLowerCase() === who || (x.user?.email ?? "").toLowerCase() === who);
    if (!p) { unknown.push(m[1]); continue; }
    await ctx.supabase.from("member_targets").upsert({ organization_id: ctx.company.id, user_id: p.user_id, monthly_target_minor: Math.round(Number(m[2].replace(/,/g, "")) * 100) });
  }
  revalidatePath(`/c/${slug}`, "layout");
  back(unknown.length ? `Saved. Not matched to a team member: ${unknown.join(", ")}.` : "Sales settings saved.");
}

/** Company brand: logo and colours for the whole OS of this company (owners and admins). */
export async function saveBrandAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  const back = (m: string) => redirect(`/c/${slug}/settings?brand=${encodeURIComponent(m)}#brand`);
  if (!ctx.can("company.settings")) back("Only an owner or company admin can change the brand.");
  const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
  const v = z.object({ sidebar_color: hex, accent_color: hex, logo_bg: hex }).safeParse({ sidebar_color: fd.get("sidebar_color"), accent_color: fd.get("accent_color"), logo_bg: fd.get("logo_bg") });
  if (!v.success) back("Pick the colours again.");
  let logo_url: string | null | undefined;
  const file = fd.get("logo");
  if (file instanceof File && file.size > 0) {
    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[file.type];
    if (!ext) back("The logo must be a PNG, JPG or WebP image.");
    if (file.size > 1_048_576) back("The logo must be 1 MB or smaller.");
    const path = `${ctx.company.id}/logo-${Date.now()}.${ext}`;
    const up = await ctx.supabase.storage.from("brand").upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (up.error) back(`Logo upload failed: ${up.error.message}`);
    logo_url = ctx.supabase.storage.from("brand").getPublicUrl(path).data.publicUrl;
  } else if (fd.get("remove_logo") === "on") logo_url = null;
  const { error } = await ctx.supabase.from("organizations").update({ ...v.data!, brand_custom: fd.get("brand_custom") === "on", ...(logo_url !== undefined ? { logo_url } : {}) }).eq("id", ctx.company.id);
  revalidatePath(`/c/${slug}`, "layout");
  back(error ? error.message : "Brand saved. Your sidebar, buttons and tiles now use it.");
}
