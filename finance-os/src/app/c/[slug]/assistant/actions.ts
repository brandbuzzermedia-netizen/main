"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";
import { draftFollowUp, type Draft } from "@/integrations/ai/claude";

export type DraftState = { error?: string; draft?: Draft; usageId?: string; dealId?: string; saved?: string };

export async function draftAction(slug: string, _p: DraftState, fd: FormData): Promise<DraftState> {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) return { error: "Your role cannot draft outreach." };
  const dealId = z.uuid().safeParse(fd.get("deal_id"));
  const channel = z.enum(["email", "whatsapp", "linkedin"]).safeParse(fd.get("channel"));
  const purpose = z.string().trim().min(3).max(300).safeParse(fd.get("purpose"));
  if (!dealId.success || !channel.success || !purpose.success) return { error: "Choose a deal, a channel and say what the message is for." };
  const { data: settings } = await ctx.supabase.from("app_settings").select("ai_enabled").eq("organization_id", ctx.company.id).maybeSingle();
  if (!settings?.ai_enabled) return { error: "AI drafting is switched off for this company (Settings)." };
  const { data: remaining } = await ctx.supabase.rpc("ai_budget_remaining", { p_org: ctx.company.id });
  if (Number(remaining ?? 0) < 5000) return { error: "This month's AI budget for the company is used up." };
  // RLS: the deal must be visible to this user. NDA-restricted contacts never go to the model.
  const { data: deal } = await ctx.supabase.from("deals").select("title, account_name, next_action, stage:pipeline_stages(name), contact:contacts(full_name, nda_restricted, do_not_contact)").eq("id", dealId.data).maybeSingle();
  if (!deal) return { error: "Deal not found." };
  const contact = deal.contact as unknown as { full_name: string; nda_restricted: boolean; do_not_contact: boolean } | null;
  if (contact?.nda_restricted) return { error: "This contact is NDA-restricted and is excluded from AI." };
  if (contact?.do_not_contact) return { error: "This contact is marked do-not-contact." };
  const context = [`Deal: ${deal.title}`, deal.account_name && `Account: ${deal.account_name}`, `Stage: ${(deal.stage as unknown as { name: string })?.name}`,
    deal.next_action && `Planned next step: ${deal.next_action}`, contact && `Contact first name: ${contact.full_name.split(" ")[0]}`, `Sender company: ${ctx.company.name}`].filter(Boolean).join("\n");
  const res = await draftFollowUp({ channel: channel.data, purpose: purpose.data, context });
  const { data: log } = await ctx.supabase.from("ai_usage_log").insert({
    organization_id: ctx.company.id, user_id: ctx.userId, purpose: "follow_up_draft", model: res.usage.model, input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens, is_mock: res.usage.is_mock, refused: res.usage.refused, outcome: res.draft ? "draft" : "error",
  }).select("id").single();
  if (!res.draft) return { error: res.error ?? "No draft produced." };
  return { draft: res.draft, usageId: log?.id as string | undefined, dealId: dealId.data };
}

/** The person approves (and may edit) the draft: it becomes a follow-up task. Nothing is sent. */
export async function approveDraftAction(slug: string, _p: DraftState, fd: FormData): Promise<DraftState> {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("tasks.write")) return { error: "Not allowed" };
  const body = z.string().trim().min(1).max(4000).safeParse(fd.get("body"));
  if (!body.success) return { error: "The message is empty." };
  const { error } = await ctx.supabase.from("tasks").insert({ organization_id: ctx.company.id, title: `Send approved follow-up: ${String(fd.get("subject") || "message").slice(0, 120)}`,
    details: body.data, assignee_id: ctx.userId, created_by: ctx.userId, deal_id: z.uuid().safeParse(fd.get("deal_id")).data ?? null, due_on: null });
  if (error) return { error: error.message };
  const usage = z.uuid().safeParse(fd.get("usage_id"));
  if (usage.success) await ctx.supabase.from("ai_usage_log").update({ outcome: "approved" }).eq("id", usage.data);
  revalidatePath(`/c/${slug}`, "layout");
  return { saved: "Saved as a follow-up task for you. Send it from your own inbox or WhatsApp after a final check." };
}
