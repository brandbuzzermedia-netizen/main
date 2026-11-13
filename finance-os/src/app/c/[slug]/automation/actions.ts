"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";
import { AUTOMATION_TEMPLATES } from "@/integrations/n8n/templates";

async function manager(slug: string) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("automation.manage") && !ctx.can("automation.approve")) throw new Error("Not allowed");
  return ctx;
}
const done = (slug: string) => revalidatePath(`/c/${slug}/automation`);

export async function addTemplateAction(slug: string, fd: FormData) {
  const ctx = await manager(slug);
  const t = AUTOMATION_TEMPLATES.find((x) => x.key === fd.get("key"));
  if (!t) throw new Error("Unknown template");
  const { error } = await ctx.supabase.from("automation_definitions").insert({
    organization_id: ctx.company.id, template_key: t.key, name: t.name, trigger_kind: t.trigger, trigger_detail: t.detail,
    enabled: false, requires_approval: t.requiresApproval, is_financial: t.isFinancial, idempotent: t.idempotent,
    environment: process.env.N8N_ENVIRONMENT ?? "development",
  });
  if (error) throw new Error(error.code === "23505" ? "Already added" : error.message);
  done(slug);
}

export async function toggleAction(slug: string, fd: FormData) {
  const ctx = await manager(slug);
  const { error } = await ctx.supabase.from("automation_definitions").update({ enabled: fd.get("enabled") === "true" })
    .eq("id", z.uuid().parse(fd.get("id"))).eq("organization_id", ctx.company.id);
  if (error) throw new Error(error.message);
  done(slug);
}

/** Dry run in mock mode: validates the gates, records a labelled mock run, sends nothing. */
export async function testRunAction(slug: string, fd: FormData) {
  const ctx = await manager(slug);
  const { data: run, error } = await ctx.supabase.rpc("request_automation_run", {
    p_definition: z.uuid().parse(fd.get("id")), p_idempotency_key: `test-${randomUUID()}`, p_source: "test_run", p_summary: { requested_by: ctx.displayName }, p_mock: true,
  });
  if (error) throw new Error(error.message);
  const c = await ctx.supabase.rpc("complete_mock_run", { p_run: run });
  if (c.error) throw new Error(c.error.message);
  done(slug);
}

/** Manual trigger of a real run. It waits for approval if the workflow needs it, then the dispatcher sends it. */
export async function runNowAction(slug: string, fd: FormData) {
  const ctx = await manager(slug);
  const { error } = await ctx.supabase.rpc("request_automation_run", {
    p_definition: z.uuid().parse(fd.get("id")), p_idempotency_key: `manual-${randomUUID()}`, p_source: "manual", p_summary: { requested_by: ctx.displayName }, p_mock: false,
  });
  if (error) throw new Error(error.message);
  done(slug);
}

export async function decideAction(slug: string, fd: FormData) {
  const ctx = await manager(slug);
  const { error } = await ctx.supabase.rpc("decide_automation_run", { p_run: z.uuid().parse(fd.get("id")), p_approve: fd.get("approve") === "true" });
  if (error) throw new Error(error.message);
  done(slug);
}

export async function retryAction(slug: string, fd: FormData) {
  const ctx = await manager(slug);
  const { error } = await ctx.supabase.rpc("retry_automation_run", { p_run: z.uuid().parse(fd.get("id")) });
  if (error) throw new Error(error.message);
  done(slug);
}
