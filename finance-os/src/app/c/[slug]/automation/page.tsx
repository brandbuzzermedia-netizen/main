import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { AUTOMATION_TEMPLATES } from "@/integrations/n8n/templates";
import { n8nConfig } from "@/integrations/n8n/client";
import { aiConfig } from "@/integrations/ai/claude";
import { formatDateTime } from "@/domain/dates";
import { Alert, Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import { addTemplateAction, decideAction, retryAction, runNowAction, testRunAction, toggleAction } from "./actions";

export const metadata: Metadata = { title: "Automation" };
type Def = { id: string; template_key: string; name: string; trigger_kind: string; trigger_detail: string | null; enabled: boolean; requires_approval: boolean; is_financial: boolean; idempotent: boolean; environment: string };
type Run = { id: string; definition_id: string; status: string; is_mock: boolean; trigger_source: string; created_at: string; started_at: string | null; finished_at: string | null; last_error: string | null; attempts: number };
const btn = "rounded-md border border-line px-2 py-1 text-xs hover:bg-surface-2";

export default async function AutomationPage({ params }: PageProps<"/c/[slug]/automation">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("automation.manage") && !ctx.can("automation.approve")) notFound();
  const [defs, runs] = await Promise.all([
    ctx.supabase.from("automation_definitions").select("*").eq("organization_id", ctx.company.id).order("created_at"),
    ctx.supabase.from("automation_runs").select("id, definition_id, status, is_mock, trigger_source, created_at, started_at, finished_at, last_error, attempts").eq("organization_id", ctx.company.id).order("created_at", { ascending: false }).limit(100),
  ]);
  const ds = (defs.data ?? []) as Def[];
  const rs = (runs.data ?? []) as Run[];
  const name = new Map(ds.map((d) => [d.id, d.name]));
  const added = new Set(ds.map((d) => d.template_key));
  const pending = rs.filter((r) => r.status === "pending_approval");
  const failed = rs.filter((r) => r.status === "failed" || r.status === "needs_attention");
  const n8n = n8nConfig();
  const ai = aiConfig();
  const manage = ctx.can("automation.manage");
  const dur = (r: Run) => (r.started_at && r.finished_at ? `${Math.max(0, Math.round((Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000))}s` : "—");
  return (
    <>
      <PageHeader title="Automation" description="The OS decides whether a run may happen and keeps its history; n8n executes the steps. Outbound, financial and irreversible actions wait for approval." />
      {ctx.company.emergency_stop && <div className="mb-4"><Alert tone="danger">Emergency stop is on: no workflow runs for this company until it is resumed.</Alert></div>}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card title="n8n">{n8n.mock ? <Badge tone="warn">Not connected · mock mode</Badge> : <Badge tone="ok">Connected · {n8n.environment}</Badge>}<p className="mt-2 text-xs text-muted">Needs N8N_BASE_URL and N8N_SIGNING_SECRET on the server. Runs are signed and replay-protected.</p></Card>
        <Card title="Claude (server only)">{ai.mock ? <Badge tone="warn">No API key · mock mode</Badge> : <Badge tone="ok">Configured</Badge>}<p className="mt-2 text-xs text-muted">Also switched on per company in Settings, with a monthly token budget.</p></Card>
        <Card title="Email / WhatsApp">{<Badge tone="warn">Needs a provider</Badge>}<p className="mt-2 text-xs text-muted">Connected through n8n with your approved provider. Nothing is sent from the OS directly.</p></Card>
      </div>
      {pending.length > 0 && (
        <Card className="mb-5" title={`Waiting for approval · ${pending.length}`}>
          <ul>{pending.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 border-t border-line-2 py-2.5 text-sm">
              <span className="flex-1">{name.get(r.definition_id)} <span className="text-xs text-muted">· {r.trigger_source} · {formatDateTime(r.created_at)}</span></span>
              {ctx.can("automation.approve") ? (
                <form action={decideAction.bind(null, slug)} className="flex gap-2"><input type="hidden" name="id" value={r.id} />
                  <button name="approve" value="true" className="rounded-md bg-co-side px-2 py-1 text-xs text-white">Approve</button>
                  <button name="approve" value="false" className={btn}>Reject</button></form>
              ) : <span className="text-xs text-muted">Owner approval needed</span>}
            </li>))}</ul>
        </Card>
      )}
      {failed.length > 0 && (
        <Card className="mb-5" title={`Failure queue · ${failed.length}`}>
          <ul>{failed.map((r) => {
            const d = ds.find((x) => x.id === r.definition_id);
            const safe = d && d.idempotent && !d.is_financial;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 border-t border-line-2 py-2.5 text-sm">
                <span className="flex-1">{name.get(r.definition_id)} <span className="text-xs text-danger">· {r.last_error}</span></span>
                {safe && manage ? <form action={retryAction.bind(null, slug)}><input type="hidden" name="id" value={r.id} /><button className={btn}>Retry</button></form>
                  : <span className="text-xs text-muted">Not auto-retried: check what happened and handle it by hand</span>}
              </li>
            );
          })}</ul>
        </Card>
      )}
      <h2 className="mb-3 font-display text-2xl">Workflows</h2>
      {ds.length === 0 ? <p className="mb-6 text-sm text-muted">No workflows added yet. Add from the library below; each starts disabled.</p> : (
        <Table head={["Workflow", "Trigger", "Gate", "Status", ""]}>
          {ds.map((d) => (
            <tr key={d.id}>
              <Td><div className="font-medium">{d.name}</div><div className="text-xs text-muted">{d.environment}{AUTOMATION_TEMPLATES.find((t) => t.key === d.template_key)?.needs ? ` · needs ${AUTOMATION_TEMPLATES.find((t) => t.key === d.template_key)!.needs}` : ""}</div></Td>
              <Td className="text-xs">{d.trigger_kind.replace("_", " ")} · {d.trigger_detail}</Td>
              <Td>{d.requires_approval ? <Badge tone="warn">Approval</Badge> : <Badge>Auto</Badge>}{d.is_financial && <Badge tone="danger">Financial</Badge>}</Td>
              <Td>{d.enabled ? <Badge tone="ok">Enabled</Badge> : <Badge>Disabled</Badge>}</Td>
              <Td>
                {manage && (
                  <div className="flex flex-wrap gap-1.5">
                    <form action={toggleAction.bind(null, slug)}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="enabled" value={String(!d.enabled)} /><button className={btn}>{d.enabled ? "Pause" : "Enable"}</button></form>
                    <form action={testRunAction.bind(null, slug)}><input type="hidden" name="id" value={d.id} /><button className={btn}>Test run (mock)</button></form>
                    {d.enabled && d.trigger_kind === "manual" && <form action={runNowAction.bind(null, slug)}><input type="hidden" name="id" value={d.id} /><button className={btn}>Run now</button></form>}
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <h2 className="mt-8 mb-3 font-display text-2xl">Run history</h2>
      {rs.length === 0 ? <p className="text-sm text-muted">No runs yet. Use Test run to check a workflow&apos;s gates without sending anything.</p> : (
        <Table head={["When", "Workflow", "Source", "Status", "Duration", "Attempts"]}>
          {rs.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap">{formatDateTime(r.created_at)}</Td><Td>{name.get(r.definition_id)}</Td><Td className="text-xs">{r.trigger_source}</Td>
              <Td><Badge tone={r.status === "succeeded" ? "ok" : r.status === "failed" ? "danger" : "warn"}>{r.status.replace("_", " ")}</Badge>{r.is_mock && <Badge>mock</Badge>}</Td>
              <Td numeric>{dur(r)}</Td><Td numeric>{r.attempts}</Td>
            </tr>
          ))}
        </Table>
      )}
      {manage && (
        <>
          <h2 className="mt-8 mb-3 font-display text-2xl">Library</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {AUTOMATION_TEMPLATES.map((t) => (
              <div key={t.key} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-muted">{t.trigger.replace("_", " ")} · {t.detail}{t.needs ? ` · needs ${t.needs}` : ""}</div>
                <div className="flex gap-1">{t.requiresApproval ? <Badge tone="warn">Approval</Badge> : <Badge>Auto</Badge>}</div>
                {added.has(t.key) ? <span className="text-xs text-muted">Added</span> : (
                  <form action={addTemplateAction.bind(null, slug)}><input type="hidden" name="key" value={t.key} /><button className={btn}>Add (disabled)</button></form>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
