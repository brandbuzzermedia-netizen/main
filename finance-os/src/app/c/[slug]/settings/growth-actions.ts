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
