export type OpenInvoice = {
  id: string;
  invoice_number: string;
  effective_due_date: string;
  outstanding_minor: number;
  status: "issued" | "cancelled" | "disputed";
};

export type Allocation = { invoice_id: string; amount_minor: number };

/**
 * Suggest how to apply a receipt to a client's open invoices.
 *  1. If exactly one invoice's outstanding equals the amount, pay that invoice.
 *  2. Otherwise pay oldest effective due date first until the money runs out.
 * Disputed and cancelled invoices are never suggested. Any remainder stays unallocated
 * (an advance or a credit for the founder to decide on).
 */
export function suggestAllocations(amountMinor: number, invoices: OpenInvoice[]): { allocations: Allocation[]; unallocatedMinor: number } {
  const eligible = invoices
    .filter((i) => i.status === "issued" && i.outstanding_minor > 0)
    .sort((a, b) => a.effective_due_date.localeCompare(b.effective_due_date) || a.invoice_number.localeCompare(b.invoice_number));

  const exact = eligible.filter((i) => i.outstanding_minor === amountMinor);
  if (exact.length === 1) return { allocations: [{ invoice_id: exact[0].id, amount_minor: amountMinor }], unallocatedMinor: 0 };

  let left = amountMinor;
  const allocations: Allocation[] = [];
  for (const inv of eligible) {
    if (left <= 0) break;
    const take = Math.min(left, inv.outstanding_minor);
    allocations.push({ invoice_id: inv.id, amount_minor: take });
    left -= take;
  }
  return { allocations, unallocatedMinor: left };
}

export function totalAllocated(allocations: Allocation[]): number {
  return allocations.reduce((s, a) => s + a.amount_minor, 0);
}
