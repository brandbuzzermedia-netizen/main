"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";
import { designFor, workflowKey } from "@/domain/design";

async function manager(slug: string) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("automation.manage") && !ctx.can("automation.approve")) throw new Error("Not allowed");
  return ctx;
}

/** Finds or creates the definition row for one workflow in the company's design library. */
async function definition(slug: string, name: string) {
  const ctx = await manager(slug);
  const wf = designFor(slug).wf.find((w) => w.n === name);
  if (!wf) throw new Error("Unknown workflow");
  const key = workflowKey(wf.n);
  const { data: existing } = await ctx.supabase.from("automation_definitions").select("id, enabled").eq("organization_id", ctx.company.id).eq("template_key", key).maybeSingle();
  if (existing) return { ctx, id: existing.id as string, wf };
  const gated = wf.mode !== "Auto";
  const { data, error } = await ctx.supabase.from("automation_definitions").insert({
    organization_id: ctx.company.id, template_key: key, name: wf.n, trigger_kind: "record_change", trigger_detail: wf.trigger,
    enabled: false, requires_approval: gated, is_financial: /invoice|payment|refund|commission|disbursal/i.test(wf.n), idempotent: true,
    environment: process.env.N8N_ENVIRONMENT ?? "development",
  }).select("id").single();
  if (error) throw new Error(error.message);
  return { ctx, id: data.id as string, wf };
}

export async function toggleWorkflowAction(slug: string, fd: FormData) {
  const { ctx, id } = await definition(slug, String(fd.get("name")));
  if (!ctx.can("automation.manage")) throw new Error("Only owners and company admins switch workflows on or off.");
  const { error } = await ctx.supabase.from("automation_definitions").update({ enabled: fd.get("on") === "true" }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}`, "layout");
}

/** Dry run: checks the gates and records a labelled mock run. Nothing is sent or changed. */
export async function dryRunAction(slug: string, fd: FormData) {
  const { ctx, id, wf } = await definition(slug, String(fd.get("name")));
  const { data: run, error } = await ctx.supabase.rpc("request_automation_run", { p_definition: id, p_idempotency_key: `dry-${randomUUID()}`, p_source: "dry_run", p_summary: { requested_by: ctx.displayName }, p_mock: true });
  if (error) redirect(`/c/${slug}/automation?dry=${encodeURIComponent(`Dry run blocked: ${error.message}`)}`);
  await ctx.supabase.rpc("complete_mock_run", { p_run: run });
  revalidatePath(`/c/${slug}/automation`);
  redirect(`/c/${slug}/automation?dry=${encodeURIComponent(`Dry run: "${wf.n}" passed validation, 0 records changed, approval gate: ${wf.mode === "Auto" ? "none" : "required"}`)}`);
}

export async function decideAction(slug: string, fd: FormData) {
  const ctx = await manager(slug);
  const { error } = await ctx.supabase.rpc("decide_automation_run", { p_run: z.uuid().parse(fd.get("id")), p_approve: fd.get("approve") === "true" });
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}`, "layout");
}

export async function retryAction(slug: string, fd: FormData) {
  const ctx = await manager(slug);
  const { error } = await ctx.supabase.rpc("retry_automation_run", { p_run: z.uuid().parse(fd.get("id")) });
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/automation`);
}
