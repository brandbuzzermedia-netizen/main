/**
 * Pure dashboard computations. Every figure is derived from rows the caller was allowed to
 * read (RLS has already filtered them). Nothing here invents, estimates or pads a number:
 * when the inputs are empty the outputs are zero or "not set", and the UI says so.
 *
 * Money is integer minor units. Totals never mix currencies: rows in another currency are
 * counted separately and reported, never converted here.
 */
import type { Consolidation } from "./registry";
import type { StageKind } from "./registry";
import { addDays, todayInBusinessTz } from "./dates";

export type StageRow = { id: string; organization_id: string; name: string; position: number; kind: StageKind; probability_pct: number };
export type DealRow = {
  id: string;
  organization_id: string;
  title: string;
  account_name: string | null;
  stage_id: string;
  value_minor: number;
  currency: string;
  owner_id: string | null;
  is_hot: boolean;
  expected_close_on: string | null;
  next_action: string | null;
  next_action_on: string | null;
  last_activity_at: string;
  closed_at: string | null;
};
export type MeetingRow = { id: string; organization_id: string; title: string; starts_at: string; status: string; deal_id: string | null; owner_id: string | null };
export type TaskRow = { id: string; organization_id: string; title: string; due_on: string | null; status: string; priority: string; assignee_id: string | null; deal_id: string | null };

export type InvoiceRow = { invoice_date: string; status: string; total_minor: number; outstanding_minor: number; effective_due_date: string; currency: string };
export type PaymentRow = { payment_date: string; amount_minor: number; kind: "receipt" | "refund"; verification_status: string; currency: string };
export type ExpenseRow = { status: string; amount_minor: number; due_date: string; paid_on: string | null; paid_amount_minor: number | null; currency: string };

const inRange = (d: string | null | undefined, start: string, end: string) => Boolean(d) && d! >= start && d! < end;
/** Timestamps arrive with mixed offsets ("Z", "+00:00", "+05:30"); compare instants, never strings. */
const t = (iso: string) => Date.parse(iso);
/** Calendar date of an instant in India (all period boundaries are IST dates). */
export const istDate = (iso: string) => todayInBusinessTz(new Date(iso));
const isOpenKind = (k: StageKind | undefined) => k !== "won" && k !== "lost";

/** Round half away from zero on integers, so weighted values stay exact minor units. */
export function weightedMinor(valueMinor: number, probabilityPct: number): number {
  return Math.round((valueMinor * probabilityPct) / 100);
}

export type PipelineSummary = {
  byStage: { stageId: string; name: string; kind: StageKind; count: number; valueMinor: number }[];
  openCount: number;
  openValueMinor: number;
  weightedMinor: number;
  /** False when every open stage has probability 0: the weighted forecast is not configured. */
  probabilitiesSet: boolean;
  won: { count: number; valueMinor: number };
  lost: { count: number };
  /** Open deals in a currency other than the base. Excluded from the money totals above. */
  otherCurrencyOpen: number;
};

export function summarizePipeline(
  stages: StageRow[],
  deals: DealRow[],
  period: { start: string; end: string },
  baseCurrency = "INR",
): PipelineSummary {
  const ordered = [...stages].sort((a, b) => a.position - b.position);
  const stageById = new Map(ordered.map((s) => [s.id, s]));
  const byStage = ordered.map((s) => ({ stageId: s.id, name: s.name, kind: s.kind, count: 0, valueMinor: 0 }));
  const idx = new Map(ordered.map((s, i) => [s.id, i]));
  const out: PipelineSummary = {
    byStage, openCount: 0, openValueMinor: 0, weightedMinor: 0,
    probabilitiesSet: ordered.some((s) => isOpenKind(s.kind) && s.probability_pct > 0),
    won: { count: 0, valueMinor: 0 }, lost: { count: 0 }, otherCurrencyOpen: 0,
  };
  for (const d of deals) {
    const stage = stageById.get(d.stage_id);
    if (!stage) continue;
    const sameCurrency = d.currency === baseCurrency;
    if (isOpenKind(stage.kind)) {
      const row = byStage[idx.get(stage.id)!];
      row.count += 1;
      if (!sameCurrency) { out.otherCurrencyOpen += 1; continue; }
      row.valueMinor += d.value_minor;
      out.openCount += 1;
      out.openValueMinor += d.value_minor;
      out.weightedMinor += weightedMinor(d.value_minor, stage.probability_pct);
    } else if (stage.kind === "won" && d.closed_at && inRange(istDate(d.closed_at), period.start, period.end)) {
      byStage[idx.get(stage.id)!].count += 1;
      if (sameCurrency) { out.won.count += 1; out.won.valueMinor += d.value_minor; }
    } else if (stage.kind === "lost" && d.closed_at && inRange(istDate(d.closed_at), period.start, period.end)) {
      byStage[idx.get(stage.id)!].count += 1;
      out.lost.count += 1;
    }
  }
  return out;
}

