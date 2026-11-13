import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { designFor, workflowKey } from "@/domain/design";
import { n8nConfig } from "@/integrations/n8n/client";
import { aiConfig } from "@/integrations/ai/claude";
import { formatDateTime } from "@/domain/dates";
import { Cta, PageHead } from "@/components/dp/shell";
import { AutomationView, RUN_COLOR } from "@/views/automation";
import { decideAction, dryRunAction, retryAction, toggleWorkflowAction } from "./actions";

export const metadata: Metadata = { title: "Automation" };

export default async function AutomationPage({ params, searchParams }: PageProps<"/c/[slug]/automation">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("automation.manage") && !ctx.can("automation.approve")) notFound();
  const d = designFor(slug);
  const [defs, runs] = await Promise.all([
    ctx.supabase.from("automation_definitions").select("id, template_key, name, enabled, idempotent, is_financial").eq("organization_id", ctx.company.id),
    ctx.supabase.from("automation_runs").select("id, definition_id, status, is_mock, trigger_source, created_at, last_error").eq("organization_id", ctx.company.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const ds = (defs.data ?? []) as { id: string; template_key: string; name: string; enabled: boolean; idempotent: boolean; is_financial: boolean }[];
  const byKey = new Map(ds.map((x) => [x.template_key, x]));
  const byId = new Map(ds.map((x) => [x.id, x]));
  const rs = (runs.data ?? []) as { id: string; definition_id: string; status: string; is_mock: boolean; trigger_source: string; created_at: string; last_error: string | null }[];
  const manage = ctx.can("automation.manage");
  const n8n = n8nConfig();
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title="Automation" right={manage ? <Cta href={`/c/${slug}/automation#library`}>+ Add</Cta> : undefined} />
      {ctx.company.emergency_stop && <div style={{ background: "#F5DADA", color: "#8C2F39", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, marginBottom: 16 }}>Emergency stop is on: workflows cannot run until the company is resumed.</div>}
      <AutomationView vm={{
        dry: typeof sp.dry === "string" ? sp.dry : undefined,
        wfs: d.wf.map((w) => ({ n: w.n, meta: `Trigger: ${w.trigger} · ${w.mode}`, on: byKey.get(workflowKey(w.n))?.enabled ?? false,
          dry: dryRunAction.bind(null, slug), toggle: manage ? toggleWorkflowAction.bind(null, slug) : undefined })),
        pending: rs.filter((r) => r.status === "pending_approval").map((r) => ({ id: r.id, t: byId.get(r.definition_id)?.name ?? "Workflow run", s: `${r.trigger_source.replace("_", " ")} · ${formatDateTime(r.created_at)}` })),
        decide: ctx.can("automation.approve") ? decideAction.bind(null, slug) : undefined,
        runs: rs.filter((r) => r.status !== "pending_approval").slice(0, 12).map((r) => {
          const def = byId.get(r.definition_id);
          const safe = def && def.idempotent && !def.is_financial;
          return {
            n: `${def?.name ?? "Workflow"}${r.is_mock ? " (mock)" : ""}`, s: r.status === "failed" && r.last_error ? `failed: ${r.last_error}` : r.status.replace("_", " "), c: RUN_COLOR[r.status] ?? "#6d7a70",
            retry: r.status === "failed" && manage ? (safe ? <form action={retryAction.bind(null, slug)}><input type="hidden" name="id" value={r.id} /><button style={{ fontSize: 12, border: "1px solid #d9d3c0", background: "transparent", borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>Retry</button></form>
              : <span style={{ fontSize: 11.5, color: "#6d7a70" }}>handle by hand</span>) : undefined,
          };
        }),
        conns: [
          { n: "n8n", s: n8n.mock ? "Needs connection" : `Connected · ${n8n.environment}` },
          { n: "Email provider", s: "Needs connection" },
          { n: "WhatsApp provider", s: "Needs confirmation" },
          { n: "Claude (backend only)", s: aiConfig().mock ? "Optional · no key" : "Configured" },
        ],
      }} />
    </>
  );
}
