"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { saveAllocationsAction } from "../actions";
import { suggestAllocations, type OpenInvoice } from "@/domain/allocation";
import { formatMoney, minorToInput, parseMoneyToMinor } from "@/domain/money";
import { formatDate } from "@/domain/dates";
import { Alert, Button, Input } from "@/components/ui";

type Row = OpenInvoice & { invoice_date: string; current_minor: number };

export function AllocationEditor({ paymentId, amountMinor, rows, canEdit }: { paymentId: string; amountMinor: number; rows: Row[]; canEdit: boolean }) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((r) => [r.id, r.current_minor ? minorToInput(r.current_minor) : ""])),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const parsed = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const [id, v] of Object.entries(values)) {
      try {
        out[id] = v.trim() ? parseMoneyToMinor(v) : 0;
      } catch {
        out[id] = null;
      }
    }
    return out;
  }, [values]);
  const total = Object.values(parsed).reduce<number>((s, v) => s + (v ?? 0), 0);
  const invalid = Object.values(parsed).some((v) => v === null);
  const over = total > amountMinor;
  const rowOver = rows.find((r) => (parsed[r.id] ?? 0) > r.outstanding_minor + r.current_minor);

  const suggest = () => {
    // Suggest against balances as if this payment's own allocations were removed.
    const pool = rows.map((r) => ({ ...r, outstanding_minor: r.outstanding_minor + r.current_minor }));
    const { allocations } = suggestAllocations(amountMinor, pool);
    setValues(Object.fromEntries(rows.map((r) => {
      const a = allocations.find((x) => x.invoice_id === r.id);
      return [r.id, a ? minorToInput(a.amount_minor) : ""];
    })));
    setSaved(false);
  };

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveAllocationsAction(paymentId, rows.map((r) => ({ invoice_id: r.id, amount_minor: parsed[r.id] ?? 0 })));
      if (res.error) setError(res.error);
      else setSaved(true);
    });

  if (rows.length === 0) return <p className="text-sm text-muted">This client has no open invoices. The payment stays as an unallocated advance.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Invoice</th>
              <th className="px-4 py-2 font-medium">Due</th>
              <th className="px-4 py-2 text-right font-medium">Open before this payment</th>
              <th className="px-4 py-2 text-right font-medium">Apply (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">
                  <Link className="font-medium whitespace-nowrap hover:underline" href={`/invoices/${r.id}`}>{r.invoice_number}</Link>
                  {r.status === "disputed" && <span className="ml-2 text-xs text-info">disputed</span>}
                </td>
                <td className="px-4 py-2">{formatDate(r.effective_due_date)}</td>
                <td className="tabular px-4 py-2 text-right">{formatMoney(r.outstanding_minor + r.current_minor)}</td>
                <td className="px-4 py-2 text-right">
                  <Input
                    aria-label={`Amount for ${r.invoice_number}`}
                    name={`alloc-${r.id}`}
                    inputMode="decimal"
                    disabled={!canEdit}
                    value={values[r.id] ?? ""}
                    onChange={(e) => { setValues((v) => ({ ...v, [r.id]: e.target.value })); setSaved(false); }}
                    className={`tabular max-w-[140px] text-right ${parsed[r.id] === null ? "border-danger" : ""}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tabular flex flex-wrap justify-end gap-4 text-sm">
        <span>Allocated {formatMoney(total)}</span>
        <span className={over ? "text-danger" : "text-muted"}>of {formatMoney(amountMinor)}</span>
        <span className="text-muted">Unallocated {formatMoney(Math.max(amountMinor - total, 0))}</span>
      </div>
      {over && <Alert tone="danger">Allocations exceed the payment amount.</Alert>}
      {rowOver && <Alert tone="danger">More than the open balance is applied to {rowOver.invoice_number}.</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="ok">Allocations saved.</Alert>}
      {canEdit && (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={suggest}>Suggest</Button>
          <Button type="button" onClick={save} disabled={pending || over || invalid || Boolean(rowOver)}>{pending ? "Saving…" : "Save allocations"}</Button>
        </div>
      )}
    </div>
  );
}
