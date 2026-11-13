import Link from "next/link";
import type { Metadata } from "next";
import { getGroupContext } from "@/lib/workspace";
import { loadGroupLedger } from "@/lib/group-ledger";
import { nameMap } from "@/lib/group-data";
import { financialYear, parsePeriodKey, periodRange } from "@/domain/periods";
import { todayInBusinessTz } from "@/domain/dates";
import { formatMoney, formatShort } from "@/domain/money";
import { monthlyBreakdown, summarizeLedger } from "@/domain/ledger";
import { CONSOLIDATION } from "@/domain/registry";
import { PeriodTabs, Tile } from "@/components/dashboard";
import { Alert, PageHeader, Table, Td } from "@/components/ui";

export const metadata: Metadata = { title: "Group finance" };

export default async function GroupFinance({ searchParams }: PageProps<"/group/finance">) {
  const g = await getGroupContext();
  const today = todayInBusinessTz();
  const key = parsePeriodKey((await searchParams).period);
  const period = periodRange(key, today, g.group.fy_start_month);
  const fy = financialYear(today, g.group.fy_start_month);
  const data = await loadGroupLedger(g, fy.start < period.start ? { start: fy.start, end: period.end } : period);
  const total = summarizeLedger(data.consolidatedRows, period);
  const names = nameMap(g.registry);
  const months = monthlyBreakdown(data.consolidatedRows, fy);
  return (
    <>
      <PageHeader title="Group finance" description={`${period.label}. Consolidated companies only, with internal transfers cancelled out. Accrual and cash are shown separately; this is not a bank balance.`}
        actions={<PeriodTabs current={key} basePath="/group/finance" />} />
      {data.readable.length === 0 && <div className="mb-4"><Alert tone="info">You have finance access in no group company. Figures appear once a company owner grants it.</Alert></div>}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <Tile label="Income booked" value={formatShort(total.incomeBookedMinor)} sub="Accrual" />
        <Tile label="Cash received" value={formatShort(total.incomeReceivedMinor)} sub="Cash" />
        <Tile label="Expenses booked" value={formatShort(total.expensesBookedMinor)} sub="Accrual" />
        <Tile label="Cash paid" value={formatShort(total.expensesPaidMinor)} sub="Cash" />
        <Tile label="Net operating result" value={formatShort(total.netOperatingMinor)} sub="Accrual" />
        <Tile label="Net cash movement" value={formatShort(total.netCashMovementMinor)} sub="Cash, transfers cancelled" />
        <Tile label="Receivables" value={formatShort(total.receivablesMinor)} />
        <Tile label="Payables" value={formatShort(total.payablesMinor)} />
        <Tile label="Loans & capital in" value={formatShort(total.financingInMinor)} sub="Not income" />
        <Tile label="Deposits held" value={formatShort(total.depositsHeldMinor)} sub="Liability" />
      </div>
      <h2 className="mt-8 mb-3 font-display text-2xl">By company · {period.label}</h2>
      <Table head={["Company", "Group totals", "Income booked", "Cash received", "Expenses booked", "Net operating", ""]}>
        {data.readable.map((c) => {
          const s = summarizeLedger(data.rows.filter((r) => r.organization_id === c.id), period);
          return (
            <tr key={c.id}>
              <Td className="font-medium">{names.get(c.id)}</Td><Td className="text-xs">{CONSOLIDATION[c.consolidation]}</Td>
              <Td numeric>{formatMoney(s.incomeBookedMinor, "INR", { compact: true })}</Td><Td numeric>{formatMoney(s.incomeReceivedMinor, "INR", { compact: true })}</Td>
              <Td numeric>{formatMoney(s.expensesBookedMinor, "INR", { compact: true })}</Td><Td numeric>{formatMoney(s.netOperatingMinor, "INR", { compact: true })}</Td>
              <Td><Link className="text-sm underline" href={`/switch?to=${c.slug}&next=${encodeURIComponent(`/c/${c.slug}/ledger`)}`}>Ledger</Link></Td>
            </tr>
          );
        })}
      </Table>
      <h2 className="mt-8 mb-3 font-display text-2xl">{fy.label} by month (consolidated)</h2>
      <Table head={["Month", "Income booked", "Cash received", "Expenses booked", "Cash paid", "Net operating"]}>
        {months.map((m) => (
          <tr key={m.month}><Td>{m.month}</Td>
            {(["incomeBookedMinor", "incomeReceivedMinor", "expensesBookedMinor", "expensesPaidMinor", "netOperatingMinor"] as const).map((k) => <Td key={k} numeric>{formatMoney(m.summary[k], "INR", { compact: true })}</Td>)}</tr>
        ))}
      </Table>
    </>
  );
}
