import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { parsePeriodKey, periodRange } from "@/domain/periods";
import { formatDate, todayInBusinessTz } from "@/domain/dates";
import { formatMoney, formatShort } from "@/domain/money";
import { rentalReport } from "@/domain/rental";
import { PeriodTabs, Tile } from "@/components/dashboard";
import { Badge, Button, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { addSalonTowerAction, depositAction, generateChargesAction, receiptAction } from "./actions";

export const metadata: Metadata = { title: "Rental income" };

export default async function RentalPage({ params, searchParams }: PageProps<"/c/[slug]/rental">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("rental.read")) notFound();
  const today = todayInBusinessTz();
  const key = parsePeriodKey((await searchParams).period);
  const period = periodRange(key, today, ctx.company.fy_start_month);
  const org = ctx.company.id;
  const [units, leases, charges, receipts, deposits, expenses] = await Promise.all([
    ctx.supabase.from("rental_units").select("id, label, use_type, legal_entity:legal_entities(name)").eq("organization_id", org).order("label"),
    ctx.supabase.from("leases").select("id, unit_id, status, rent_minor, due_day, frequency, end_date, tenant:tenants(name)").eq("organization_id", org),
    ctx.supabase.from("rent_charges").select("id, lease_id, due_on, amount_minor, received_minor, status, period_start").eq("organization_id", org).order("due_on", { ascending: false }).limit(2000),
    ctx.supabase.from("rent_receipts").select("charge_id, amount_minor, received_on").eq("organization_id", org).limit(5000),
    ctx.supabase.from("security_deposit_ledger").select("lease_id, kind, amount_minor").eq("organization_id", org),
    ctx.supabase.from("ledger_entries").select("rental_unit_id, amount_minor, settled_minor, settled_on, txn_date, status").eq("organization_id", org).not("rental_unit_id", "is", null).in("status", ["approved", "partially_settled", "settled"]),
  ]);
  const u = (units.data ?? []) as unknown as { id: string; label: string; use_type: string | null; legal_entity: { name: string } | null }[];
  const ls = (leases.data ?? []) as unknown as { id: string; unit_id: string; status: string; rent_minor: number; due_day: number; frequency: string; end_date: string | null; tenant: { name: string } | null }[];
  const unitOfLease = new Map(ls.map((l) => [l.id, l.unit_id]));
  const ch = (charges.data ?? []).map((c) => ({ ...c, unit_id: unitOfLease.get(c.lease_id as string)! })) as { id: string; lease_id: string; unit_id: string; due_on: string; amount_minor: number; received_minor: number; status: string; period_start: string }[];
  const report = rentalReport(u.map((x) => x.id), {
    charges: ch, receipts: (receipts.data ?? []) as { charge_id: string; amount_minor: number; received_on: string }[],
    deposits: (deposits.data ?? []).map((d) => ({ unit_id: unitOfLease.get(d.lease_id as string)!, kind: d.kind as "received", amount_minor: d.amount_minor as number })),
    expenses: (expenses.data ?? []).map((e) => ({ unit_id: e.rental_unit_id as string, amount_minor: e.amount_minor as number, settled_minor: e.settled_minor as number, settled_on: e.settled_on as string | null, txn_date: e.txn_date as string })),
  }, period, today);
  const label = new Map(u.map((x) => [x.id, x.label]));
  const open = ch.filter((c) => c.status === "open" || c.status === "partially_paid").sort((a, b) => a.due_on.localeCompare(b.due_on));
  const canWrite = ctx.can("rental.write");
  const base = `/c/${slug}/rental`;
  const t = report.total;
  const ending = ls.filter((l) => l.status === "active" && l.end_date && l.end_date <= periodRange("quarter", today).end);

  return (
    <>
      <PageHeader title="Rental income" description={`${period.label}. Rent billed is accrual; rent received is cash; deposits are a liability and never income.`}
        actions={<><PeriodTabs current={key} basePath={base} />{canWrite && <form action={generateChargesAction.bind(null, slug)}><Button variant="company">Generate due rent</Button></form>}</>} />
      {u.length === 0 ? (
        <EmptyState title="No rental units yet" action={canWrite && <form action={addSalonTowerAction.bind(null, slug)}><Button variant="company">Add Salon and Tower</Button></form>}>
          Adds the two units named in the brief as labels only. You then set the legal owner, tenant, rent, due day and deposit for each. More units can be added any time.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            <Tile label="Rent billed" value={formatShort(t.billedMinor)} sub="Accrual" />
            <Tile label="Rent received" value={formatShort(t.receivedMinor)} sub="Cash" />
            <Tile label="Overdue" value={formatShort(t.overdueMinor)} sub="Past due date, unpaid" />
            <Tile label="Arrears" value={formatShort(t.arrearsMinor)} sub="All unpaid rent due so far" />
            <Tile label="Security deposits held" value={formatShort(t.depositsHeldMinor)} sub="Liability, not income" />
            <Tile label="Rental expenses" value={formatShort(t.expensesMinor)} sub="Approved ledger expenses" />
            <Tile label="Net rental cash flow" value={formatShort(t.netCashMinor)} sub="Received less expenses paid" />
            <Tile label="Occupancy" value={`${ls.filter((l) => l.status === "active").length} / ${u.length}`} sub="Units with an active lease" />
          </div>
          <h2 className="mt-8 mb-3 font-display text-2xl">By unit</h2>
          <Table head={["Unit", "Legal owner", "Tenant", "Billed", "Received", "Arrears", "Deposit held", "Expenses", "Net cash"]}>
            {report.units.map((r) => {
              const unit = u.find((x) => x.id === r.unitId)!;
              const lease = ls.find((l) => l.unit_id === r.unitId && l.status === "active");
              return (
                <tr key={r.unitId}>
                  <Td className="font-medium">{unit.label}</Td><Td>{unit.legal_entity?.name ?? "—"}</Td><Td>{lease?.tenant?.name ?? <Badge tone="warn">Vacant / not set</Badge>}</Td>
                  {(["billedMinor", "receivedMinor", "arrearsMinor", "depositsHeldMinor", "expensesMinor", "netCashMinor"] as const).map((k) => <Td key={k} numeric>{formatMoney(r[k], "INR", { compact: true })}</Td>)}
                </tr>
              );
            })}
          </Table>
          {ending.length > 0 && <p className="mt-3 text-sm text-warn">{ending.length} lease(s) end this quarter. Plan renewal or notice.</p>}
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <Card title={`Unpaid rent · ${open.length}`}>
              {open.length === 0 ? <p className="text-sm text-muted">Nothing unpaid. Generate due rent to create this month&apos;s charges.</p> : (
                <ul>
                  {open.slice(0, 30).map((c) => (
                    <li key={c.id} className="border-t border-line-2 py-2.5 text-sm">
                      <div className="flex justify-between gap-2"><span>{label.get(c.unit_id)} · due {formatDate(c.due_on)}</span>
                        <b className={c.due_on < today ? "text-danger" : ""}>{formatMoney(c.amount_minor - c.received_minor)}</b></div>
                      {canWrite && (
                        <details><summary className="cursor-pointer text-xs underline">Record receipt</summary>
                          <form action={receiptAction.bind(null, slug)} className="mt-1 flex flex-wrap gap-1">
                            <input type="hidden" name="charge_id" value={c.id} />
                            <input name="amount" defaultValue={((c.amount_minor - c.received_minor) / 100).toFixed(2)} aria-label="Amount" className="w-24 rounded border border-line px-1 text-xs" />
                            <input type="date" name="on" defaultValue={today} aria-label="Date" className="rounded border border-line px-1 text-xs" />
                            <select name="method" aria-label="Method" className="rounded border border-line text-xs"><option>upi</option><option>neft</option><option>imps</option><option>cheque</option><option>cash</option></select>
                            <input name="reference" required placeholder="Reference" aria-label="Reference" className="w-28 rounded border border-line px-1 text-xs" />
                            <button className="rounded border border-line px-2 text-xs">Save</button>
                          </form>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {canWrite && ls.length > 0 && (
              <Card title="Security deposit movement">
                <form action={depositAction.bind(null, slug)} className="grid gap-2 sm:grid-cols-2">
                  <select name="lease_id" aria-label="Lease" className="rounded-lg border border-line bg-surface px-2 py-2 text-sm">{ls.map((l) => <option key={l.id} value={l.id}>{label.get(l.unit_id)} · {l.tenant?.name}</option>)}</select>
                  <select name="kind" aria-label="Movement" className="rounded-lg border border-line bg-surface px-2 py-2 text-sm"><option value="received">Received</option><option value="refunded">Refunded</option><option value="appropriated">Appropriated (lawfully)</option></select>
                  <input name="amount" required placeholder="Amount" aria-label="Amount" className="rounded-lg border border-line px-2 py-2 text-sm" />
                  <input type="date" name="on" defaultValue={today} aria-label="Date" className="rounded-lg border border-line px-2 py-2 text-sm" />
                  <input name="reference" placeholder="Reference" aria-label="Reference" className="rounded-lg border border-line px-2 py-2 text-sm sm:col-span-2" />
                  <div><Button variant="secondary">Record</Button></div>
                </form>
              </Card>
            )}
          </div>
          <p className="mt-6 text-sm text-muted">Configure: <Link className="underline" href={`/c/${slug}/r/rental_units`}>units</Link> · <Link className="underline" href={`/c/${slug}/r/tenants`}>tenants</Link> · <Link className="underline" href={`/c/${slug}/r/leases`}>leases</Link> · rental expenses are <Link className="underline" href={`/c/${slug}/ledger`}>ledger</Link> expenses tagged with a unit.</p>
        </>
      )}
    </>
  );
}
