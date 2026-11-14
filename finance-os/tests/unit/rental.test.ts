import { describe, expect, it } from "vitest";
import { rentalReport } from "@/domain/rental";

const nov = { start: "2026-11-01", end: "2026-12-01" };
describe("rentalReport", () => {
  const r = rentalReport(["salon", "tower"], {
    charges: [
      { id: "c1", unit_id: "salon", due_on: "2026-11-05", amount_minor: 50_000_00, received_minor: 20_000_00, status: "partially_paid" },
      { id: "c2", unit_id: "salon", due_on: "2026-10-05", amount_minor: 50_000_00, received_minor: 50_000_00, status: "paid" },
      { id: "c3", unit_id: "tower", due_on: "2026-11-05", amount_minor: 80_000_00, received_minor: 0, status: "open" },
    ],
    receipts: [{ charge_id: "c1", amount_minor: 20_000_00, received_on: "2026-11-06" }, { charge_id: "c2", amount_minor: 50_000_00, received_on: "2026-11-02" }],
    deposits: [{ unit_id: "salon", kind: "received", amount_minor: 1_50_000_00 }, { unit_id: "salon", kind: "refunded", amount_minor: 50_000_00 }],
    expenses: [{ unit_id: "tower", amount_minor: 25_000_00, settled_minor: 25_000_00, settled_on: "2026-11-10", txn_date: "2026-11-09" }],
  }, nov, "2026-11-13");

  it("keeps rent due, received and arrears distinct", () => {
    const salon = r.units[0];
    expect(salon.billedMinor).toBe(50_000_00);
    expect(salon.receivedMinor).toBe(70_000_00); // October's rent paid in November is November cash
    expect(salon.arrearsMinor).toBe(30_000_00);
  });

  it("tracks the refundable deposit separately, never as income", () => {
    expect(r.units[0].depositsHeldMinor).toBe(1_00_000_00);
    expect(r.units[0].netCashMinor).toBe(70_000_00);
  });

  it("rolls unit expenses into the unit and totals without double counting", () => {
    expect(r.units[1].expensesMinor).toBe(25_000_00);
    expect(r.units[1].netCashMinor).toBe(-25_000_00);
    expect(r.total.billedMinor).toBe(1_30_000_00);
    expect(r.total.receivedMinor).toBe(70_000_00);
    expect(r.total.overdueMinor).toBe(1_10_000_00);
  });
});
