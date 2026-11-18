"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";
import { addDays, todayInBusinessTz } from "@/domain/dates";

const back = (slug: string, note: string) => redirect(`/c/${slug}/proposals?note=${encodeURIComponent(note)}`);
const rupees = z.coerce.number().min(0).max(1e10);

/** Next proposal number for this company, e.g. GBS-P-007. */
async function nextNumber(ctx: Awaited<ReturnType<typeof getCompanyContext>>) {
  const prefix = (ctx.company.short_name ?? ctx.company.name).replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase() || "CO";
  const { count } = await ctx.supabase.from("proposals").select("id", { count: "exact", head: true }).eq("organization_id", ctx.company.id);
  return `${prefix}-P-${String((count ?? 0) + 1).padStart(3, "0")}`;
}

/** Moves the linked deal to the first stage of a kind (proposal or won). */
async function moveDeal(ctx: Awaited<ReturnType<typeof getCompanyContext>>, dealId: string | null, kind: "proposal" | "won") {
  if (!dealId) return;
  const { data: stage } = await ctx.supabase.from("pipeline_stages").select("id").eq("organization_id", ctx.company.id).eq("kind", kind).order("position").limit(1).maybeSingle();
  if (!stage) return;
  const { data: deal } = await ctx.supabase.from("deals").select("stage:pipeline_stages(kind)").eq("id", dealId).maybeSingle();
  const cur = (deal?.stage as unknown as { kind: string } | null)?.kind;
  if (cur === "won" || cur === "lost" || cur === kind) return;
  await ctx.supabase.from("deals").update({ stage_id: stage.id, ...(kind === "won" ? { closed_at: new Date().toISOString() } : {}) }).eq("id", dealId);
}

export async function addProposalAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) throw new Error("Not allowed");
  const v = z.object({
    title: z.string().trim().min(2).max(200), client_name: z.string().trim().min(1).max(200), deal_id: z.uuid().nullable().catch(null),
    amount: rupees, gst: z.coerce.number().min(0).max(28), status: z.enum(["draft", "sent"]).catch("draft"),
    sent_on: z.iso.date().nullable().catch(null), follow_up_on: z.iso.date().nullable().catch(null), notes: z.string().trim().max(4000).catch(""),
  }).safeParse({ title: fd.get("title"), client_name: fd.get("client_name"), deal_id: fd.get("deal_id") || null, amount: fd.get("amount"), gst: fd.get("gst"),
    status: fd.get("status"), sent_on: fd.get("sent_on") || null, follow_up_on: fd.get("follow_up_on") || null, notes: fd.get("notes") });
  if (!v.success) back(slug, "Check the title, client and amount.");
  const p = v.data!;
  const today = todayInBusinessTz();
  const sent = p.status === "sent";
  const { error } = await ctx.supabase.from("proposals").insert({
    organization_id: ctx.company.id, number: await nextNumber(ctx), title: p.title, client_name: p.client_name, deal_id: p.deal_id,
    amount_minor: Math.round(p.amount * 100), gst_bp: Math.round(p.gst * 100), status: p.status,
    sent_on: sent ? p.sent_on ?? today : p.sent_on, follow_up_on: p.follow_up_on ?? (sent ? addDays(p.sent_on ?? today, 3) : null), notes: p.notes || null,
  });
  if (!error && sent) await moveDeal(ctx, p.deal_id, "proposal");
  revalidatePath(`/c/${slug}`, "layout");
  back(slug, error ? error.message : sent ? "Proposal saved as sent. The deal moved to Proposal; a follow-up is due in 3 days." : "Proposal saved as a draft.");
}

export async function proposalStatusAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) throw new Error("Not allowed");
  const id = z.uuid().parse(fd.get("id"));
  const status = z.enum(["sent", "accepted", "rejected"]).parse(fd.get("status"));
  const today = todayInBusinessTz();
  const { data: p } = await ctx.supabase.from("proposals").select("deal_id, sent_on").eq("id", id).eq("organization_id", ctx.company.id).maybeSingle();
  if (!p) back(slug, "Proposal not found.");
  const patch = status === "sent" ? { status, sent_on: p!.sent_on ?? today, follow_up_on: addDays(today, 3) } : { status, decided_on: today, follow_up_on: null };
  const { error } = await ctx.supabase.from("proposals").update(patch).eq("id", id);
  if (!error) await moveDeal(ctx, p!.deal_id as string | null, status === "accepted" ? "won" : "proposal");
  revalidatePath(`/c/${slug}`, "layout");
  back(slug, error ? error.message : status === "accepted" ? "Accepted: the deal is marked Won. Raise the invoice from the pipeline." : status === "sent" ? "Marked sent; follow-up due in 3 days." : "Marked not accepted.");
}
