import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { DEAL_COLUMNS, loadDealStages } from "@/lib/crm";
import { loadLeadContext, memberName } from "@/lib/leads";
import type { Deal } from "@/lib/db-types";
import { dealCategoryTone, dealTypeLabel } from "@/domain/labels";
import { formatMoney } from "@/domain/money";
import { formatDate } from "@/domain/dates";
import { Badge, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { Board, type BoardCard } from "@/components/board";
import { moveDealAction } from "../crm-actions";

export const metadata: Metadata = { title: "Deals" };

const PER_STAGE = 30;

export default async function DealsPage() {
  const ctx = await getContext();
  const [stages, ref] = await Promise.all([loadDealStages(ctx), loadLeadContext(ctx)]);
  const open = stages.filter((s) => s.category === "open");
  const closedIds = stages.filter((s) => s.category !== "open").map((s) => s.id);
  const cur = ctx.org.default_currency;

  const [columns, closed] = await Promise.all([
    Promise.all(open.map(async (s) => {
      const [{ data, count, error }, { data: sums }] = await Promise.all([
        ctx.supabase.from("deals").select(DEAL_COLUMNS, { count: "exact" }).eq("organization_id", ctx.org.id).eq("stage_id", s.id)
          .order("expected_close_date", { ascending: true, nullsFirst: false }).limit(PER_STAGE),
        ctx.supabase.from("deals").select("value_minor, commission_minor").eq("organization_id", ctx.org.id).eq("stage_id", s.id).eq("currency", cur),
      ]);
      if (error) throw new Error(error.message);
      const value = (sums ?? []).reduce((t, d) => t + (d.value_minor ?? 0), 0);
      const commission = (sums ?? []).reduce((t, d) => t + (d.commission_minor ?? 0), 0);
      return { stage: s, deals: (data ?? []) as unknown as Deal[], count: count ?? 0, value, commission };
    })),
    ctx.supabase.from("deals").select(DEAL_COLUMNS).eq("organization_id", ctx.org.id).in("stage_id", closedIds.length ? closedIds : ["00000000-0000-0000-0000-000000000000"])
      .order("closed_at", { ascending: false }).limit(25),
  ]);
  if (closed.error) throw new Error(closed.error.message);

  const allDeals = [...columns.flatMap((c) => c.deals), ...((closed.data ?? []) as unknown as Deal[])];
  const leadIds = [...new Set(allDeals.map((d) => d.lead_id))];
  const { data: leads } = leadIds.length
    ? await ctx.supabase.from("leads").select("id, full_name").in("id", leadIds)
    : { data: [] as { id: string; full_name: string }[] };
  const leadName = new Map((leads ?? []).map((l) => [l.id, l.full_name]));
  const members = new Map(ref.members.map((m) => [m.user_id, m]));
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const totalOpen = columns.reduce((t, c) => t + c.count, 0);
  const pipelineValue = columns.reduce((t, c) => t + c.value, 0);
  const weighted = columns.reduce((t, c) => t + Math.round((c.commission * c.stage.probability) / 100), 0);

  const cards: BoardCard[] = columns.flatMap(({ deals }) => deals.map((d) => ({
    id: d.id,
    columnId: d.stage_id,
    href: `/deals/${d.id}`,
    title: d.title,
    lines: [leadName.get(d.lead_id) ?? "", `${dealTypeLabel[d.deal_type]} · ${d.owner_id ? memberName(members.get(d.owner_id)) : "Unassigned"}`],
    aside: d.value_minor !== null ? formatMoney(d.value_minor, d.currency, { compact: true }) : d.expected_close_date ? `Close ${formatDate(d.expected_close_date)}` : undefined,
  })));

  return (
    <>
      <PageHeader
        title="Deals"
        description={`${totalOpen} open deal${totalOpen === 1 ? "" : "s"} · ${formatMoney(pipelineValue, cur, { compact: true })} in property value · ${formatMoney(weighted, cur, { compact: true })} weighted commission (${cur} deals only).`}
        actions={<Link className="text-sm text-brand" href="/pipeline">Lead pipeline →</Link>}
      />
      {allDeals.length === 0 ? (
        <EmptyState title="No deals yet">
          Open a deal from a lead&apos;s page when a buyer, seller or landlord is ready to transact. Deals carry the property value and your expected commission.
        </EmptyState>
      ) : (
        <>
          <Board
            label="Deal pipeline"
            canMove={ctx.can.workCrm}
            move={moveDealAction}
            columns={[
              ...columns.map(({ stage, count, value }) => ({
                id: stage.id, title: stage.name, tone: "info" as const, count,
                footer: `${formatMoney(value, cur, { compact: true })} · ${stage.probability}%`,
              })),
              ...stages.filter((s) => s.category !== "open").map((s) => ({ id: s.id, title: s.name, tone: dealCategoryTone[s.category], count: 0, footer: "Drop here to close" })),
            ]}
            cards={cards}
          />
          <h2 className="mt-6 mb-3 text-base font-semibold">Recently closed</h2>
          {(closed.data ?? []).length === 0 ? (
            <p className="text-sm text-muted">No closed deals yet.</p>
          ) : (
            <Table head={["Deal", "Lead", "Result", "Value", "Commission", "Owner", "Closed"]}>
              {((closed.data ?? []) as unknown as Deal[]).map((d) => {
                const s = stageById.get(d.stage_id);
                return (
                  <tr key={d.id}>
                    <Td><Link className="font-medium hover:text-brand" href={`/deals/${d.id}`}>{d.title}</Link></Td>
                    <Td>{leadName.get(d.lead_id)}</Td>
                    <Td>{s && <Badge tone={dealCategoryTone[s.category]}>{s.name}</Badge>}{d.lost_reason && <div className="text-xs text-muted">{d.lost_reason}</div>}</Td>
                    <Td numeric>{formatMoney(d.value_minor, d.currency)}</Td>
                    <Td numeric>{formatMoney(d.commission_minor, d.currency)}</Td>
                    <Td>{d.owner_id ? memberName(members.get(d.owner_id)) : "—"}</Td>
                    <Td>{formatDate(d.closed_at, ctx.org.timezone)}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </>
      )}
    </>
  );
}
