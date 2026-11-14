import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { parsePeriodKey, periodRange, financialYear } from "@/domain/periods";
import { formatDate, todayInBusinessTz } from "@/domain/dates";
import { formatMoney, formatShort } from "@/domain/money";
import { LEDGER_TYPE_LABELS, monthlyBreakdown, rowsForMetric, summarizeLedger, type LedgerMetric, type LedgerRow } from "@/domain/ledger";
import { PeriodTabs, Tile } from "@/components/dashboard";
import { Alert, Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import { EntryForm, TransferForm } from "./forms";
import { decideEntryAction, reverseEntryAction, settleEntryAction, submitEntryAction } from "./actions";

export const metadata: Metadata = { title: "Finance ledger" };

type Row = LedgerRow & { description: string; category: string; counterparty: string | null; created_by: string | null; transfer_group_id: string | null; due_on: string | null };
const METRICS: { key: LedgerMetric; label: string; basis: string }[] = [
  { key: "incomeBookedMinor", label: "Income booked", basis: "Accrual" }, { key: "incomeReceivedMinor", label: "Cash received", basis: "Cash" },
  { key: "expensesBookedMinor", label: "Expenses booked", basis: "Accrual" }, { key: "expensesPaidMinor", label: "Cash paid", basis: "Cash" },
  { key: "netOperatingMinor", label: "Net operating result", basis: "Accrual" }, { key: "netCashMovementMinor", label: "Net cash movement", basis: "Cash, all types" },
  { key: "receivablesMinor", label: "Receivables", basis: "Approved income not yet received" }, { key: "payablesMinor", label: "Payables", basis: "Approved expenses not yet paid" },
  { key: "financingInMinor", label: "Loans & capital in", basis: "Not income" }, { key: "depositsHeldMinor", label: "Deposits held", basis: "Liability, not income" },
  { key: "passThroughHeldMinor", label: "Client funds held", basis: "Pass-through, not revenue" }, { key: "taxPaidMinor", label: "Tax paid", basis: "Cash" },
];
const TONE: Record<string, "neutral" | "warn" | "ok" | "danger" | "brand"> = { draft: "neutral", pending_approval: "warn", approved: "brand", partially_settled: "brand", settled: "ok", void: "neutral", reversed: "danger" };

export default async function LedgerPage({ params, searchParams }: PageProps<"/c/[slug]/finance/ledger">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("finance.read")) notFound();
  const today = todayInBusinessTz();
  const key = parsePeriodKey(sp.period);
  const period = periodRange(key, today, ctx.company.fy_start_month);
  const fy = financialYear(today, ctx.company.fy_start_month);
  const [entries, entities, units, peers] = await Promise.all([
    ctx.supabase.from("ledger_entries").select("*").eq("organization_id", ctx.company.id).order("txn_date", { ascending: false }).limit(5000),
    ctx.supabase.from("legal_entities").select("id, name, is_default").eq("organization_id", ctx.company.id).order("is_default", { ascending: false }),
    ctx.supabase.from("rental_units").select("id, label").eq("organization_id", ctx.company.id),
    Promise.resolve(ctx.memberships.filter((m) => m.company.family_group_id === ctx.company.family_group_id && m.company.id !== ctx.company.id && ["owner", "finance"].includes(m.role))),
  ]);
  if (entries.error) throw new Error(entries.error.message);
  const rows = (entries.data ?? []) as Row[];
  const s = summarizeLedger(rows, period);
  const months = monthlyBreakdown(rows, fy);
  const show = METRICS.find((m) => m.key === sp.show);
  const drill = show ? rowsForMetric(rows, show.key, period) : null;
  const pending = rows.filter((r) => r.status === "pending_approval");
  const base = `/c/${slug}/finance/ledger`;
  const keep = key === "month" ? "" : `period=${key}&`;
  return (
    <>
      <PageHeader title="Finance ledger" description={`${ctx.company.name} · ${period.label}. Only approved entries count. Accrual and cash are shown separately.`} actions={<PeriodTabs current={key} basePath={base} />} />
      {s.unconvertedRows > 0 && <div className="mb-4"><Alert tone="warn">{s.unconvertedRows} foreign-currency entr{s.unconvertedRows === 1 ? "y has" : "ies have"} no booked FX rate and are left out of INR totals.</Alert></div>}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        {METRICS.map((m) => <Tile key={m.key} label={m.label} value={formatShort(s[m.key])} sub={m.basis} href={`${base}?${keep}show=${m.key}`} />)}
      </div>
      <p className="mt-2 text-xs text-muted">Profit on this page is not the bank balance. Click a figure to see the entries behind it.</p>

      {drill && show && (
        <Card className="mt-5" title={`${show.label} · ${period.label}: ${formatMoney(s[show.key])}`} actions={<Link className="text-sm underline" href={`${base}${key === "month" ? "" : `?period=${key}`}`}>Close</Link>}>
          <EntriesTable rows={drill} slug={slug} canApprove={false} canSettle={false} userId={ctx.userId} today={today} />
        </Card>
      )}

      {ctx.can("finance.approve") && pending.length > 0 && (
        <Card className="mt-5" title={`Waiting for your approval · ${pending.length}`}>
          <EntriesTable rows={pending} slug={slug} canApprove canSettle={false} userId={ctx.userId} today={today} />
        </Card>
      )}

      <h2 className="mt-8 mb-3 font-display text-2xl">{fy.label} by month</h2>
      <Table head={["Month", "Income booked", "Cash received", "Expenses booked", "Cash paid", "Net operating", "Net cash"]}>
        {months.map((m) => (
          <tr key={m.month}>
            <Td>{new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${m.month}-01T00:00:00Z`))}</Td>
            {(["incomeBookedMinor", "incomeReceivedMinor", "expensesBookedMinor", "expensesPaidMinor", "netOperatingMinor", "netCashMovementMinor"] as const).map((k) => <Td key={k} numeric>{formatMoney(m.summary[k], "INR", { compact: true })}</Td>)}
          </tr>
        ))}
      </Table>

      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <h2 className="mb-3 font-display text-2xl">Entries</h2>
          <EntriesTable rows={rows.slice(0, 200)} slug={slug} canApprove={ctx.can("finance.approve")} canSettle={ctx.can("finance.write")} userId={ctx.userId} today={today} />
          {rows.length > 200 && <p className="mt-2 text-xs text-muted">Showing the latest 200 of {rows.length}. Use a period figure to drill into older entries.</p>}
        </section>
        <div className="flex flex-col gap-5">
          {ctx.can("finance.write") && (
            <Card title="New entry">
              <EntryForm slug={slug} today={today} entities={(entities.data ?? []).map((e) => ({ id: e.id as string, label: e.name as string }))}
                units={(units.data ?? []).map((u) => ({ id: u.id as string, label: u.label as string }))} />
            </Card>
          )}
          {ctx.can("finance.write") && peers.length > 0 && (
            <Card title="Internal transfer">
              <p className="mb-3 text-sm text-muted">Moves money between group companies. Both legs are created together and never count as income or expense; group totals cancel them out.</p>
              <TransferForm slug={slug} today={today} companies={peers.map((m) => ({ id: m.company.id, label: m.company.name }))} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function EntriesTable({ rows, slug, canApprove, canSettle, userId, today }: { rows: Row[]; slug: string; canApprove: boolean; canSettle: boolean; userId: string; today: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted">No entries.</p>;
  return (
    <Table head={["Date", "Entry", "Type", "Amount", "Status", ""]}>
      {rows.map((r) => (
        <tr key={r.id}>
          <Td className="whitespace-nowrap">{formatDate(r.txn_date)}</Td>
          <Td><div className="font-medium">{r.description}</div><div className="text-xs text-muted">{[r.category, r.counterparty].filter(Boolean).join(" · ")}</div></Td>
          <Td className="text-xs">{LEDGER_TYPE_LABELS[r.entry_type]}</Td>
          <Td numeric>{formatMoney(r.amount_minor, r.currency)}{r.settled_minor > 0 && r.settled_minor < r.amount_minor && <div className="text-xs text-muted">{formatMoney(r.settled_minor, r.currency)} settled</div>}</Td>
          <Td><Badge tone={TONE[r.status]}>{r.status.replace("_", " ")}</Badge>{r.due_on && r.status === "approved" && r.due_on < today && <div className="text-xs text-danger">Overdue</div>}</Td>
          <Td>
            <div className="flex flex-col gap-1.5">
              {r.status === "draft" && canSettle && (
                <form action={submitEntryAction.bind(null, slug)}><input type="hidden" name="id" value={r.id} /><button className="text-xs underline">Submit</button></form>
              )}
              {r.status === "pending_approval" && canApprove && (r.created_by !== userId ? (
                <form action={decideEntryAction.bind(null, slug)} className="flex gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <button name="approve" value="true" className="rounded-md bg-co-side px-2 py-1 text-xs text-white">Approve</button>
                  <button name="approve" value="false" className="rounded-md border border-line px-2 py-1 text-xs">Send back</button>
                </form>
              ) : <span className="text-xs text-muted">Needs another approver</span>)}
              {(r.status === "approved" || r.status === "partially_settled") && canSettle && (
                <details><summary className="cursor-pointer text-xs underline">Record payment</summary>
                  <form action={settleEntryAction.bind(null, slug)} className="mt-1 flex flex-col gap-1">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="amount" defaultValue={((r.amount_minor - r.settled_minor) / 100).toFixed(2)} aria-label="Amount" className="rounded border border-line px-1 text-xs" />
                    <input type="date" name="on" defaultValue={today} aria-label="Date" className="rounded border border-line px-1 text-xs" />
                    <select name="method" aria-label="Method" className="rounded border border-line text-xs"><option>neft</option><option>upi</option><option>imps</option><option>rtgs</option><option>cheque</option><option>cash</option></select>
                    <input name="reference" required placeholder="UTR / reference" aria-label="Reference" className="rounded border border-line px-1 text-xs" />
                    <button className="rounded border border-line text-xs">Save</button>
                  </form>
                </details>
              )}
              {["approved", "partially_settled", "settled"].includes(r.status) && canApprove && (
                <details><summary className="cursor-pointer text-xs text-danger underline">Reverse</summary>
                  <form action={reverseEntryAction.bind(null, slug)} className="mt-1 flex flex-col gap-1">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="reason" required minLength={5} placeholder="Reason" aria-label="Reason" className="rounded border border-line px-1 text-xs" />
                    <button className="rounded border border-line text-xs">Reverse entry</button>
                  </form>
                </details>
              )}
            </div>
          </Td>
        </tr>
      ))}
    </Table>
  );
}
