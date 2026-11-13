import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  closerDesk, financeMetrics, groupTotals, istDate, summarizePipeline,
  type CompanyFigures, type DealRow, type ExpenseRow, type InvoiceRow, type MeetingRow, type PaymentRow, type StageRow, type TaskRow,
} from "@/domain/dashboard";
import { addDays, todayInBusinessTz } from "@/domain/dates";
import { weekRange, type Period } from "@/domain/periods";
import type { Company, CompanyContext, GroupContext, Permission } from "@/lib/workspace";

const DEAL_COLS = "id, organization_id, title, account_name, stage_id, value_minor, currency, owner_id, is_hot, expected_close_on, next_action, next_action_on, last_activity_at, closed_at";
const MEETING_COLS = "id, organization_id, title, starts_at, status, deal_id, owner_id";
const TASK_COLS = "id, organization_id, title, due_on, status, priority, assignee_id, deal_id";

/** Fail loudly: a dashboard that silently drops a failed query would show wrong totals. */
function rows<T>(res: { data: unknown; error: { message: string } | null }, what: string): T[] {
  if (res.error) throw new Error(`Could not load ${what}: ${res.error.message}`);
  return (res.data ?? []) as T[];
}

async function loadCrm(supabase: SupabaseClient, orgIds: string[], period: Period, today: string) {
  if (orgIds.length === 0) return { stages: [], deals: [], meetings: [], tasks: [] };
  const week = weekRange(today);
  const from = week.start < today ? week.start : today;
  const [stages, deals, meetings, tasks] = await Promise.all([
    supabase.from("pipeline_stages").select("id, organization_id, name, position, kind, probability_pct").in("organization_id", orgIds),
    // Open deals, plus deals closed in the period (for won/lost counts).
    supabase.from("deals").select(DEAL_COLS).in("organization_id", orgIds)
      .or(`closed_at.is.null,closed_at.gte.${period.start}`).limit(5000),
    supabase.from("meetings").select(MEETING_COLS).in("organization_id", orgIds)
      .gte("starts_at", `${from}T00:00:00+05:30`).lte("starts_at", `${addDays(today, 8)}T00:00:00+05:30`).order("starts_at").limit(500),
    supabase.from("tasks").select(TASK_COLS).in("organization_id", orgIds).in("status", ["open", "in_progress"]).limit(5000),
  ]);
  return {
    stages: rows<StageRow>(stages, "pipeline stages"),
    deals: rows<DealRow>(deals, "deals"),
    meetings: rows<MeetingRow>(meetings, "meetings"),
    tasks: rows<TaskRow>(tasks, "tasks"),
  };
}

async function loadFinance(supabase: SupabaseClient, orgIds: string[], period: Period) {
  if (orgIds.length === 0) return { invoices: [], payments: [], expenses: [] };
  const [invoices, payments, expenses] = await Promise.all([
    supabase.from("invoice_balances").select("organization_id, invoice_date, status, total_minor, outstanding_minor, effective_due_date, currency")
      .in("organization_id", orgIds).or(`outstanding_minor.gt.0,and(invoice_date.gte.${period.start},invoice_date.lt.${period.end})`).limit(10000),
    supabase.from("payments").select("organization_id, payment_date, amount_minor, kind, verification_status, currency")
      .in("organization_id", orgIds).eq("verification_status", "verified").gte("payment_date", period.start).lt("payment_date", period.end).limit(10000),
    supabase.from("expenses").select("organization_id, status, amount_minor, due_date, paid_on, paid_amount_minor, currency")
      .in("organization_id", orgIds).or(`status.eq.planned,and(status.eq.paid,paid_on.gte.${period.start},paid_on.lt.${period.end})`).limit(10000),
  ]);
  type Org = { organization_id: string };
  return {
    invoices: rows<InvoiceRow & Org>(invoices, "invoices"),
    payments: rows<PaymentRow & Org>(payments, "payments"),
    expenses: rows<ExpenseRow & Org>(expenses, "expenses"),
  };
}

const byOrg = <T extends { organization_id: string }>(list: T[], id: string) => list.filter((r) => r.organization_id === id);

function nowIso() {
  return new Date().toISOString();
}

