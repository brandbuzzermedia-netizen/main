import Link from "next/link";
import type { Metadata } from "next";
import { getCompanyContext } from "@/lib/workspace";
import { loadMembers } from "@/lib/people";
import type { DealRow, StageRow } from "@/domain/dashboard";
import { addDays, formatDate, todayInBusinessTz } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { Badge, ButtonLink, EmptyState, PageHeader, Table, Td, cx } from "@/components/ui";
import { moveDealAction, toggleHotAction } from "../actions";

export const metadata: Metadata = { title: "Pipeline" };

const VIEWS = { all: "All open", hot: "Hot", proposals: "Proposals", stalled: "Stalled", closed: "Closed" } as const;
type View = keyof typeof VIEWS;

export default async function PipelinePage({ params, searchParams }: PageProps<"/c/[slug]/pipeline">) {
  const { slug } = await params;
  const sp = await searchParams;
  const view: View = (Object.keys(VIEWS) as View[]).includes(sp.view as View) ? (sp.view as View) : "all";
  const ctx = await getCompanyContext(slug);
  const base = `/c/${slug}`;
  const [stagesRes, dealsRes, members] = await Promise.all([
    ctx.supabase.from("pipeline_stages").select("id, organization_id, name, position, kind, probability_pct").eq("organization_id", ctx.company.id).order("position"),
    ctx.supabase.from("deals").select("id, organization_id, title, account_name, stage_id, value_minor, currency, owner_id, is_hot, expected_close_on, next_action, next_action_on, last_activity_at, closed_at")
      .eq("organization_id", ctx.company.id).order("value_minor", { ascending: false }).limit(1000),
    ctx.can("crm.read_all") ? loadMembers(ctx.supabase, ctx.company.id) : Promise.resolve([]),
  ]);
  if (stagesRes.error) throw new Error(stagesRes.error.message);
  if (dealsRes.error) throw new Error(dealsRes.error.message);
  const stages = (stagesRes.data ?? []) as StageRow[];
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const today = todayInBusinessTz();
  const stalledBefore = Date.parse(`${addDays(today, -7)}T00:00:00+05:30`);
  const isOpen = (d: DealRow) => !d.closed_at;
  const deals = ((dealsRes.data ?? []) as DealRow[]).filter((d) => {
    switch (view) {
      case "hot": return isOpen(d) && d.is_hot;
      case "proposals": return isOpen(d) && stageById.get(d.stage_id)?.kind === "proposal";
      case "stalled": return isOpen(d) && Date.parse(d.last_activity_at) < stalledBefore;
      case "closed": return !isOpen(d);
      default: return isOpen(d);
    }
  });
  const ownerName = new Map(members.map((m) => [m.user_id, m.name]));
  const canWrite = ctx.can("crm.write");

  return (
    <>
      <PageHeader
        title="Pipeline"
        description={ctx.can("crm.read_all") ? "Every deal in this company." : ctx.can("crm.read_shared") ? "Deals shared with you." : "Deals you own."}
        actions={canWrite && <ButtonLink variant="company" href={`${base}/pipeline/new`}>+ New deal</ButtonLink>}
      />
      <nav aria-label="Views" className="mb-4 flex flex-wrap gap-1.5">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={v === "all" ? `${base}/pipeline` : `${base}/pipeline?view=${v}`} aria-current={view === v ? "page" : undefined}
            className={cx("rounded-full border px-3 py-1 text-sm", view === v ? "border-co-side bg-co-side text-white" : "border-line bg-surface hover:bg-surface-2")}>
            {VIEWS[v]}
          </Link>
        ))}
      </nav>
      {deals.length === 0 ? (
        <EmptyState title={view === "all" ? "No open deals" : `No ${VIEWS[view].toLowerCase()} deals`}
          action={canWrite && view === "all" && <ButtonLink variant="company" href={`${base}/pipeline/new`}>Add the first deal</ButtonLink>}>
          {stages.length === 0 ? "This company has no pipeline stages yet. A company owner or sales manager configures them." : undefined}
        </EmptyState>
      ) : (
        <Table head={["Deal", "Stage", "Value", "Next step", "Owner", ""]}>
          {deals.map((d) => (
            <tr key={d.id}>
              <Td>
                <div className="font-medium">{d.title} {d.is_hot && <Badge tone="warn">Hot</Badge>}</div>
                {d.account_name && <div className="text-xs text-muted">{d.account_name}</div>}
              </Td>
              <Td>
                {canWrite ? (
                  <form action={moveDealAction.bind(null, slug)} className="flex gap-1.5">
                    <input type="hidden" name="deal_id" value={d.id} />
                    <select name="stage_id" defaultValue={d.stage_id} aria-label={`Stage for ${d.title}`} className="rounded-md border border-line bg-surface px-2 py-1 text-sm">
                      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button className="rounded-md border border-line px-2 text-xs hover:bg-surface-2">Move</button>
                  </form>
                ) : stageById.get(d.stage_id)?.name}
              </Td>
              <Td numeric>{formatMoney(d.value_minor, d.currency, { compact: true })}</Td>
              <Td>
                {d.next_action ?? <span className="text-faint">—</span>}
                {d.next_action_on && <div className={cx("text-xs", d.next_action_on < today ? "text-danger" : "text-muted")}>{formatDate(d.next_action_on)}</div>}
              </Td>
              <Td>{d.owner_id ? ownerName.get(d.owner_id) ?? (d.owner_id === ctx.userId ? "You" : "—") : "Unassigned"}</Td>
              <Td>
                {canWrite && !d.closed_at && (
                  <form action={toggleHotAction.bind(null, slug)}>
                    <input type="hidden" name="deal_id" value={d.id} />
                    <input type="hidden" name="hot" value={String(!d.is_hot)} />
                    <button className="text-xs text-muted underline-offset-2 hover:underline">{d.is_hot ? "Not hot" : "Mark hot"}</button>
                  </form>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
