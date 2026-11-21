"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";

async function writer(slug: string) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) throw new Error("Not allowed");
  return ctx;
}

export async function moveResearchAction(slug: string, fd: FormData) {
  const ctx = await writer(slug);
  const { error } = await ctx.supabase.from("research_cards").update({ status: z.enum(["to_start", "research", "in_progress", "done"]).parse(fd.get("status")) })
    .eq("id", z.uuid().parse(fd.get("id"))).eq("organization_id", ctx.company.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/research`);
}

export async function addResearchAction(slug: string, fd: FormData) {
  const ctx = await writer(slug);
  const v = z.object({ title: z.string().trim().min(2).max(200), account: z.string().trim().max(200).catch(""), due_on: z.iso.date().nullable().catch(null),
    assignee_id: z.uuid().nullable().catch(null), priority: z.enum(["normal", "high"]).catch("normal"), details: z.string().trim().max(4000).catch("") })
    .parse({ title: fd.get("title"), account: fd.get("account"), due_on: fd.get("due_on") || null, assignee_id: fd.get("assignee_id") || null, priority: fd.get("priority"), details: fd.get("details") });
  const { error } = await ctx.supabase.from("research_cards").insert({ organization_id: ctx.company.id, ...v, account: v.account || null, details: v.details || null });
  revalidatePath(`/c/${slug}/research`);
  redirect(`/c/${slug}/research${error ? `?note=${encodeURIComponent(error.message)}` : ""}`);
}
