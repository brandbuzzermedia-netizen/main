import type { Metadata } from "next";
import { getGroupContext } from "@/lib/workspace";
import { companiesWith, nameMap } from "@/lib/group-data";
import { GroupHead } from "@/lib/group-head";
import { n8nConfig } from "@/integrations/n8n/client";
import { aiConfig } from "@/integrations/ai/claude";
import { formatDateTime } from "@/domain/dates";
import { C } from "@/components/dp/theme";
import { AutomationView, RUN_COLOR } from "@/views/automation";

export const metadata: Metadata = { title: "Automation" };
const go = (slug: string) => `/switch?to=${slug}&next=${encodeURIComponent(`/c/${slug}/automation`)}`;

/** Automation across the companies this person manages or approves for. Decisions happen inside each company. */
export default async function GroupAutomation() {
  const g = await getGroupContext();
  const cs = [...new Map([...companiesWith(g, "automation.manage"), ...companiesWith(g, "automation.approve")].map((c) => [c.id, c])).values()];
  const names = nameMap(cs);
  const ids = cs.map((c) => c.id);
  const [defs, runs] = ids.length ? await Promise.all([
    g.supabase.from("automation_definitions").select("id, organization_id, name, enabled").in("organization_id", ids),
    g.supabase.from("automation_runs").select("id, organization_id, definition_id, status, is_mock, trigger_source, created_at").in("organization_id", ids).order("created_at", { ascending: false }).limit(60),
  ]) : [{ data: [] }, { data: [] }];
  const d = (defs.data ?? []) as { id: string; organization_id: string; name: string; enabled: boolean }[];
  const r = (runs.data ?? []) as { id: string; organization_id: string; definition_id: string; status: string; is_mock: boolean; trigger_source: string; created_at: string }[];
  const defName = new Map(d.map((x) => [x.id, x.name]));
  const n8n = n8nConfig();
  const link = { fontSize: 12.5, border: `1px solid ${C.btnLine}`, borderRadius: 7, padding: "5px 10px", color: C.ink, textDecoration: "none" } as const;
  return (
    <>
      <GroupHead title="Automation" />
      <AutomationView vm={{
        libraryAside: "Per business · open to change",
        wfs: cs.map((c) => {
          const mine = d.filter((x) => x.organization_id === c.id);
          const live = mine.filter((x) => x.enabled).length;
          return { n: c.name, meta: `${live} of ${mine.length} workflows live${c.emergency_stop ? " · emergency stop on" : ""}`, on: live > 0 && !c.emergency_stop,
            extra: <a href={go(c.slug)} style={link}>Open</a> };
        }),
        pending: r.filter((x) => x.status === "pending_approval").map((x) => ({ id: x.id, t: `${defName.get(x.definition_id) ?? "Workflow run"} · ${names.get(x.organization_id)}`, s: `${x.trigger_source.replace("_", " ")} · ${formatDateTime(x.created_at)} · decide inside the business` })),
        runs: r.filter((x) => x.status !== "pending_approval").slice(0, 12).map((x) => ({
          n: `${defName.get(x.definition_id) ?? "Workflow"} · ${names.get(x.organization_id)}`,
          s: x.is_mock ? `${x.status.replace("_", " ")} (mock)` : x.status.replace("_", " "), c: RUN_COLOR[x.status] ?? C.muted })),
        conns: [
          { n: "n8n", s: n8n.mock ? "Not connected · mock mode" : "Connected" },
          { n: "Claude AI", s: aiConfig().mock ? "Not connected · mock mode" : "Connected" },
          { n: "Businesses covered", s: String(cs.length) },
        ],
      }} />
    </>
  );
}
