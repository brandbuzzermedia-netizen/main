import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { loadLeadContext, memberName } from "@/lib/leads";
import { categoryTone, segmentLabel, type Segment } from "@/domain/labels";
import { formatBudget } from "@/domain/money";
import { Badge, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Pipeline" };

const PER_STAGE = 20;

type Card = { id: string; full_name: string; segment: Segment; owner_id: string | null; budget_min_minor: number | null; budget_max_minor: number | null; currency: string | null; preferred_location: string | null };

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
        .select("id, full_name, segment, owner_id, budget_min_minor, budget_max_minor, currency, preferred_location", { count: "exact" })
        .eq("organization_id", ctx.org.id)
        .eq("stage_id", s.id)
        .order("updated_at", { ascending: false })
        .limit(PER_STAGE);
      if (error) throw new Error(error.message);
      return { stage: s, leads: (data ?? []) as Card[], count: count ?? 0 };
    }),
  );
  const members = new Map(ref.members.map((m) => [m.user_id, m]));

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Leads by stage, most recently updated first. Open a lead to move it."
        actions={<Link className="text-sm text-brand" href={showClosed ? "/pipeline" : "/pipeline?closed=1"}>{showClosed ? "Hide lost and opted out" : "Show lost and opted out"}</Link>}
      />
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div className="flex gap-3" style={{ minWidth: `${columns.length * 15}rem` }}>
          {columns.map(({ stage, leads, count }) => (
            <section key={stage.id} className="flex w-60 shrink-0 flex-col rounded-xl border border-line bg-surface-2/60" aria-label={`${stage.name}: ${count} leads`}>
              <header className="flex items-center justify-between gap-2 px-3 py-2.5">
                <Badge tone={categoryTone[stage.category]}>{stage.name}</Badge>
                <span className="tabular text-xs text-muted">{count}</span>
              </header>
              <ul className="flex flex-col gap-2 px-2 pb-2">
                {leads.map((l) => (
                  <li key={l.id}>
                    <Link href={`/leads/${l.id}`} className="block rounded-lg border border-line bg-surface p-2.5 text-sm hover:border-brand">
                      <div className="font-medium">{l.full_name}</div>
                      <div className="text-xs text-muted">{segmentLabel[l.segment]}{l.preferred_location && ` · ${l.preferred_location}`}</div>
                      <div className="mt-1 flex justify-between text-xs text-muted">
                        <span className="tabular">{formatBudget(l.budget_min_minor, l.budget_max_minor, l.currency)}</span>
                        <span className="truncate pl-2">{l.owner_id ? memberName(members.get(l.owner_id)) : "Unassigned"}</span>
                      </div>
                    </Link>
                  </li>
                ))}
                {count === 0 && <li className="px-1 py-3 text-center text-xs text-muted">Empty</li>}
                {count > PER_STAGE && (
                  <li><Link href={`/leads?stage=${stage.id}`} className="block px-1 py-1 text-center text-xs text-brand">All {count} →</Link></li>
                )}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
