import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { loadLeadContext, memberName } from "@/lib/leads";
import { categoryTone, segmentLabel, type Segment } from "@/domain/labels";
import { formatBudget } from "@/domain/money";
import { PageHeader } from "@/components/ui";
import { Board, type BoardCard } from "@/components/board";
import { moveLeadAction } from "../crm-actions";

export const metadata: Metadata = { title: "Lead pipeline" };

const PER_STAGE = 25;

type Row = { id: string; full_name: string; segment: Segment; owner_id: string | null; stage_id: string; budget_min_minor: number | null; budget_max_minor: number | null; currency: string | null; preferred_location: string | null };

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const showClosed = sp.closed === "1";
  const ref = await loadLeadContext(ctx);
  const stages = ref.stages.filter((s) => showClosed || !["lost", "opted_out"].includes(s.category));
  const columns = await Promise.all(
    stages.map(async (s) => {
      const { data, count, error } = await ctx.supabase
        .from("leads")
        .select("id, full_name, segment, owner_id, stage_id, budget_min_minor, budget_max_minor, currency, preferred_location", { count: "exact" })
        .eq("organization_id", ctx.org.id)
        .eq("stage_id", s.id)
        .order("updated_at", { ascending: false })
        .limit(PER_STAGE);
      if (error) throw new Error(error.message);
      return { stage: s, leads: (data ?? []) as Row[], count: count ?? 0 };
    }),
  );
  const members = new Map(ref.members.map((m) => [m.user_id, m]));
  const cards: BoardCard[] = columns.flatMap(({ leads }) =>
    leads.map((l) => ({
      id: l.id,
      columnId: l.stage_id,
      href: `/leads/${l.id}`,
      title: l.full_name,
      lines: [`${segmentLabel[l.segment]}${l.preferred_location ? ` · ${l.preferred_location}` : ""}`, l.owner_id ? memberName(members.get(l.owner_id)) : "Unassigned"],
      aside: formatBudget(l.budget_min_minor, l.budget_max_minor, l.currency),
    })),
  );

  return (
    <>
      <PageHeader
        title="Lead pipeline"
        description={ctx.can.workCrm ? "Drag a lead to another stage, or use its menu. Every move is recorded on the lead's timeline." : "Leads by stage."}
        actions={
          <>
            <Link className="text-sm text-brand" href="/deals">Deal pipeline →</Link>
            <Link className="text-sm text-muted hover:text-ink" href={showClosed ? "/pipeline" : "/pipeline?closed=1"}>{showClosed ? "Hide lost and opted out" : "Show lost and opted out"}</Link>
          </>
        }
      />
      <Board
        label="Lead pipeline"
        canMove={ctx.can.workCrm}
        move={moveLeadAction}
        columns={columns.map(({ stage, count }) => ({ id: stage.id, title: stage.name, tone: categoryTone[stage.category], count, moreHref: `/leads?stage=${stage.id}` }))}
        cards={cards}
      />
      <p className="text-xs text-muted">Moving a lead to Opted out does not suppress it. Record the opt-out on the lead page, so it applies to every channel and every future import.</p>
    </>
  );
}
