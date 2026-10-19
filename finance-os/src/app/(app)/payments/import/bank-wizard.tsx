"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { commitBankImportAction, previewBankImportAction, type BankPreviewState } from "../actions";
import { formatMoney } from "@/domain/money";
import { formatDate } from "@/domain/dates";
import { Alert, Badge, Button, Card, Stat, Table, Td } from "@/components/ui";

export function BankWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, previewAction, previewing] = useActionState<BankPreviewState, FormData>(previewBankImportAction, {});
  const [commit, commitAction, committing] = useActionState<BankPreviewState, FormData>(commitBankImportAction, {});
  const [committedFor, setCommittedFor] = useState<string | null>(null);
  const result = committedFor && committedFor === preview.sha256 ? commit.result : undefined;

  const send = (dispatch: (fd: FormData) => void, extra?: Record<string, string>) => {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    startTransition(() => dispatch(fd));
  };
  const allRows = preview.rows ?? [];
  const rows = allRows.filter((r) => !r.gatewaySettlement);
  const settlements = allRows.filter((r) => r.gatewaySettlement);

  return (
    <div className="flex flex-col gap-6">
      <Card title="1. Choose the statement">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input type="file" accept=".csv,text/csv" aria-label="Bank statement CSV"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setCommittedFor(null); }}
            className="text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm" />
          <Button type="button" disabled={!file || previewing} onClick={() => send(previewAction)}>{previewing ? "Reading…" : "Check statement"}</Button>
        </div>
        <p className="mt-3 text-xs text-muted">
          Download the current-account statement from net banking as CSV (or Excel, saved as CSV UTF-8). Only credits are imported.
          Bank records count as verified receipts. Re-importing an overlapping period is safe: references already recorded are skipped.
        </p>
        {preview.error && <div className="mt-3"><Alert tone="danger">{preview.error}</Alert></div>}
      </Card>

      {preview.rows && (
        <Card title={`2. Review ${preview.fileName}`}>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Credits found" value={rows.length} />
            <Stat label="Total credits" value={formatMoney(rows.reduce((s, r) => s + r.amount_minor, 0), "INR", { compact: true })} />
            <Stat label="Auto-allocated" value={rows.filter((r) => r.allocate_invoice_id).length} tone="ok" />
            <Stat label="Need review" value={rows.filter((r) => !r.allocate_invoice_id).length} tone={rows.some((r) => !r.allocate_invoice_id) ? "warn" : "default"} />
          </div>
          {(preview.issues ?? []).length > 0 && (
            <div className="mb-4"><Alert tone="warn" title="Rows skipped">{preview.issues!.map((i) => `Row ${i.rowNumber}: ${i.message}`).join(" · ")}</Alert></div>
          )}
          <p className="mb-3 text-xs text-muted">
            {preview.skippedDebits ?? 0} debit row(s) ignored. Expenses arrive in Phase 4.
            {settlements.length > 0 && <> {settlements.length} Razorpay settlement(s) of {formatMoney(settlements.reduce((s, r) => s + r.amount_minor, 0))} skipped: those client payments are already recorded individually from Razorpay.</>}
          </p>
          <div className="-mx-4">
            <Table head={["Row", "Date", "Narration", "Reference", "Amount", "Match"]}>
              {rows.map((r) => (
                <tr key={r.row_number}>
                  <Td className="tabular text-muted">{r.row_number}</Td>
                  <Td>{formatDate(r.payment_date)}</Td>
                  <Td className="max-w-[280px]"><span className="block truncate font-mono text-xs" title={r.narration}>{r.narration}</span></Td>
                  <Td className="font-mono text-xs">{r.transaction_reference}</Td>
                  <Td numeric>{formatMoney(r.amount_minor)}</Td>
                  <Td>
                    {r.clientLabel ? <div className="font-medium">{r.clientLabel}</div> : <Badge tone="warn">Unmatched</Badge>}
                    <div className="text-xs text-muted">{r.matchNote}</div>
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
          {!result && rows.length > 0 && (
            <div className="mt-4">
              <Button type="button" disabled={committing} onClick={() => { setCommittedFor(preview.sha256 ?? null); send(commitAction, { sha256: preview.sha256 ?? "" }); }}>
                {committing ? "Importing…" : `Import ${rows.length} credit${rows.length === 1 ? "" : "s"}`}
              </Button>
              {commit.error && committedFor === preview.sha256 && <div className="mt-3"><Alert tone="danger">{commit.error}</Alert></div>}
            </div>
          )}
        </Card>
      )}

      {result && (
        <Card title="3. Import complete">
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="New receipts" value={result.inserted} tone="ok" />
            <Stat label="Verified existing" value={result.verified_existing} tone="ok" />
            <Stat label="Auto-allocated" value={result.auto_allocated} />
            <Stat label="Already recorded" value={result.duplicates} />
            <Stat label="Failed" value={result.errors} tone={result.errors ? "danger" : "default"} />
          </div>
          {result.same_file_imported_before && <Alert tone="info">This exact statement was imported before. Nothing was duplicated.</Alert>}
          <ul className="mt-3 text-sm">
            {result.results.filter((r) => r.action === "error" || r.message).map((r) => (
              <li key={r.row} className={r.action === "error" ? "text-danger" : "text-muted"}>Row {r.row}: {r.message}</li>
            ))}
          </ul>
          <div className="mt-4 text-sm"><Link className="text-brand underline" href="/payments?view=attention">Review payments that need attention</Link></div>
        </Card>
      )}
    </div>
  );
}
