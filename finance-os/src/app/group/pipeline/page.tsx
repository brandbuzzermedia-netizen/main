import type { Metadata } from "next";
import { getGroupContext } from "@/lib/workspace";
import { companiesWith, nameMap } from "@/lib/group-data";
import { GroupHead } from "@/lib/group-head";
import { formatMoney } from "@/domain/money";
import { includedInGroupTotals } from "@/domain/dashboard";
import { Cta } from "@/components/dp/shell";
import { Modal } from "@/components/dp/modal";
import { C } from "@/components/dp/theme";
import { Kanban } from "@/views/kanban";

export const metadata: Metadata = { title: "Group pipeline" };
const COLS = ["Lead", "Qualified", "Meeting", "Proposal", "Negotiation", "Won"] as const;

export default async function GroupPipeline({ searchParams }: PageProps<"/group/pipeline">) {
  const sp = await searchParams;
  const g = await getGroupContext();
  const cs = companiesWith(g, "crm.read_all");
  const names = nameMap(cs);
  const ids = cs.map((c) => c.id);
  const [deals, stages] = ids.length ? await Promise.all([
    g.supabase.from("deals").select("id, organization_id, title, value_minor, currency, is_hot, stage_id, closed_at").in("organization_id", ids).limit(2000),
    g.supabase.from("pipeline_stages").select("id, organization_id, kind, position").in("organization_id", ids),
  ]) : [{ data: [] }, { data: [] }];
  const st = (stages.data ?? []) as { id: string; organization_id: string; kind: string; position: number }[];
  const firstOpen = new Map<string, number>();
  for (const s of st) if (s.kind === "open") firstOpen.set(s.organization_id, Math.min(firstOpen.get(s.organization_id) ?? 99, s.position));
  const col = (stageId: string): (typeof COLS)[number] | null => {
    const s = st.find((x) => x.id === stageId);
    if (!s) return null;
    return ({ open: s.position === firstOpen.get(s.organization_id) ? "Lead" : "Qualified", meeting: "Meeting", proposal: "Proposal", negotiation: "Negotiation", won: "Won", lost: null } as Record<string, (typeof COLS)[number] | null>)[s.kind];
  };
  const cons = new Map(cs.map((c) => [c.id, c.consolidation]));
  const slugOf = new Map(cs.map((c) => [c.id, c.slug]));
  const ds = (deals.data ?? []) as { id: string; organization_id: string; title: string; value_minor: number; currency: string; is_hot: boolean; stage_id: string; closed_at: string | null }[];
  const cols = COLS.map((name) => ({
    name,
    deals: ds.filter((d) => col(d.stage_id) === name && (name === "Won" || !d.closed_at)).map((d) => ({
      id: d.id, t: d.title, v: formatMoney(d.value_minor, d.currency, { compact: true }), hot: d.is_hot,
      sub: `${names.get(d.organization_id)}${includedInGroupTotals(cons.get(d.organization_id)!) ? "" : " · not in totals"}`,
      href: `/switch?to=${slugOf.get(d.organization_id)}&next=${encodeURIComponent(`/c/${slugOf.get(d.organization_id)}/pipeline?deal=${d.id}`)}`,
    })),
  }));
  const writable = companiesWith(g, "crm.write");
  return (
    <>
      <GroupHead title="Group pipeline" right={writable.length ? <Cta href="/group/pipeline?add=1">+ Add</Cta> : undefined} />
      <Kanban cols={cols} empty={ds.length === 0 ? { msg: cs.length ? "No deals yet in the companies you can see. Add one in a company workspace." : "You do not see the full pipeline of any company yet." } : undefined} />
      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10 }}>Stages are mapped by meaning across companies. Partner-channel deal values are partner gross value, never group revenue.</div>
      {sp.add && (
        <Modal title="Add a lead to which business?" closeHref="/group/pipeline">
          {writable.map((c) => <a key={c.id} href={`/switch?to=${c.slug}&next=${encodeURIComponent(`/c/${c.slug}/pipeline?add=1`)}`} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderTop: `1px solid ${C.line2}`, color: C.ink, textDecoration: "none" }}><span>{c.name}</span><span style={{ color: C.faint }}>→</span></a>)}
        </Modal>
      )}
    </>
  );
}
