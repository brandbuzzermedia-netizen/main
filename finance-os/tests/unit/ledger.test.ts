import { describe, expect, it } from "vitest";
import { dropMatchedTransfers, monthlyBreakdown, summarizeLedger, type LedgerRow } from "@/domain/ledger";

let n = 0;
const row = (o: Partial<LedgerRow>): LedgerRow => ({
  id: `r${++n}`, organization_id: "o", entry_type: "income", status: "approved", txn_date: "2026-11-05", accounting_date: null,
  amount_minor: 0, base_amount_minor: null, settled_minor: 0, settled_on: null, currency: "INR", ...o,
});
const nov = { start: "2026-11-01", end: "2026-12-01" };

describe("summarizeLedger", () => {
  it("separates booked income from cash received when unpaid", () => {
    const s = summarizeLedger([row({ amount_minor: 1_00_000_00 }), row({ amount_minor: 50_000_00, settled_minor: 20_000_00, settled_on: "2026-11-10", status: "partially_settled" })], nov);
    expect(s.incomeBookedMinor).toBe(1_50_000_00);
    expect(s.incomeReceivedMinor).toBe(20_000_00);
    expect(s.receivablesMinor).toBe(1_30_000_00);
  });

  it("separates booked expenses from cash paid", () => {
    const s = summarizeLedger([row({ entry_type: "expense", amount_minor: 30_000_00 }), row({ entry_type: "expense", amount_minor: 10_000_00, settled_minor: 10_000_00, settled_on: "2026-11-02", status: "settled" })], nov);
    expect(s.expensesBookedMinor).toBe(40_000_00);
    expect(s.expensesPaidMinor).toBe(10_000_00);
    expect(s.payablesMinor).toBe(30_000_00);
    expect(s.netOperatingMinor).toBe(-40_000_00);
    expect(s.netCashMovementMinor).toBe(-10_000_00);
  });

  it("never treats loans, capital, deposits, pass-through or transfers as operating income", () => {
    const paid = (entry_type: LedgerRow["entry_type"], amt: number) => row({ entry_type, amount_minor: amt, settled_minor: amt, settled_on: "2026-11-03", status: "settled" });
    const s = summarizeLedger([
      paid("loan_in", 5_00_000_00), paid("capital_in", 2_00_000_00), paid("deposit_received", 1_00_000_00),
      paid("pass_through_in", 2_40_000_00), paid("transfer_in", 3_00_000_00),
    ], nov);
    expect(s.incomeBookedMinor).toBe(0);
    expect(s.incomeReceivedMinor).toBe(0);
    expect(s.netOperatingMinor).toBe(0);
    expect(s.financingInMinor).toBe(7_00_000_00);
    expect(s.depositsHeldMinor).toBe(1_00_000_00);
    expect(s.passThroughHeldMinor).toBe(2_40_000_00);
    expect(s.netCashMovementMinor).toBe(13_40_000_00); // cash did move; it is just not income
  });

  it("subtracts refunds and credit notes from income", () => {
    const s = summarizeLedger([row({ amount_minor: 1_000_00 }), row({ entry_type: "credit_note", amount_minor: 200_00 }), row({ entry_type: "refund_out", amount_minor: 100_00, settled_minor: 100_00, settled_on: "2026-11-09", status: "settled" })], nov);
    expect(s.incomeBookedMinor).toBe(700_00);
    expect(s.incomeReceivedMinor).toBe(-100_00);
  });

  it("ignores drafts, pending, void and reversed rows", () => {
    const s = summarizeLedger((["draft", "pending_approval", "void", "reversed"] as const).map((status) => row({ status, amount_minor: 999_00 })), nov);
    expect(s.incomeBookedMinor).toBe(0);
    expect(s.rowIds).toEqual([]);
  });

  it("uses the booked base amount for foreign currency, and skips unbooked rates", () => {
    const s = summarizeLedger([
      row({ currency: "USD", amount_minor: 1_000_00, base_amount_minor: 83_250_00, settled_minor: 500_00, settled_on: "2026-11-20", status: "partially_settled" }),
      row({ currency: "USD", amount_minor: 1_000_00, base_amount_minor: null }),
    ], nov);
    expect(s.incomeBookedMinor).toBe(83_250_00);
    expect(s.incomeReceivedMinor).toBe(41_625_00);
    expect(s.unconvertedRows).toBe(1);
  });

  it("reconciles: every counted row is listed for drill-down", () => {
    const rows = [row({ amount_minor: 10 }), row({ amount_minor: 20, txn_date: "2026-10-01" })];
    expect(summarizeLedger(rows, nov).rowIds).toEqual([rows[0].id]);
  });
});

describe("group consolidation", () => {
  it("drops both legs of an internal transfer so cash movement is not inflated", () => {
    const legs = [
      { ...row({ entry_type: "transfer_out", amount_minor: 1_00_000_00, settled_minor: 1_00_000_00, settled_on: "2026-11-04", status: "settled" }), transfer_group_id: "g1" },
      { ...row({ entry_type: "transfer_in", amount_minor: 1_00_000_00, settled_minor: 1_00_000_00, settled_on: "2026-11-04", status: "settled", organization_id: "o2" }), transfer_group_id: "g1" },
      { ...row({ amount_minor: 5_000_00 }), transfer_group_id: null },
    ];
    const kept = dropMatchedTransfers(legs);
    expect(kept).toHaveLength(1);
    const s = summarizeLedger(kept, nov);
    expect(s.incomeBookedMinor).toBe(5_000_00);
    expect(s.netCashMovementMinor).toBe(0);
  });
});

describe("monthlyBreakdown", () => {
  it("covers every month of the Indian FY and sums back to the FY total", () => {
    const rows = [row({ amount_minor: 100, txn_date: "2026-04-01" }), row({ amount_minor: 200, txn_date: "2027-03-31" }), row({ amount_minor: 400, txn_date: "2027-04-01" })];
    const fy = { start: "2026-04-01", end: "2027-04-01" };
    const months = monthlyBreakdown(rows, fy);
    expect(months.map((m) => m.month)).toHaveLength(12);
    expect(months[0].month).toBe("2026-04");
    expect(months[11].month).toBe("2027-03");
    expect(months.reduce((t, m) => t + m.summary.incomeBookedMinor, 0)).toBe(summarizeLedger(rows, fy).incomeBookedMinor);
    expect(summarizeLedger(rows, fy).incomeBookedMinor).toBe(300);
  });
});
