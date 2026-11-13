import type { Metadata } from "next";
import { getGroupContext } from "@/lib/workspace";
import { companiesWith, nameMap } from "@/lib/group-data";
import { parsePeriodKey, periodRange } from "@/domain/periods";
import { todayInBusinessTz } from "@/domain/dates";
import { formatMoney, formatShort } from "@/domain/money";
import { rentalReport } from "@/domain/rental";
import { PeriodTabs, Tile } from "@/components/dashboard";
import { EmptyState, PageHeader, Table, Td } from "@/components/ui";

export const metadata: Metadata = { title: "Rental income" };

export default async function GroupRental({ searchParams }: PageProps<"/group/rental">) {
  const g = await getGroupContext();
  const today = todayInBusinessTz();
  const key = parsePeriodKey((await searchParams).period);
  const period = periodRange(key, today, g.group.fy_start_month);
  const cs = companiesWith(g, "rental.read");
  const ids = cs.map((c) => c.id);
  const none = { data: [] };
  const [units, leases, charges, receipts, deposits, expenses] = ids.length ? await Promise.all([
    g.supabase.from("rental_units").select("id, organization_id, label, legal_entity:legal_entities(name)").in("organization_id", ids),
    g.supabase.from("leases").select("id, unit_id").in("organization_id", ids),
    g.supabase.from("rent_charges").select("id, lease_id, due_on, amount_minor, received_minor, status").in("organization_id", ids).limit(10000),
    g.supabase.from("rent_receipts").select("charge_id, amount_minor, received_on").in("organization_id", ids).limit(20000),
    g.supabase.from("security_deposit_ledger").select("lease_id, kind, amount_minor").in("organization_id", ids),
    g.supabase.from("ledger_entries").select("rental_unit_id, amount_minor, settled_minor, settled_on, txn_date").in("organization_id", ids).not("rental_unit_id", "is", null).in("status", ["approved", "partially_settled", "settled"]),
  ]) : [none, none, none, none, none, none];
  const u = (units.data ?? []) as unknown as { id: string; organization_id: string; label: string; legal_entity: { name: string } | null }[];
  const unitOf = new Map(((leases.data ?? []) as { id: string; unit_id: string }[]).map((l) => [l.id, l.unit_id]));
  const r = rentalReport(u.map((x) => x.id), {
    charges: ((charges.data ?? []) as { id: string; lease_id: string; due_on: string; amount_minor: number; received_minor: number; status: string }[]).map((c) => ({ ...c, unit_id: unitOf.get(c.lease_id)! })),
    receipts: (receipts.data ?? []) as { charge_id: string; amount_minor: number; received_on: string }[],
    deposits: ((deposits.data ?? []) as { lease_id: string; kind: "received"; amount_minor: number }[]).map((d) => ({ ...d, unit_id: unitOf.get(d.lease_id)! })),
    expenses: ((expenses.data ?? []) as { rental_unit_id: string; amount_minor: number; settled_minor: number; settled_on: string | null; txn_date: string }[]).map((e) => ({ ...e, unit_id: e.rental_unit_id })),
  }, period, today);
  const names = nameMap(cs);
  return (
    <>
      <PageHeader title="Rental income" description={`${period.label}. Each unit is counted once, under its owning entity. Deposits are liabilities.`} actions={<PeriodTabs current={key} basePath="/group/rental" />} />
      {u.length === 0 ? <EmptyState title="No rental units you can see">Add Salon and Tower from the Rental page of the company (or family holdings workspace) that owns them.</EmptyState> : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            <Tile label="Rent billed" value={formatShort(r.total.billedMinor)} sub="Accrual" /><Tile label="Rent received" value={formatShort(r.total.receivedMinor)} sub="Cash" />
            <Tile label="Overdue" value={formatShort(r.total.overdueMinor)} /><Tile label="Deposits held" value={formatShort(r.total.depositsHeldMinor)} sub="Liability" />
            <Tile label="Rental expenses" value={formatShort(r.total.expensesMinor)} /><Tile label="Net rental cash flow" value={formatShort(r.total.netCashMinor)} />
          </div>
          <Table head={["Unit", "Company", "Legal owner", "Billed", "Received", "Arrears", "Deposit", "Expenses", "Net cash"]}>
            {r.units.map((x) => { const unit = u.find((y) => y.id === x.unitId)!; return (
              <tr key={x.unitId}><Td className="font-medium">{unit.label}</Td><Td>{names.get(unit.organization_id)}</Td><Td>{unit.legal_entity?.name}</Td>
                {(["billedMinor", "receivedMinor", "arrearsMinor", "depositsHeldMinor", "expensesMinor", "netCashMinor"] as const).map((k) => <Td key={k} numeric>{formatMoney(x[k], "INR", { compact: true })}</Td>)}</tr>
            ); })}
          </Table>
        </>
      )}
    </>
  );
}
