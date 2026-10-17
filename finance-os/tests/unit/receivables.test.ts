import { describe, expect, it } from "vitest";
import { summarizeReceivables } from "@/domain/receivables";

const row = (o: Partial<Parameters<typeof summarizeReceivables>[0][number]>) => ({
  status: "issued" as const, outstanding_minor: 1000, ageing_bucket: "not_due" as const,
  effective_due_date: "2026-10-20", invoice_date: "2026-10-01", total_minor: 1000, ...o,
});

describe("summarizeReceivables", () => {
  it("separates overdue, disputed, cancelled and upcoming money", () => {
    const s = summarizeReceivables([
      row({}),                                                                // due in 3 days
      row({ effective_due_date: "2026-10-30" }),                              // due in 13 days
      row({ effective_due_date: "2026-11-10", invoice_date: "2026-09-30" }),  // due in 24 days, last month
      row({ ageing_bucket: "overdue_1_15", effective_due_date: "2026-10-10", outstanding_minor: 500 }),
      row({ status: "disputed", ageing_bucket: "disputed", outstanding_minor: 700 }),
      row({ status: "cancelled", ageing_bucket: "cancelled", outstanding_minor: 9999, total_minor: 9999 }),
      row({ outstanding_minor: 0, ageing_bucket: "settled" }),
    ], "2026-10-17");
    expect(s.outstandingMinor).toBe(1000 + 1000 + 1000 + 500 + 700);
    expect(s.overdueMinor).toBe(500);
    expect(s.disputedMinor).toBe(700);
    expect(s.dueWithin).toEqual({ 7: 1000, 14: 2000, 30: 3000 });
    expect(s.invoicedThisMonthCount).toBe(5);
    expect(s.invoicedThisMonthMinor).toBe(5000);
  });
});
