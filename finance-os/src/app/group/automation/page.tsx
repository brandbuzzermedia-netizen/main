import Link from "next/link";
import type { Metadata } from "next";
import { getGroupContext } from "@/lib/workspace";
import { companiesWith, nameMap } from "@/lib/group-data";
import { n8nConfig } from "@/integrations/n8n/client";
import { addDays, todayInBusinessTz } from "@/domain/dates";
import { Badge, EmptyState, PageHeader, Table, Td } from "@/components/ui";

export const metadata: Metadata = { title: "Automation" };

export default async function GroupAutomation() {
  const g = await getGroupContext();
  const cs = [...new Map([...companiesWith(g, "automation.manage"), ...companiesWith(g, "automation.approve")].map((c) => [c.id, c])).values()];
  const names = nameMap(cs);
  const ids = cs.map((c) => c.id);
  const [defs, runs] = ids.length ? await Promise.all([
    g.supabase.from("automation_definitions").select("organization_id, enabled").in("organization_id", ids),
    g.supabase.from("automation_runs").select("organization_id, status, is_mock").in("organization_id", ids).gte("created_at", `${addDays(todayInBusinessTz(), -30)}T00:00:00+05:30`),
  ]) : [{ data: [] }, { data: [] }];
  const d = (defs.data ?? []) as { organization_id: string; enabled: boolean }[];
  const r = (runs.data ?? []) as { organization_id: string; status: string; is_mock: boolean }[];
  return (
    <>
      <PageHeader title="Automation" description={`Health across companies, last 30 days. n8n: ${n8nConfig().mock ? "not connected (mock mode)" : "connected"}.`} />
      {cs.length === 0 ? <EmptyState title="No companies where you manage automation" /> : (
        <Table head={["Company", "Live workflows", "Waiting approval", "Succeeded", "Failed", "Emergency stop", ""]}>
          {cs.map((c) => {
            const mine = r.filter((x) => x.organization_id === c.id);
            return (
              <tr key={c.id}><Td className="font-medium">{names.get(c.id)}</Td>
                <Td numeric>{d.filter((x) => x.organization_id === c.id && x.enabled).length}</Td>
                <Td numeric>{mine.filter((x) => x.status === "pending_approval").length}</Td>
                <Td numeric>{mine.filter((x) => x.status === "succeeded" && !x.is_mock).length}</Td>
                <Td numeric className={mine.some((x) => x.status === "failed") ? "text-danger" : ""}>{mine.filter((x) => x.status === "failed").length}</Td>
                <Td>{c.emergency_stop ? <Badge tone="danger">On</Badge> : <Badge>Off</Badge>}</Td>
                <Td><Link className="text-sm underline" href={`/switch?to=${c.slug}&next=${encodeURIComponent(`/c/${c.slug}/automation`)}`}>Open</Link></Td></tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
