"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";

/** Moves a follow-up (a task) across the board: To do, In progress, Done. */
export async function moveFollowUpAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("tasks.write")) throw new Error("Not allowed");
  const id = z.uuid().parse(fd.get("id"));
  const status = z.enum(["open", "in_progress", "done"]).parse(fd.get("status"));
  const { error } = await ctx.supabase.from("tasks").update({ status }).eq("id", id).eq("organization_id", ctx.company.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/followups`);
}

export async function addFollowUpAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("tasks.write")) throw new Error("Not allowed");
  const v = z.object({ title: z.string().trim().min(2).max(200), due_on: z.iso.date().nullable().catch(null), assignee_id: z.uuid().nullable().catch(null), details: z.string().trim().max(2000).catch("") })
    .parse({ title: fd.get("title"), due_on: fd.get("due_on") || null, assignee_id: fd.get("assignee_id") || null, details: fd.get("details") });
  const { error } = await ctx.supabase.from("tasks").insert({ organization_id: ctx.company.id, title: v.title, due_on: v.due_on, assignee_id: v.assignee_id ?? ctx.userId, details: v.details || null, priority: "normal" });
  revalidatePath(`/c/${slug}/followups`);
  redirect(`/c/${slug}/followups${error ? `?note=${encodeURIComponent(error.message)}` : ""}`);
}
