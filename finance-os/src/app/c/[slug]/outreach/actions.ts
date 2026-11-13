"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";

export async function logOutcomeAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) throw new Error("Not allowed");
  const contact = z.uuid().parse(fd.get("contact_id"));
  const kind = z.enum(["call", "email", "whatsapp", "linkedin", "reply", "unsubscribe", "note"]).parse(fd.get("kind"));
  const outcome = z.enum(["connected", "no_answer", "voicemail", "positive", "objection", "not_now", "referral", "wrong_contact", "out_of_office", "other"]).nullable().catch(null).parse(fd.get("outcome"));
  const { error } = await ctx.supabase.from("outreach_events").insert({ organization_id: ctx.company.id, contact_id: contact, kind, outcome, notes: String(fd.get("notes") ?? "").slice(0, 2000) || null });
  if (error) throw new Error(error.message);
  if (outcome === "positive") await ctx.supabase.from("contacts").update({ lead_status: "qualified" }).eq("id", contact);
  else if (kind === "call" || kind === "email") await ctx.supabase.from("contacts").update({ lead_status: "contacted" }).eq("id", contact).eq("lead_status", "new");
  revalidatePath(`/c/${slug}/outreach`);
}

/** Setter hands a deal to a closer: the closer becomes the owner; the setter is recorded. */
export async function handoverAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) throw new Error("Not allowed");
  const deal = z.uuid().parse(fd.get("deal_id"));
  const closer = z.uuid().parse(fd.get("closer_id"));
  const { data: d } = await ctx.supabase.from("deals").select("owner_id").eq("id", deal).single();
  const { error } = await ctx.supabase.from("deals").update({ setter_id: d?.owner_id ?? ctx.userId, owner_id: closer, handed_over_at: new Date().toISOString(),
    next_action: String(fd.get("note") ?? "").slice(0, 300) || "Closer to call" }).eq("id", deal).eq("organization_id", ctx.company.id);
  if (error) throw new Error(ctx.can("crm.read_all") ? error.message : "Only managers can reassign deals. Ask your sales manager to hand it over.");
  revalidatePath(`/c/${slug}/outreach`);
}