export type DeskItemKey = "meetings" | "hot" | "proposals" | "overdue_followups" | "stalled" | "collections";
export type DeskItem = { key: DeskItemKey; title: string; detail: string; count: number; atStakeMinor: number; action: string };

export type DeskInput = {
  today: string;
  /** ISO timestamp for "now" (meetings compare on time, not date). */
  now: string;
  stages: StageRow[];
  deals: DealRow[];
  meetings: MeetingRow[];
  tasks: TaskRow[];
  /** Overdue receivables, only when the viewer may read finance. */
  overdue?: { count: number; minor: number };
  baseCurrency?: string;
  stalledAfterDays?: number;
};

/**
 * The owner's "Closer Desk": decisions that need the owner, ranked by money at stake.
 * Each deal is counted in at most one item, in this precedence: meeting soon, hot,
 * proposal awaiting decision, overdue follow-up, stalled.
 */
export function closerDesk(input: DeskInput): DeskItem[] {
  const base = input.baseCurrency ?? "INR";
  const stalledDays = input.stalledAfterDays ?? 7;
  const stageById = new Map(input.stages.map((s) => [s.id, s]));
  const open = input.deals.filter((d) => isOpenKind(stageById.get(d.stage_id)?.kind));
  const money = (d: DealRow) => (d.currency === base ? d.value_minor : 0);
  const used = new Set<string>();
  const take = (deals: DealRow[]) => deals.filter((d) => !used.has(d.id)).map((d) => (used.add(d.id), d));
  const now = t(input.now);
  const weekAhead = now + 7 * 86_400_000;

  const soon = input.meetings.filter((m) => m.status === "scheduled" && t(m.starts_at) >= now && t(m.starts_at) <= weekAhead);
  const soonDealIds = new Set(soon.map((m) => m.deal_id).filter(Boolean) as string[]);
  const meetingDeals = take(open.filter((d) => soonDealIds.has(d.id)));
  const hot = take(open.filter((d) => d.is_hot).sort((a, b) => money(b) - money(a)));
  const proposals = take(open.filter((d) => stageById.get(d.stage_id)?.kind === "proposal"));
  const overdueDeals = take(open.filter((d) => d.next_action_on && d.next_action_on < input.today));
  const overdueTasks = input.tasks.filter((t) => (t.status === "open" || t.status === "in_progress") && t.due_on && t.due_on < input.today);
  const stalledBefore = t(`${addDays(input.today, -stalledDays)}T00:00:00+05:30`);
  const stalled = take(open.filter((d) => t(d.last_activity_at) < stalledBefore));

  const sum = (ds: DealRow[]) => ds.reduce((s, d) => s + money(d), 0);
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const items: DeskItem[] = [];
  if (soon.length) {
    items.push({ key: "meetings", title: "Meetings to prepare", count: soon.length, atStakeMinor: sum(meetingDeals), action: "Prepare",
      detail: `${plural(soon.length, "meeting")} in the next 7 days${meetingDeals.length ? `, ${plural(meetingDeals.length, "deal")} attached` : ""}` });
  }
  if (hot.length) {
    items.push({ key: "hot", title: "Hot deals", count: hot.length, atStakeMinor: sum(hot), action: "Open",
      detail: `Largest: ${hot[0].title}${hot[0].account_name ? ` · ${hot[0].account_name}` : ""}` });
  }
  if (proposals.length) {
    items.push({ key: "proposals", title: "Proposals awaiting decision", count: proposals.length, atStakeMinor: sum(proposals), action: "Review",
      detail: `${plural(proposals.length, "proposal")} out with prospects` });
  }
  if (overdueDeals.length || overdueTasks.length) {
    items.push({ key: "overdue_followups", title: "Overdue follow-ups", count: overdueDeals.length + overdueTasks.length,
      atStakeMinor: sum(overdueDeals), action: "Follow up",
      detail: [overdueDeals.length && plural(overdueDeals.length, "deal next step"), overdueTasks.length && plural(overdueTasks.length, "task")].filter(Boolean).join(" and ") + " past due" });
  }
  if (stalled.length) {
    items.push({ key: "stalled", title: "Stalled deals", count: stalled.length, atStakeMinor: sum(stalled), action: "Nudge",
      detail: `No activity for ${stalledDays}+ days` });
  }
  if (input.overdue && input.overdue.count > 0) {
    items.push({ key: "collections", title: "Collections", count: input.overdue.count, atStakeMinor: input.overdue.minor, action: "Chase",
      detail: `${plural(input.overdue.count, "invoice")} past due` });
  }
  return items.sort((a, b) => b.atStakeMinor - a.atStakeMinor || b.count - a.count);
}

export type FinanceMetrics = {
  /** Accrual: invoices raised in the period (incl. GST), excluding cancelled. */
  invoicedMinor: number;
  /** Cash: verified receipts less verified refunds dated in the period. */
  cashReceivedMinor: number;
  /** Accrual, as of today: unpaid invoice balances (issued or disputed). */
  receivablesMinor: number;
  overdueMinor: number;
  overdueCount: number;
  /** Planned (unpaid) expenses as recorded. */
  payablesMinor: number;
  /** Cash: expenses actually paid in the period. */
  expensesPaidMinor: number;
  otherCurrencyRows: number;
};

