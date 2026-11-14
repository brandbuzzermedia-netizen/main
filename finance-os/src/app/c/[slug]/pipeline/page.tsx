import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext, ROLE_LABELS } from "@/lib/workspace";
import { loadMembers } from "@/lib/people";
import { designFor } from "@/domain/design";
import { addDays, todayInBusinessTz } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import type { DealRow, StageRow } from "@/domain/dashboard";
import { Cta, PageHead } from "@/components/dp/shell";
import { Modal } from "@/components/dp/modal";
import { C } from "@/components/dp/theme";
import { Kanban } from "@/views/kanban";
import { DealForm } from "../forms";
import { moveDealAction, toggleHotAction } from "../actions";

export const metadata: Metadata = { title: "Pipeline" };
const VIEWS = { all: "All open", hot: "Hot", proposals: "Proposals", stalled: "Stalled", closed: "Closed" } as const;
type View = keyof typeof VIEWS;

export default async function PipelinePage({ params, searchParams }: PageProps<"/c/[slug]/pipeline">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.read_all") && !ctx.can("crm.read_assigned") && !ctx.can("crm.read_shared")) notFound();
  const d = designFor(slug);
  const view: View = (Object.keys(VIEWS) as View[]).includes(sp.view as View) ? (sp.view as View) : "all";
  const base = `/c/${slug}/pipeline`;
  const [stagesRes, dealsRes, members] = await Promise.all([
    ctx.supabase.from("pipeline_stages").select("id, organization_id, name, position, kind, probability_pct").eq("organization_id", ctx.company.id).order("position"),
    ctx.supabase.from("deals").select("id, organization_id, title, account_name, stage_id, value_minor, currency, owner_id, is_hot, expected_close_on, next_action, next_action_on, last_activity_at, closed_at")
      .eq("organization_id", ctx.company.id).order("value_minor", { ascending: false }).limit(1000),
    ctx.can("crm.read_all") ? loadMembers(ctx.supabase, ctx.company.id) : Promise.resolve([]),
  ]);
  const stages = (stagesRes.data ?? []) as StageRow[];
  const all = (dealsRes.data ?? []) as DealRow[];
  const kind = new Map(stages.map((s) => [s.id, s.kind]));
  const stalledBefore = Date.parse(`${addDays(todayInBusinessTz(), -7)}T00:00:00+05:30`);
  const deals = all.filter((x) => view === "closed" ? !!x.closed_at : !x.closed_at && (view === "all" || (view === "hot" && x.is_hot)
    || (view === "proposals" && kind.get(x.stage_id) === "proposal") || (view === "stalled" && Date.parse(x.last_activity_at) < stalledBefore)));
  const cols = stages.filter((s) => (view === "closed" ? s.kind === "won" || s.kind === "lost" : s.kind !== "lost")).map((s) => ({
    name: s.name,
    deals: deals.filter((x) => x.stage_id === s.id).map((x) => ({ id: x.id, t: x.title, v: formatMoney(x.value_minor, x.currency, { compact: true }), hot: x.is_hot, sub: x.account_name ?? undefined, href: `${base}?deal=${x.id}${view !== "all" ? `&view=${view}` : ""}` })),
  }));
  const open = sp.deal ? all.find((x) => x.id === sp.deal) : undefined;
  const close = view === "all" ? base : `${base}?view=${view}`;
  const canWrite = ctx.can("crm.write");
  const sel = { border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, background: "#fff" } as const;
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title={d.ren.pipeline ?? "Pipeline"} right={canWrite ? <Cta href={`${base}?add=1`}>+ Add</Cta> : undefined} />
      {view !== "all" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <a key={v} href={v === "all" ? base : `${base}?view=${v}`} style={{ fontSize: 13, background: v === view ? "var(--co-side)" : "#fff", color: v === view ? "#fff" : C.ink, border: `1px solid ${C.line}`, borderRadius: 20, padding: "6px 14px", textDecoration: "none" }}>{VIEWS[v]}</a>
          ))}
        </div>
      )}
      <Kanban cols={cols} empty={all.length === 0 ? { msg: stages.length ? `Add the first ${d.ren.pipeline ? "record" : "deal"} with + Add. Hot deals, proposals and stalled deals then rank on the home Closer Desk.` : "This company has no stages yet. A company owner or sales manager configures them." } : undefined} />
      {sp.add && canWrite && (
        <Modal title="New deal" closeHref={close}>
          <DealForm slug={slug} canAssign={ctx.can("crm.read_all")} stages={stages.filter((s) => s.kind !== "won" && s.kind !== "lost").map((s) => ({ id: s.id, label: s.name }))}
            people={members.filter((m) => m.user_id !== ctx.userId && !["partner", "accountant"].includes(m.role)).map((m) => ({ id: m.user_id, label: `${m.name} · ${ROLE_LABELS[m.role] ?? m.role}` }))} />
        </Modal>
      )}
      {open && (
        <Modal title={open.title} closeHref={close}>
          <div style={{ fontSize: 14, color: C.body, lineHeight: 1.6, marginBottom: 14 }}>
            {open.account_name && <div>{open.account_name}</div>}
            <div><b>{formatMoney(open.value_minor, open.currency)}</b>{open.next_action && <> · Next: {open.next_action}</>}</div>
          </div>
          {canWrite ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <form action={moveDealAction.bind(null, slug)} style={{ display: "flex", gap: 8 }}>
                <input type="hidden" name="deal_id" value={open.id} />
                <select name="stage_id" defaultValue={open.stage_id} aria-label="Stage" style={sel}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                <button style={{ background: "var(--co-side)", color: "#fff", border: 0, borderRadius: 9, padding: "9px 16px", fontWeight: 600, cursor: "pointer" }}>Move</button>
              </form>
              <form action={toggleHotAction.bind(null, slug)}>
                <input type="hidden" name="deal_id" value={open.id} /><input type="hidden" name="hot" value={String(!open.is_hot)} />
                <button style={{ border: `1px solid ${C.btnLine}`, background: "transparent", borderRadius: 9, padding: "9px 16px", cursor: "pointer" }}>{open.is_hot ? "Not hot" : "Mark hot"}</button>
              </form>
              <a href={`/c/${slug}/outreach?deal=${open.id}#draft`} style={{ fontSize: 13.5, color: "var(--co-side)", fontWeight: 600 }}>Draft a follow-up →</a>
            </div>
          ) : <div style={{ fontSize: 13, color: C.muted }}>View only for your role.</div>}
        </Modal>
      )}
    </>
  );
}
