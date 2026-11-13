import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { aiConfig } from "@/integrations/ai/claude";
import { Alert, PageHeader } from "@/components/ui";
import { Assistant } from "./forms";

export const metadata: Metadata = { title: "Assistant" };

export default async function AssistantPage({ params }: PageProps<"/c/[slug]/assistant">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  const [deals, settings, remaining] = await Promise.all([
    ctx.supabase.from("deals").select("id, title, account_name").eq("organization_id", ctx.company.id).is("closed_at", null).order("last_activity_at", { ascending: false }).limit(200),
    ctx.supabase.from("app_settings").select("ai_enabled, ai_monthly_token_limit").eq("organization_id", ctx.company.id).maybeSingle(),
    ctx.supabase.rpc("ai_budget_remaining", { p_org: ctx.company.id }),
  ]);
  const cfg = aiConfig();
  const enabled = Boolean(settings.data?.ai_enabled) && !cfg.mock;
  return (
    <>
      <PageHeader title="Assistant" description="Claude drafts; you decide. Drafts never send themselves: an approved draft becomes a follow-up task for you." />
      {!enabled && <div className="mb-4"><Alert tone="info">{cfg.mock ? "No Claude API key is configured on the server, so drafting is unavailable (mock mode)." : "AI is switched off for this company. An owner can turn it on in Settings."}</Alert></div>}
      <p className="mb-4 text-sm text-muted">Budget left this month: {Number(remaining.data ?? 0).toLocaleString("en-IN")} tokens of {Number(settings.data?.ai_monthly_token_limit ?? 0).toLocaleString("en-IN")}. NDA-restricted and do-not-contact records are never sent to the model.</p>
      <Assistant slug={slug} enabled={enabled} deals={(deals.data ?? []).map((d) => ({ id: d.id as string, label: `${d.title}${d.account_name ? ` · ${d.account_name}` : ""}` }))} />
    </>
  );
}
