/**
 * Rental reporting. Billed rent is accrual (charges by due date), received rent is cash
 * (receipts by date), arrears are what is still unpaid on charges already due, deposits are a
 * liability (never income), and unit expenses come from approved ledger rows tagged with the unit.
 */
export type RentCharge = { id: string; unit_id: string; due_on: string; amount_minor: number; received_minor: number; status: string };
export type RentReceipt = { charge_id: string; amount_minor: number; received_on: string };
export type DepositMove = { unit_id: string; kind: "received" | "refunded" | "appropriated"; amount_minor: number };
export type UnitExpense = { unit_id: string; amount_minor: number; settled_minor: number; settled_on: string | null; txn_date: string };

export type UnitReport = {
  unitId: string; billedMinor: number; receivedMinor: number; overdueMinor: number; arrearsMinor: number;
  depositsHeldMinor: number; expensesMinor: number; expensesPaidMinor: number; netCashMinor: number;
};

const inRange = (d: string | null, p: { start: string; end: string }) => Boolean(d) && d! >= p.start && d! < p.end;

export function rentalReport(
  unitIds: string[],
  data: { charges: RentCharge[]; receipts: RentReceipt[]; deposits: DepositMove[]; expenses: UnitExpense[] },
  period: { start: string; end: string },
  today: string,
): { units: UnitReport[]; total: Omit<UnitReport, "unitId"> } {
  const unitOfCharge = new Map(data.charges.map((c) => [c.id, c.unit_id]));
  const units = unitIds.map((unitId): UnitReport => {
    const charges = data.charges.filter((c) => c.unit_id === unitId && c.status !== "waived");
    const receipts = data.receipts.filter((r) => unitOfCharge.get(r.charge_id) === unitId);
    const exp = data.expenses.filter((e) => e.unit_id === unitId);
    const billed = charges.filter((c) => inRange(c.due_on, period)).reduce((s, c) => s + c.amount_minor, 0);
    const received = receipts.filter((r) => inRange(r.received_on, period)).reduce((s, r) => s + r.amount_minor, 0);
    const arrears = charges.filter((c) => c.due_on <= today).reduce((s, c) => s + (c.amount_minor - c.received_minor), 0);
    const overdue = charges.filter((c) => c.due_on < today).reduce((s, c) => s + (c.amount_minor - c.received_minor), 0);
    const deposits = data.deposits.filter((d) => d.unit_id === unitId).reduce((s, d) => s + (d.kind === "received" ? 1 : -1) * d.amount_minor, 0);
    const expenses = exp.filter((e) => inRange(e.txn_date, period)).reduce((s, e) => s + e.amount_minor, 0);
    const expensesPaid = exp.filter((e) => inRange(e.settled_on, period)).reduce((s, e) => s + e.settled_minor, 0);
    return { unitId, billedMinor: billed, receivedMinor: received, overdueMinor: overdue, arrearsMinor: arrears,
      depositsHeldMinor: deposits, expensesMinor: expenses, expensesPaidMinor: expensesPaid, netCashMinor: received - expensesPaid };
  });
  const total = units.reduce((t, u) => {
    for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += u[k];
    return t;
  }, { billedMinor: 0, receivedMinor: 0, overdueMinor: 0, arrearsMinor: 0, depositsHeldMinor: 0, expensesMinor: 0, expensesPaidMinor: 0, netCashMinor: 0 });
  return { units, total };
}
