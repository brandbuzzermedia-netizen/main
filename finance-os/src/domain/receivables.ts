import type { InvoiceBalance } from "@/lib/db-types";
import { addDays } from "./dates";

type Row = Pick<InvoiceBalance, "status" | "outstanding_minor" | "ageing_bucket" | "effective_due_date" | "invoice_date" | "total_minor">;

export type ReceivablesSummary = {
  outstandingMinor: number;
  overdueMinor: number;
  disputedMinor: number;
  dueWithin: Record<7 | 14 | 30, number>;
  invoicedThisMonthMinor: number;
  invoicedThisMonthCount: number;
};

/**
 * Receivables figures for the dashboard. "Due within N days" is money that is invoiced and
 * not yet due. It is expected, unconfirmed, and never counted as cash. Disputed and cancelled
 * invoices are excluded from expected collections.
 */
export function summarizeReceivables(rows: Row[], today: string): ReceivablesSummary {
  const monthPrefix = today.slice(0, 7);
  const s: ReceivablesSummary = {
    outstandingMinor: 0,
    overdueMinor: 0,
    disputedMinor: 0,
    dueWithin: { 7: 0, 14: 0, 30: 0 },
    invoicedThisMonthMinor: 0,
    invoicedThisMonthCount: 0,
  };
  for (const r of rows) {
    if (r.status === "cancelled") continue;
    if (r.invoice_date.startsWith(monthPrefix)) {
      s.invoicedThisMonthMinor += r.total_minor;
      s.invoicedThisMonthCount += 1;
    }
    if (r.outstanding_minor <= 0) continue;
    s.outstandingMinor += r.outstanding_minor;
    if (r.status === "disputed") {
      s.disputedMinor += r.outstanding_minor;
      continue;
    }
    if (r.ageing_bucket.startsWith("overdue")) s.overdueMinor += r.outstanding_minor;
    for (const n of [7, 14, 30] as const) {
      if (r.effective_due_date >= today && r.effective_due_date <= addDays(today, n)) s.dueWithin[n] += r.outstanding_minor;
    }
  }
  return s;
}
