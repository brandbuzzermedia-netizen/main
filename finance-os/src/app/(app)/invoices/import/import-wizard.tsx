"use client";

import Link from "next/link";
import { useActionState, useState, startTransition } from "react";
import { commitImportAction, previewImportAction, type PreviewState } from "../actions";
import { formatMoney } from "@/domain/money";
import { formatDate } from "@/domain/dates";
import { Alert, Badge, Button, Card, Stat, Table, Td } from "@/components/ui";

const FIELD_LABELS: Record<string, string> = {
  invoiceNumber: "Invoice number", externalId: "Swipe ID", customerName: "Customer", customerGstin: "Customer GSTIN",
  invoiceDate: "Invoice date", dueDate: "Due date", billingPeriodStart: "Period start", billingPeriodEnd: "Period end",
  currency: "Currency", subtotal: "Subtotal", tax: "Tax", total: "Total", paid: "Paid (Swipe)", status: "Status", pdfUrl: "Invoice link",
};

export function ImportWizard({ clientNames }: { clientNames: Record<string, string> }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, previewAction, previewing] = useActionState<PreviewState, FormData>(previewImportAction, {});
  const [commit, commitAction, committing] = useActionState<PreviewState, FormData>(commitImportAction, {});
  const [committedFor, setCommittedFor] = useState<string | null>(null);

  const plan = preview.plan;
  const result = committedFor === preview.sha256 ? commit.result : undefined;

  const send = (dispatch: (fd: FormData) => void, extra?: Record<string, string>) => {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    startTransition(() => dispatch(fd));
  };

  return (
    <div className="flex flex-col gap-6">
      <Card title="1. Choose the Swipe export">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Swipe CSV export"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setCommittedFor(null);
            }}
            className="text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm"
          />
          <Button type="button" disabled={!file || previewing} onClick={() => send(previewAction)}>
            {previewing ? "Checking…" : "Check file"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted">
          Nothing is saved until you confirm. Excel exports: open in Excel and use File → Save As → CSV UTF-8.
          Unsure about columns? <Link className="text-brand underline" href="/invoices/import/template">Download the template</Link>.
        </p>
        {preview.error && <div className="mt-3"><Alert tone="danger">{preview.error}</Alert></div>}
      </Card>

      {plan && (
        <Card title={`2. Review ${preview.fileName}`}>
          {plan.missingColumns.length > 0 ? (
            <Alert tone="danger" title="Required columns not found">
              Missing: {plan.missingColumns.map((c) => FIELD_LABELS[c] ?? c).join(", ")}. Rename the column headers or use the template.
            </Alert>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Rows in file" value={plan.totalRows} />
                <Stat label="Ready to import" value={plan.rows.length} tone="ok" />
                <Stat label="Rows with problems" value={new Set(plan.issues.map((i) => i.rowNumber)).size} tone={plan.issues.length ? "warn" : "default"} />
                <Stat label="Total value" value={formatMoney(plan.rows.reduce((s, r) => s + r.total_minor, 0), "INR", { compact: true })} />
              </div>

              <div className="text-sm">
                <div className="mb-1 font-medium">Columns understood</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(plan.mapped).map(([k, header]) => (
                    <Badge key={k} tone="brand">{FIELD_LABELS[k] ?? k} ← “{header}”</Badge>
                  ))}
                  {plan.unmappedColumns.map((h) => <Badge key={h}>Ignored: “{h}”</Badge>)}
                </div>
              </div>

              {plan.unmatchedCustomers.length > 0 && (
                <Alert tone="warn" title="Customers that match no client">
                  {plan.unmatchedCustomers.map((u) => `${u.name} (${u.rows} row${u.rows > 1 ? "s" : ""})`).join(", ")}.{" "}
                  Create the client, or add the name under “Names in Swipe” on an existing client, then check the file again.
                </Alert>
              )}

              {plan.issues.length > 0 && (
                <details className="rounded-lg border border-line" open={plan.issues.length <= 10}>
                  <summary className="cursor-pointer px-4 py-2 text-sm font-medium">{plan.issues.length} problem(s). These rows will be skipped.</summary>
                  <ul className="max-h-64 overflow-y-auto border-t border-line px-4 py-2 text-sm">
                    {plan.issues.map((i, idx) => (
                      <li key={idx} className="py-0.5"><span className="tabular text-muted">Row {i.rowNumber}:</span> {i.message}</li>
                    ))}
                  </ul>
                </details>
              )}

              {plan.rows.length > 0 && (
                <div className="-mx-4">
                  <Table head={["Row", "Invoice", "Client", "Invoice date", "Due", "Total", "Swipe status"]}>
                    {plan.rows.slice(0, 50).map((r) => (
                      <tr key={r.invoice_number}>
                        <Td className="tabular text-muted">{r.row_number}</Td>
                        <Td className="font-medium">{r.invoice_number}</Td>
                        <Td>{clientNames[r.client_id] ?? r.client_id}</Td>
                        <Td>{formatDate(r.invoice_date)}</Td>
                        <Td>{formatDate(r.due_date)}{r.due_date_derived && <span className="ml-1 text-xs text-muted">(from terms)</span>}</Td>
                        <Td numeric>{formatMoney(r.total_minor, r.currency)}</Td>
                        <Td>{r.source_status === "cancelled" ? <Badge>Cancelled</Badge> : (r.source_reported_status ?? "—")}</Td>
                      </tr>
                    ))}
                  </Table>
                  {plan.rows.length > 50 && <p className="px-4 pt-2 text-xs text-muted">Showing 50 of {plan.rows.length} rows.</p>}
                </div>
              )}

              <Alert tone="info">
                Re-importing is safe: invoices are matched by invoice number and never duplicated. A Swipe “Paid” status is
                recorded for reference only. Payments count once they are verified in this app.
              </Alert>

              {!result && (
                <div>
                  <Button
                    type="button"
                    disabled={plan.rows.length === 0 || committing}
                    onClick={() => {
                      setCommittedFor(preview.sha256 ?? null);
                      send(commitAction, { sha256: preview.sha256 ?? "" });
                    }}
                  >
                    {committing ? "Importing…" : `Import ${plan.rows.length} invoice${plan.rows.length === 1 ? "" : "s"}`}
                  </Button>
                  {commit.error && committedFor === preview.sha256 && <div className="mt-3"><Alert tone="danger">{commit.error}</Alert></div>}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {result && (
        <Card title="3. Import complete">
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="New" value={result.inserted} tone="ok" />
            <Stat label="Updated" value={result.updated} />
            <Stat label="Unchanged" value={result.unchanged} />
            <Stat label="Failed" value={result.errors} tone={result.errors ? "danger" : "default"} />
            <Stat label="To reconcile" value={result.reconciliation_tasks} tone={result.reconciliation_tasks ? "warn" : "default"} />
          </div>
          {result.same_file_imported_before && (
            <Alert tone="info">This exact file was imported before. Nothing was duplicated.</Alert>
          )}
          {result.results.some((r) => r.action === "error") && (
            <ul className="mt-3 text-sm">
              {result.results.filter((r) => r.action === "error").map((r) => (
                <li key={r.invoice_number} className="text-danger">Row {r.row} ({r.invoice_number}): {r.message}</li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-3 text-sm">
            <Link className="text-brand underline" href="/invoices">View invoices</Link>
            {result.reconciliation_tasks > 0 && <Link className="text-brand underline" href="/tasks">Review reconciliation tasks</Link>}
          </div>
        </Card>
      )}
    </div>
  );
}
