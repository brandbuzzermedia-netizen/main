import Link from "next/link";
import type { Metadata } from "next";
import { getGroupContext } from "@/lib/workspace";
import { companiesWith, nameMap } from "@/lib/group-data";
import { formatDate, todayInBusinessTz } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { includedInGroupTotals } from "@/domain/dashboard";
import { Badge, EmptyState, PageHeader, Table, Td } from "@/components/ui";

export const metadata: Metadata = { title: "Group pipeline" };

export default async function GroupPipeline({ searchParams }: PageProps<"/group/pipeline">) {
  const g = await getGroupContext();
  const cs = companiesWith(g, "crm.read_all");
  const only = (await searchParams).company;
  const ids = cs.filter((c) => !only || c.slug === only).map((c) => c.id);
  const names = nameMap(cs);
  const cons = new Map(cs.map((c) => [c.id, c.consolidation]));
  const { data } = ids.length ? await g.supabase.from("deals")
    .select("id, organization_id, title, account_name, value_minor, currency, is_hot, next_action, next_action_on, expected_close_on, source, stage:pipeline_stages(name, probability_pct), owner:users!deals_owner_id_fkey(full_name, email)")
    .in("organization_id", ids).is("closed_at", null).order("value_minor", { ascending: false }).limit(1000) : { data: [] };
  const rows = (data ?? []) as unknown as { id: string; organization_id: string; title: string; account_name: string | null; value_minor: number; currency: string; is_hot: boolean; next_action: string | null; next_action_on: string | null; expected_close_on: string | null; source: string | null; stage: { name: string; probability_pct: number }; owner: { full_name: string | null; email: string } | null }[];
  const today = todayInBusinessTz();
  return (
    <>
      <PageHeader title="Group pipeline" description="Open deals across the companies where you can see the whole pipeline. Partner-channel values are partner gross value, never group revenue." />
      <nav className="mb-4 flex flex-wrap gap-1.5 text-sm">
        <Link href="/group/pipeline" className={!only ? "rounded-full bg-co-side px-3 py-1 text-white" : "rounded-full border border-line px-3 py-1"}>All</Link>
        {cs.map((c) => <Link key={c.id} href={`/group/pipeline?company=${c.slug}`} className={only === c.slug ? "rounded-full bg-co-side px-3 py-1 text-white" : "rounded-full border border-line px-3 py-1"}>{names.get(c.id)}</Link>)}
      </nav>
      {rows.length === 0 ? <EmptyState title="No open deals you can see" /> : (
        <Table head={["Company", "Deal", "Stage", "Value", "Prob.", "Next step", "Close", "Owner"]}>
          {rows.map((d) => (
            <tr key={d.id}>
              <Td>{names.get(d.organization_id)}{!includedInGroupTotals(cons.get(d.organization_id)!) && <div><Badge>not in totals</Badge></div>}</Td>
              <Td><div className="font-medium">{d.title} {d.is_hot && <Badge tone="warn">Hot</Badge>}</div><div className="text-xs text-muted">{[d.account_name, d.source].filter(Boolean).join(" · ")}</div></Td>
              <Td>{d.stage?.name}</Td><Td numeric>{formatMoney(d.value_minor, d.currency, { compact: true })}</Td><Td numeric>{d.stage?.probability_pct ?? 0}%</Td>
              <Td>{d.next_action ?? "—"}{d.next_action_on && <div className={d.next_action_on < today ? "text-xs text-danger" : "text-xs text-muted"}>{formatDate(d.next_action_on)}</div>}</Td>
              <Td>{formatDate(d.expected_close_on)}</Td><Td>{d.owner?.full_name || d.owner?.email || "—"}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