export async function loadCompanyDashboard(ctx: CompanyContext, period: Period) {
  const today = todayInBusinessTz();
  const id = ctx.company.id;
  const canCrm = ctx.can("crm.read_all") || ctx.can("crm.read_assigned") || ctx.can("crm.read_shared") || ctx.can("tasks.write");
  const [crm, fin] = await Promise.all([
    canCrm ? loadCrm(ctx.supabase, [id], period, today) : Promise.resolve({ stages: [], deals: [], meetings: [], tasks: [] }),
    ctx.can("finance.read") ? loadFinance(ctx.supabase, [id], period) : Promise.resolve(null),
  ]);
  const pipeline = summarizePipeline(crm.stages, crm.deals, period, ctx.company.base_currency);
  const finance = fin ? financeMetrics(fin, period, today, ctx.company.base_currency) : null;
  const week = weekRange(today);
  const meetingsThisWeek = crm.meetings.filter((m) => m.status !== "cancelled" && istDate(m.starts_at) >= week.start && istDate(m.starts_at) < week.end).length;
  const overdueTasks = crm.tasks.filter((t) => t.due_on && t.due_on < today).length;
  const desk = closerDesk({
    today, now: nowIso(), stages: crm.stages, deals: crm.deals, meetings: crm.meetings, tasks: crm.tasks,
    overdue: finance ? { count: finance.overdueCount, minor: finance.overdueMinor } : undefined,
    baseCurrency: ctx.company.base_currency,
  });
  const todaysMeetings = crm.meetings.filter((m) => m.status === "scheduled" && istDate(m.starts_at) === today);
  return { today, crm, pipeline, finance, desk, meetingsThisWeek, overdueTasks, todaysMeetings, canCrm };
}

/** Assigned work for an employee: only rows they own or are assigned, never company totals. */
export async function loadMyWork(ctx: CompanyContext) {
  const today = todayInBusinessTz();
  const id = ctx.company.id;
  const [tasks, deals, meetings, stages] = await Promise.all([
    ctx.supabase.from("tasks").select(TASK_COLS).eq("organization_id", id).eq("assignee_id", ctx.userId)
      .in("status", ["open", "in_progress"]).order("due_on", { ascending: true, nullsFirst: false }).limit(200),
    ctx.supabase.from("deals").select(DEAL_COLS).eq("organization_id", id).eq("owner_id", ctx.userId).is("closed_at", null)
      .order("next_action_on", { ascending: true, nullsFirst: false }).limit(200),
    ctx.supabase.from("meetings").select(MEETING_COLS).eq("organization_id", id).eq("owner_id", ctx.userId).eq("status", "scheduled")
      .gte("starts_at", `${today}T00:00:00+05:30`).order("starts_at").limit(50),
    ctx.supabase.from("pipeline_stages").select("id, organization_id, name, position, kind, probability_pct").eq("organization_id", id),
  ]);
  return {
    today,
    tasks: rows<TaskRow>(tasks, "your tasks"),
    deals: rows<DealRow>(deals, "your deals"),
    meetings: rows<MeetingRow>(meetings, "your meetings"),
    stages: rows<StageRow>(stages, "stages"),
  };
}

export type PortfolioCard = {
  company: Company;
  role: string | null;
  access: { finance: boolean; crm: boolean };
  figures: CompanyFigures;
};

export async function loadGroupDashboard(g: GroupContext, period: Period) {
  const today = todayInBusinessTz();
  const has = (id: string, p: Permission) => g.access.get(id)?.permissions.has(p) ?? false;
  const active = g.registry.filter((c) => c.lifecycle_status !== "archived");
  const financeIds = active.filter((c) => has(c.id, "finance.read")).map((c) => c.id);
  const crmIds = active.filter((c) => has(c.id, "crm.read_all")).map((c) => c.id);
  const [crm, fin] = await Promise.all([loadCrm(g.supabase, crmIds, period, today), loadFinance(g.supabase, financeIds, period)]);
  const week = weekRange(today);

  const cards: PortfolioCard[] = active.map((c) => {
    const access = { finance: financeIds.includes(c.id), crm: crmIds.includes(c.id) };
    const figures: CompanyFigures = { id: c.id, consolidation: c.consolidation, access };
    if (access.finance) {
      figures.finance = financeMetrics(
        { invoices: byOrg(fin.invoices, c.id), payments: byOrg(fin.payments, c.id), expenses: byOrg(fin.expenses, c.id) },
        period, today, c.base_currency);
    }
    if (access.crm) {
      figures.pipeline = summarizePipeline(byOrg(crm.stages, c.id), byOrg(crm.deals, c.id), period, c.base_currency);
      figures.meetingsThisWeek = byOrg(crm.meetings, c.id)
        .filter((m) => m.status !== "cancelled" && istDate(m.starts_at) >= week.start && istDate(m.starts_at) < week.end).length;
      figures.overdueTasks = byOrg(crm.tasks, c.id).filter((t) => t.due_on && t.due_on < today).length;
    }
    return { company: c, role: g.access.get(c.id)?.role ?? null, access, figures };
  });
  return { today, cards, totals: groupTotals(cards.map((c) => c.figures)) };
}
