import Link from "next/link";
import { getGroupContext } from "@/lib/workspace";
import { loadGroupDashboard, type PortfolioCard } from "@/lib/dashboard-data";
import { loadGroupExtras } from "@/lib/group-extras";
import { parsePeriodKey, periodRange, financialYear } from "@/domain/periods";
import { todayInBusinessTz } from "@/domain/dates";
import { formatShort } from "@/domain/money";
import { CONSOLIDATION, LIFECYCLE, OWNERSHIP_TYPES } from "@/domain/registry";
import { MoneyRows, NotYet, PeriodTabs, Tile } from "@/components/dashboard";
import { PageHeader, cx } from "@/components/ui";

function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function CommandCentre({ searchParams }: PageProps<"/group">) {
  const g = await getGroupContext();
  const key = parsePeriodKey((await searchParams).period);
  const today = todayInBusinessTz();
  const period = periodRange(key, today, g.group.fy_start_month);
  const fy = financialYear(today, g.group.fy_start_month);
  const [{ cards, totals: t }, x] = await Promise.all([loadGroupDashboard(g, period), loadGroupExtras(g, period, today)]);
  const anyFinance = t.includedFinance.length > 0;
  const anyCrm = t.includedPipeline.length > 0;
  const nameOf = (id: string) => cards.find((c) => c.company.id === id)?.company.short_name ?? cards.find((c) => c.company.id === id)?.company.name ?? id;
  const money = (minor: number, ok: boolean) => (ok ? formatShort(minor) : "—");
  const noFin = anyFinance ? undefined : "No finance access in any consolidated company";

  return (
    <>
      <PageHeader
        eyebrow={<><span className="rounded-md bg-brand-soft px-[9px] py-[3px] text-xs font-semibold text-brand">Group Command Centre</span><span className="text-[12.5px] text-muted">Authorised consolidated view</span></>}
        title={`${greeting()}, ${g.displayName.split(/[\s@]/)[0]}.`}
        description={`${g.group.name} · ${period.label}. Totals add only companies whose consolidation is confirmed and that you are a member of.`}
        actions={<PeriodTabs current={key} basePath="/group" />}
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        <Tile label="Invoiced (booked)" value={money(t.finance.invoicedMinor, anyFinance)} sub={noFin ?? `Accrual · ${period.label}, incl. GST`} />
        <Tile label="Cash collected" value={money(t.finance.cashReceivedMinor, anyFinance)} sub={noFin ?? "Cash · verified receipts less refunds"} />
        <Tile label="Receivables" value={money(t.finance.receivablesMinor, anyFinance)} sub={noFin ?? "Unpaid invoice balances today"} />
        <Tile label="Overdue" value={money(t.finance.overdueMinor, anyFinance)} sub={noFin ?? `${t.finance.overdueCount} invoice(s) past due`} />
        <Tile label="Payables" value={money(t.finance.payablesMinor, anyFinance)} sub={noFin ?? "Unpaid expenses as recorded"} />
        <Tile label="Open pipeline" value={money(t.openPipelineMinor, anyCrm)} sub={anyCrm ? `Across ${t.includedPipeline.length} compan${t.includedPipeline.length === 1 ? "y" : "ies"}` : "No pipeline access"} />
        <Tile label="Weighted forecast" value={money(t.weightedMinor, anyCrm)} sub="Value × each stage's configured probability" />
        <Tile label="Meetings this week" value={t.meetingsThisWeek} sub="Companies you can see" />
        <Tile label="Overdue tasks" value={t.overdueTasks} />
        <Tile label="Partner referrals (gross)" value={formatShort(t.partnerGrossPipelineMinor)} sub="Partner deal value. Not income" />
        <Tile label="Automation health" href="/group/automation" value={x.automation ? `${x.automation.live} live / ${x.automation.failed} failed` : <NotYet>No access</NotYet>}
          sub={x.automation ? `${x.automation.pending} waiting for approval` : "Owners and company admins see this"} />
        <Tile label="Rent received" href="/group/rental" value={x.rental ? formatShort(x.rental.total.receivedMinor) : <NotYet>No rental access</NotYet>}
          sub={x.rental ? `${formatShort(x.rental.total.overdueMinor)} overdue · cash` : "Salon and Tower live under the owning workspace"} />
      </div>

      <Coverage included={t.includedFinance.map(nameOf)} pipeline={t.includedPipeline.map(nameOf)} separate={t.shownSeparately.map(nameOf)} noAccess={t.noAccess.map(nameOf)} />

      <h2 className="mt-8 mb-3.5 font-display text-2xl">Money · {period.label} and {fy.label}</h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        <MoneyRows title="Income" rows={[
          { name: "Operating revenue invoiced", basis: "Booked, accrual, incl. GST", value: money(t.finance.invoicedMinor, anyFinance) },
          { name: "Cash actually received", basis: "Cash basis", value: money(t.finance.cashReceivedMinor, anyFinance) },
          { name: "Ledger income booked", basis: "Commission, other income (accrual); kept apart from invoices", value: x.ledgerSummary ? formatShort(x.ledgerSummary.incomeBookedMinor) : "—" },
          { name: "Rental income billed", basis: "Salon, Tower and other units (accrual)", value: x.rental ? formatShort(x.rental.total.billedMinor) : "—" },
        ]} />
        <MoneyRows title="Expenses" rows={[
          { name: "Expenses booked", basis: "Incurred, accrual (approved ledger)", value: x.ledgerSummary ? formatShort(x.ledgerSummary.expensesBookedMinor) : "—" },
          { name: "Expenses paid", basis: "Cash basis, this period", value: x.ledgerSummary ? formatShort(x.ledgerSummary.expensesPaidMinor) : "—" },
          { name: "Payables (unpaid)", basis: "Approved, not yet paid", value: x.ledgerSummary ? formatShort(x.ledgerSummary.payablesMinor) : "—" },
          { name: "Bills waiting for review", basis: "OCR queue, not yet in the ledger", value: x.bills ?? "—" },
        ]} />
        <MoneyRows title="Rental income" rows={x.rental && x.rental.units.length ? [
          ...x.rental.units.map((u) => ({ name: u.label, basis: u.tenant ? `Billed ${formatShort(u.report.billedMinor)} · arrears ${formatShort(u.report.arrearsMinor)}` : "No active lease", value: formatShort(u.report.receivedMinor) })),
          { name: "Security deposits", basis: "Liability, never income", value: formatShort(x.rental.total.depositsHeldMinor) },
          { name: "Net rental cash flow", basis: "Cash", value: formatShort(x.rental.total.netCashMinor) },
        ] : [
          { name: "Salon", basis: "Not configured yet", value: <NotYet>Not set up</NotYet> },
          { name: "Tower", basis: "Not configured yet", value: <NotYet>Not set up</NotYet> },
        ]} footer={<Link href="/group/rental" className="text-co-side">Open rental income →</Link>} />
      </div>

      <h2 className="mt-8 mb-3.5 font-display text-2xl">Portfolio</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-4">
        {cards.map((c) => <PortfolioTile key={c.company.id} card={c} />)}
        {g.group.role === "group_owner" && (
          <Link href="/group/companies#add" className="grid min-h-[130px] place-items-center rounded-[14px] border border-dashed border-[#cfc8b5] p-5 text-center text-sm text-muted hover:bg-surface">
            <span><span className="block font-display text-xl text-ink">+ Add a business</span>The brief names more ventures than it details. Nothing is invented: add one when it is confirmed.</span>
          </Link>
        )}
      </div>
    </>
  );
}

