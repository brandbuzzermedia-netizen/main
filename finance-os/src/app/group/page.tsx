import { getGroupContext } from "@/lib/workspace";
import { loadGroupDashboard } from "@/lib/dashboard-data";
import { loadGroupExtras } from "@/lib/group-extras";
import { companiesWith } from "@/lib/group-data";
import { financialYear, periodRange } from "@/domain/periods";
import { todayInBusinessTz } from "@/domain/dates";
import { formatShort } from "@/domain/money";
import { designFor } from "@/domain/design";
import { GroupHome } from "@/views/group-home";

const NO = "—";

export default async function CommandCentre() {
  const g = await getGroupContext();
  const today = todayInBusinessTz();
  const period = periodRange("month", today, g.group.fy_start_month);
  const fy = financialYear(today, g.group.fy_start_month);
  const opsIds = companiesWith(g, "operations.read").map((c) => c.id);
  const [{ cards, totals: t }, x, orders] = await Promise.all([
    loadGroupDashboard(g, period), loadGroupExtras(g, period, today),
    opsIds.length ? g.supabase.from("orders").select("id", { count: "exact", head: true }).in("organization_id", opsIds).not("status", "in", "(delivered,cancelled,returned)") : Promise.resolve({ count: null }),
  ]);
  const fin = t.includedFinance.length > 0;
  const crm = t.includedPipeline.length > 0;
  const L = x.ledgerSummary;
  const won = cards.filter((c) => t.includedPipeline.includes(c.company.id)).reduce((s, c) => s + (c.figures.pipeline?.won.valueMinor ?? 0), 0);
  const money = (n: number | null | undefined, ok = true) => (ok && n !== null && n !== undefined ? formatShort(n) : NO);

  const portfolio = cards.map((c) => {
    const d = designFor(c.company.slug);
    const gateAlert = /needs|block/i.test(d.gate[1]) ? `Gate: ${d.gate[1]}` : "";
    return {
      name: c.company.name, own: d.own, treat: d.treat, acc: d.acc,
      status: c.company.lifecycle_status === "active" ? "Active" : "Pre-launch / empty",
      pipe: c.access.crm && c.figures.pipeline ? formatShort(c.figures.pipeline.openValueMinor) : NO,
      alert: c.company.emergency_stop ? "Emergency stop on" : gateAlert,
      href: c.role ? `/switch?to=${encodeURIComponent(c.company.slug)}` : null,
    };
  });
  const risks = portfolio.filter((p) => p.alert).length;
  const rentalUnits = x.rental?.units ?? [];

  return (
    <GroupHome vm={{
      title: g.group.name, fyLabel: fy.label, cta: { label: "+ New lead", href: "/group/pipeline?add=1" },
      tiles: [
        { l: "Booked revenue", v: money(won, crm), s: "Accrual · deals won this month", href: "/group/pipeline" },
        { l: "Cash collected", v: money(t.finance.cashReceivedMinor + (L?.incomeReceivedMinor ?? 0), fin || !!L), s: "Cash", href: "/group/finance" },
        { l: "Receivables", v: money(t.finance.receivablesMinor + (L?.receivablesMinor ?? 0), fin || !!L), href: "/group/finance" },
        { l: "Payables", v: money(t.finance.payablesMinor + (L?.payablesMinor ?? 0), fin || !!L), href: "/group/expenses" },
        { l: "Open pipeline", v: money(t.openPipelineMinor, crm), href: "/group/pipeline" },
        { l: "Weighted forecast", v: money(t.weightedMinor, crm) },
        { l: "Orders", v: orders.count ?? NO, s: "Across owned ventures" },
        { l: "Active projects", v: NO, s: "Project tracking not set up" },
        { l: "Meetings this week", v: t.meetingsThisWeek, href: "/group/calendar" },
        { l: "Overdue tasks", v: t.overdueTasks },
        { l: "Risks", v: risks, s: "Compliance gates" },
        { l: "Automation health", v: x.automation ? `${x.automation.live} / ${x.automation.failed}` : NO, s: "Live / failed", href: "/group/automation" },
      ],
      income: [
        { n: "Operating / business revenue", t: "Booked, accrual", v: money(t.finance.invoicedMinor + (L?.incomeBookedMinor ?? 0), fin || !!L) },
        { n: "Rental income", t: "Salon and Tower, billed", v: x.rental && rentalUnits.length ? formatShort(x.rental.total.billedMinor) : "Not set" },
        { n: "Other income", t: "Booked", v: money(L?.incomeBookedMinor ?? 0, !!L) },
        { n: "Cash actually received", t: "Cash basis", v: money(t.finance.cashReceivedMinor + (L?.incomeReceivedMinor ?? 0), fin || !!L) },
      ],
      expenses: [
        { n: "Expenses booked", t: "Incurred, accrual", v: money(L?.expensesBookedMinor, !!L) },
        { n: "Expenses paid in cash", t: "Cash basis", v: money(L?.expensesPaidMinor, !!L) },
        { n: "Rental expenses by unit", t: rentalUnits.length ? rentalUnits.map((u) => u.label).join(", ") : "Salon, Tower", v: x.rental && rentalUnits.length ? formatShort(x.rental.total.expensesMinor) : NO },
        { n: "Payables and overdue", t: "Unpaid", v: money(t.finance.payablesMinor + (L?.payablesMinor ?? 0), fin || !!L) },
      ],
      rental: [
        ...(rentalUnits.length ? rentalUnits.map((u) => ({ n: u.label, t: u.tenant ? `Billed ${formatShort(u.report.billedMinor)} · arrears ${formatShort(u.report.arrearsMinor)}` : "Rent, tenant, due date not set", v: formatShort(u.report.receivedMinor) }))
          : [{ n: "Salon", t: "Rent, tenant, due date not set", v: "₹0" }, { n: "Tower", t: "Rent, tenant, due date not set", v: "₹0" }]),
        { n: "Security deposits", t: "Liability, not income", v: formatShort(x.rental?.total.depositsHeldMinor ?? 0) },
        { n: "Net rental cashflow", t: "Cash", v: formatShort(x.rental?.total.netCashMinor ?? 0) },
      ],
      portfolio,
      addHref: g.group.role === "group_owner" ? "/group/settings#add" : null,
    }} />
  );
}