export function financeMetrics(
  rows: { invoices: InvoiceRow[]; payments: PaymentRow[]; expenses: ExpenseRow[] },
  period: { start: string; end: string },
  today: string,
  baseCurrency = "INR",
): FinanceMetrics {
  const m: FinanceMetrics = { invoicedMinor: 0, cashReceivedMinor: 0, receivablesMinor: 0, overdueMinor: 0, overdueCount: 0,
    payablesMinor: 0, expensesPaidMinor: 0, otherCurrencyRows: 0 };
  for (const i of rows.invoices) {
    if (i.currency !== baseCurrency) { m.otherCurrencyRows += 1; continue; }
    if (i.status === "cancelled") continue;
    if (inRange(i.invoice_date, period.start, period.end)) m.invoicedMinor += i.total_minor;
    if (i.outstanding_minor > 0) {
      m.receivablesMinor += i.outstanding_minor;
      if (i.status === "issued" && i.effective_due_date < today) { m.overdueMinor += i.outstanding_minor; m.overdueCount += 1; }
    }
  }
  for (const p of rows.payments) {
    if (p.verification_status !== "verified") continue;
    if (p.currency !== baseCurrency) { m.otherCurrencyRows += 1; continue; }
    if (inRange(p.payment_date, period.start, period.end)) m.cashReceivedMinor += (p.kind === "refund" ? -1 : 1) * p.amount_minor;
  }
  for (const e of rows.expenses) {
    if (e.currency !== baseCurrency) { m.otherCurrencyRows += 1; continue; }
    if (e.status === "planned") m.payablesMinor += e.amount_minor;
    if (e.status === "paid" && inRange(e.paid_on, period.start, period.end)) m.expensesPaidMinor += e.paid_amount_minor ?? 0;
  }
  return m;
}

/**
 * Only companies whose consolidation is confirmed as "consolidated" add into group totals.
 * Partner channels (commission only) would otherwise inflate revenue with partner gross deal
 * values; joint ventures need the agreed share; unconfirmed treatment is shown separately.
 */
export function includedInGroupTotals(consolidation: Consolidation): boolean {
  return consolidation === "consolidated";
}

export type CompanyAccess = { finance: boolean; crm: boolean };
export type CompanyFigures = {
  id: string;
  consolidation: Consolidation;
  access: CompanyAccess;
  finance?: FinanceMetrics;
  pipeline?: PipelineSummary;
  meetingsThisWeek?: number;
  overdueTasks?: number;
};

export type GroupTotals = {
  finance: Omit<FinanceMetrics, "otherCurrencyRows">;
  openPipelineMinor: number;
  weightedMinor: number;
  meetingsThisWeek: number;
  overdueTasks: number;
  /** Companies whose figures are inside the totals. */
  includedFinance: string[];
  includedPipeline: string[];
  /** Companies the viewer can read but which are kept out of totals (not consolidated). */
  shownSeparately: string[];
  /** Companies in the group the viewer has no access to. */
  noAccess: string[];
  /** Partner-channel open pipeline: partner gross value, never group revenue. */
  partnerGrossPipelineMinor: number;
};

export function groupTotals(companies: CompanyFigures[]): GroupTotals {
  const t: GroupTotals = {
    finance: { invoicedMinor: 0, cashReceivedMinor: 0, receivablesMinor: 0, overdueMinor: 0, overdueCount: 0, payablesMinor: 0, expensesPaidMinor: 0 },
    openPipelineMinor: 0, weightedMinor: 0, meetingsThisWeek: 0, overdueTasks: 0,
    includedFinance: [], includedPipeline: [], shownSeparately: [], noAccess: [], partnerGrossPipelineMinor: 0,
  };
  for (const c of companies) {
    if (!c.access.finance && !c.access.crm) { t.noAccess.push(c.id); continue; }
    // Work counts are activity, not money: they add up for every company the viewer can see.
    t.meetingsThisWeek += c.meetingsThisWeek ?? 0;
    t.overdueTasks += c.overdueTasks ?? 0;
    if (!includedInGroupTotals(c.consolidation)) {
      t.shownSeparately.push(c.id);
      if (c.consolidation === "commission_only" && c.pipeline) t.partnerGrossPipelineMinor += c.pipeline.openValueMinor;
      continue;
    }
    if (c.access.finance && c.finance) {
      t.includedFinance.push(c.id);
      for (const k of Object.keys(t.finance) as (keyof GroupTotals["finance"])[]) t.finance[k] += c.finance[k];
    }
    if (c.access.crm && c.pipeline) {
      t.includedPipeline.push(c.id);
      t.openPipelineMinor += c.pipeline.openValueMinor;
      t.weightedMinor += c.pipeline.weightedMinor;
    }
  }
  return t;
}
