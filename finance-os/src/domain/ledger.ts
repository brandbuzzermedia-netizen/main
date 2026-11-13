/**
 * Ledger reporting rules. Only approved (or settled) entries count; drafts, pending, void and
 * reversed rows never do. Accrual figures use the entry's accounting/txn date; cash figures use
 * the settled amount and settlement date.
 *
 *   Operating income  = income + commission_income + other_income − refund_out − credit_note
 *   Operating expense = expense + write_off
 *   Never operating   = transfers, loans, capital, owner withdrawals, refundable deposits,
 *                       client pass-through funds, tax payments (reported separately)
 */

export type LedgerType =
  | "income" | "commission_income" | "other_income" | "expense" | "refund_out" | "credit_note" | "write_off"
  | "transfer_in" | "transfer_out" | "loan_in" | "loan_repayment" | "capital_in" | "owner_withdrawal"
  | "deposit_received" | "deposit_refunded" | "pass_through_in" | "pass_through_out" | "tax_payment";

export type LedgerStatus = "draft" | "pending_approval" | "approved" | "partially_settled" | "settled" | "void" | "reversed";

export type LedgerRow = {
  id: string;
  organization_id: string;
  entry_type: LedgerType;
  status: LedgerStatus;
  txn_date: string;
  accounting_date: string | null;
  amount_minor: number;
  base_amount_minor: number | null;
  settled_minor: number;
  settled_on: string | null;
  currency: string;
  rental_unit_id?: string | null;
};

export const LEDGER_TYPE_LABELS: Record<LedgerType, string> = {
  income: "Income", commission_income: "Commission income", other_income: "Other income", expense: "Expense",
  refund_out: "Refund to customer", credit_note: "Credit note", write_off: "Write-off",
  transfer_in: "Internal transfer in", transfer_out: "Internal transfer out", loan_in: "Loan received",
  loan_repayment: "Loan repayment", capital_in: "Owner capital", owner_withdrawal: "Owner withdrawal",
  deposit_received: "Refundable deposit received", deposit_refunded: "Deposit refunded",
  pass_through_in: "Client funds received (pass-through)", pass_through_out: "Client funds spent (pass-through)",
  tax_payment: "Tax payment",
};

const INCOME_PLUS: LedgerType[] = ["income", "commission_income", "other_income"];
const INCOME_MINUS: LedgerType[] = ["refund_out", "credit_note"];
const EXPENSE: LedgerType[] = ["expense", "write_off"];
/** Direction of cash for each type: +1 money in, −1 money out, 0 no cash (credit note, write-off). */
const CASH_SIGN: Record<LedgerType, 1 | -1 | 0> = {
  income: 1, commission_income: 1, other_income: 1, expense: -1, refund_out: -1, credit_note: 0, write_off: 0,
  transfer_in: 1, transfer_out: -1, loan_in: 1, loan_repayment: -1, capital_in: 1, owner_withdrawal: -1,
  deposit_received: 1, deposit_refunded: -1, pass_through_in: 1, pass_through_out: -1, tax_payment: -1,
};

export const COUNTS: LedgerStatus[] = ["approved", "partially_settled", "settled"];
export const counts = (r: LedgerRow) => COUNTS.includes(r.status);
const inRange = (d: string | null, p: { start: string; end: string }) => Boolean(d) && d! >= p.start && d! < p.end;
/** Base-currency amount of an approved row. Foreign rows without a booked rate are excluded (and counted). */
const base = (r: LedgerRow) => (r.currency === "INR" ? r.amount_minor : r.base_amount_minor);
const settledBase = (r: LedgerRow) => {
  const b = base(r);
  if (b === null) return null;
  return r.currency === "INR" ? r.settled_minor : Math.round((r.settled_minor * b) / r.amount_minor);
};

export type LedgerSummary = {
  incomeBookedMinor: number;
  incomeReceivedMinor: number;
  expensesBookedMinor: number;
  expensesPaidMinor: number;
  netOperatingMinor: number;
  netCashMovementMinor: number;
  receivablesMinor: number;
  payablesMinor: number;
  financingInMinor: number;
  financingOutMinor: number;
  depositsHeldMinor: number;
  passThroughHeldMinor: number;
  taxPaidMinor: number;
  /** Rows left out because they are in another currency without a booked rate. */
  unconvertedRows: number;
  /** Ids of every row that contributed, for drill-down. */
  rowIds: string[];
};