function Coverage({ included, pipeline, separate, noAccess }: { included: string[]; pipeline: string[]; separate: string[]; noAccess: string[] }) {
  const list = (xs: string[]) => (xs.length ? xs.join(", ") : "none");
  return (
    <details className="mt-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] text-muted">
      <summary className="cursor-pointer font-semibold text-ink">What these totals include</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Finance totals: {list(included)}.</li>
        <li>Pipeline totals: {list(pipeline)}.</li>
        <li>Shown separately, not added (partner channels, joint ventures, unconfirmed treatment): {list(separate)}.</li>
        <li>No access for you: {list(noAccess)}.</li>
        <li>Internal transfers, loans, capital and refundable deposits are never income. Partner gross deal value is never group revenue.</li>
      </ul>
    </details>
  );
}

const ACCENT_FALLBACK = "#829487";

function PortfolioTile({ card }: { card: PortfolioCard }) {
  const c = card.company;
  const f = card.figures;
  const alert = c.emergency_stop ? "Emergency stop on" : c.consolidation === "needs_confirmation" ? "Consolidation needs confirmation" : null;
  const body = (
    <>
      <div className="flex justify-between gap-2">
        <div className="font-display text-[19px] leading-tight">{c.name}</div>
        <span className="h-fit rounded-md bg-brand-soft px-2 py-0.5 text-[11.5px] whitespace-nowrap text-brand">{LIFECYCLE[c.lifecycle_status]}</span>
      </div>
      <div className="mt-2 text-[12.5px] text-muted">{OWNERSHIP_TYPES[c.ownership_type]} · {CONSOLIDATION[c.consolidation]}</div>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-[13.5px]">
        {card.access.crm && f.pipeline ? (
          <span>{c.consolidation === "commission_only" ? "Referrals (gross)" : "Pipeline"} <b>{formatShort(f.pipeline.openValueMinor)}</b></span>
        ) : card.access.finance && f.finance ? (
          <span>Receivables <b>{formatShort(f.finance.receivablesMinor)}</b></span>
        ) : (
          <span className="text-faint">{card.role ? "No figures for your role" : "No access to figures"}</span>
        )}
        {alert && <span className="text-danger">{alert}</span>}
      </div>
    </>
  );
  const cls = "block rounded-[14px] border border-line border-t-4 bg-surface px-5 py-[18px]";
  const style = { borderTopColor: c.sidebar_color ?? ACCENT_FALLBACK };
  return card.role ? (
    <Link href={`/switch?to=${encodeURIComponent(c.slug)}`} className={cx(cls, "hover:border-faint")} style={style}>{body}</Link>
  ) : (
    <div className={cls} style={style} title="You are not a member of this company">{body}</div>
  );
}