export function summarizeLedger(rows: LedgerRow[], period: { start: string; end: string }): LedgerSummary {
  const s: LedgerSummary = {
    incomeBookedMinor: 0, incomeReceivedMinor: 0, expensesBookedMinor: 0, expensesPaidMinor: 0, netOperatingMinor: 0,
    netCashMovementMinor: 0, receivablesMinor: 0, payablesMinor: 0, financingInMinor: 0, financingOutMinor: 0,
    depositsHeldMinor: 0, passThroughHeldMinor: 0, taxPaidMinor: 0, unconvertedRows: 0, rowIds: [],
  };
  for (const r of rows) {
    if (!counts(r)) continue;
    const amt = base(r);
    const paid = settledBase(r);
    if (amt === null || paid === null) { s.unconvertedRows += 1; continue; }
    const booked = inRange(r.accounting_date ?? r.txn_date, period);
    const cashInPeriod = inRange(r.settled_on, period) ? paid : 0;
    const t = r.entry_type;
    let used = false;
    if (INCOME_PLUS.includes(t) || INCOME_MINUS.includes(t)) {
      const sign = INCOME_PLUS.includes(t) ? 1 : -1;
      if (booked) { s.incomeBookedMinor += sign * amt; used = true; }
      if (t !== "credit_note" && cashInPeriod) { s.incomeReceivedMinor += sign * cashInPeriod; used = true; }
      if (INCOME_PLUS.includes(t)) s.receivablesMinor += amt - paid;
    } else if (EXPENSE.includes(t)) {
      if (booked) { s.expensesBookedMinor += amt; used = true; }
      if (t === "expense" && cashInPeriod) { s.expensesPaidMinor += cashInPeriod; used = true; }
      if (t === "expense") s.payablesMinor += amt - paid;
    } else if (t === "loan_in" || t === "capital_in") {
      if (cashInPeriod) { s.financingInMinor += cashInPeriod; used = true; }
    } else if (t === "loan_repayment" || t === "owner_withdrawal") {
      if (cashInPeriod) { s.financingOutMinor += cashInPeriod; used = true; }
    } else if (t === "deposit_received" || t === "deposit_refunded") {
      s.depositsHeldMinor += (t === "deposit_received" ? 1 : -1) * paid;
    } else if (t === "pass_through_in" || t === "pass_through_out") {
      s.passThroughHeldMinor += (t === "pass_through_in" ? 1 : -1) * paid;
    } else if (t === "tax_payment") {
      if (cashInPeriod) { s.taxPaidMinor += cashInPeriod; used = true; }
    }
    if (cashInPeriod && CASH_SIGN[t] !== 0) { s.netCashMovementMinor += CASH_SIGN[t] * cashInPeriod; used = true; }
    if (used) s.rowIds.push(r.id);
  }
  s.netOperatingMinor = s.incomeBookedMinor - s.expensesBookedMinor;
  return s;
}

/**
 * Group consolidation: internal transfers between group companies cancel out. They never touch
 * income or expense above, but they would inflate "cash moved" if each leg were read alone, so
 * the group view drops both legs of any transfer whose two legs are both included.
 */
export function dropMatchedTransfers<T extends LedgerRow & { transfer_group_id?: string | null }>(rows: T[]): T[] {
  const legs = new Map<string, number>();
  for (const r of rows) if (r.transfer_group_id && counts(r)) legs.set(r.transfer_group_id, (legs.get(r.transfer_group_id) ?? 0) + 1);
  return rows.filter((r) => !(r.transfer_group_id && legs.get(r.transfer_group_id) === 2));
}

/** Month buckets across a period, e.g. FY April..March, each with its own summary. */
export function monthlyBreakdown(rows: LedgerRow[], period: { start: string; end: string }) {
  const out: { month: string; summary: LedgerSummary }[] = [];
  let [y, m] = period.start.split("-").map(Number);
  for (;;) {
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    if (start >= period.end) break;
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    const end = `${ny}-${String(nm).padStart(2, "0")}-01`;
    out.push({ month: start.slice(0, 7), summary: summarizeLedger(rows, { start, end }) });
    y = ny; m = nm;
  }
  return out;
}

export type LedgerMetric = Exclude<keyof LedgerSummary, "unconvertedRows" | "rowIds">;

/** Drill-down: the rows that make up one total. Uses the same rules, one row at a time. */
export function rowsForMetric<T extends LedgerRow>(rows: T[], metric: LedgerMetric, period: { start: string; end: string }): T[] {
  return rows.filter((r) => summarizeLedger([r], period)[metric] !== 0);
}
