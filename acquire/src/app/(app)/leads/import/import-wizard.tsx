"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { commitImportAction, previewImportAction, type CommitState, type PreviewState } from "../actions";
import { channelLabel, segmentLabel, timelineLabel } from "@/domain/labels";
import { formatBudget } from "@/domain/money";
import { toCsv } from "@/domain/csv";
import { Alert, Badge, Button, Card, Field, Select, Stat, Table, Td } from "@/components/ui";

const FIELD_LABELS: Record<string, string> = {
  fullName: "Full name", firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone", country: "Country",
  timezone: "Time zone", segment: "Segment", propertyInterest: "Property interest", propertyType: "Property type",
  preferredLocation: "Preferred location", budgetMin: "Budget min", budgetMax: "Budget max", currency: "Currency",
  timeline: "Timeline", tags: "Tags", notes: "Notes", emailConsent: "Email consent", smsConsent: "SMS consent",
  callConsent: "Call consent", aiCallConsent: "AI call consent", whatsappConsent: "WhatsApp consent",
  consentBasis: "Consent basis", consentSource: "Consent source", consentDate: "Consent date",
};

export function ImportWizard({ sources, members, market }: { sources: { id: string; label: string; isDefault: boolean }[]; members: { id: string; label: string }[]; market: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, previewAction, previewing] = useActionState<PreviewState, FormData>(previewImportAction, {});
  const [commit, commitAction, committing] = useActionState<CommitState, FormData>(commitImportAction, {});
  const [options, setOptions] = useState({ source_id: sources.find((s) => s.isDefault)?.id ?? "", owner_id: "", on_duplicate: "skip" });
  const [confirmed, setConfirmed] = useState(false);

  const plan = preview.plan;
  const current = commit.sha256 && commit.sha256 === preview.sha256 ? commit : undefined;
  const errors = plan?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = plan?.issues.filter((i) => i.severity === "warning") ?? [];

  const send = (dispatch: (fd: FormData) => void, extra?: Record<string, string>) => {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    startTransition(() => dispatch(fd));
  };

  const downloadReport = () => {
    if (!plan) return;
    const csv = toCsv([["Row", "Severity", "Problem"], ...plan.issues.map((i) => [i.rowNumber, i.severity, i.message])]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `import-problems-${preview.fileName ?? "file"}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card title="1. Choose a CSV file">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Lead CSV file"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setConfirmed(false); }}
            className="text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm"
          />
          <Button type="button" disabled={!file || previewing} onClick={() => send(previewAction)}>{previewing ? "Checking…" : "Check file"}</Button>
        </div>
        <p className="mt-3 text-xs text-muted">
          Up to 10,000 rows and 5 MB. Phone numbers without a + prefix are read as {market} numbers unless the row has a Country.
          Columns we don&apos;t recognise are kept as custom fields. <Link className="text-brand underline" href="/leads/import/template" prefetch={false}>Download the template</Link>.
        </p>
        {preview.error && <div className="mt-3"><Alert tone="danger">{preview.error}</Alert></div>}
      </Card>

      {plan && (
        <Card title={`2. Review ${preview.fileName}`}>
          {plan.missingColumns.length > 0 ? (
            <Alert tone="danger" title="Required columns not found">
              Missing: {plan.missingColumns.join(", ")}. Rename the column headers or start from the template.
            </Alert>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Rows in file" value={plan.totalRows} />
                <Stat label="Ready to import" value={plan.rows.length} tone="ok" />
                <Stat label="Rows skipped" value={new Set(errors.map((i) => i.rowNumber)).size} tone={errors.length ? "warn" : "default"} />
                <Stat label="With consent" value={plan.rows.filter((r) => r.consent.length > 0).length} hint="Rows whose consent has a stated source" />
              </div>

              <div className="text-sm">
                <div className="mb-1 font-medium">Columns understood</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(plan.mapped).map(([k, header]) => <Badge key={k} tone="brand">{FIELD_LABELS[k] ?? k} ← “{header}”</Badge>)}
                  {plan.customColumns.map((h) => <Badge key={h} tone="info">Custom field: “{h}”</Badge>)}
                  {plan.ignoredColumns.map((h) => <Badge key={h}>Ignored: “{h}”</Badge>)}
                </div>
              </div>

              {plan.issues.length > 0 && (
                <details className="rounded-lg border border-line" open={plan.issues.length <= 10}>
                  <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
                    {errors.length} problem(s) that skip a row, {warnings.length} warning(s)
                  </summary>
                  <ul className="max-h-64 overflow-y-auto border-t border-line px-4 py-2 text-sm">
                    {plan.issues.slice(0, 500).map((i, idx) => (
                      <li key={idx} className="py-0.5">
                        <span className="tabular text-muted">Row {i.rowNumber}:</span>{" "}
                        <span className={i.severity === "error" ? "text-danger" : "text-warn"}>{i.message}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-line px-4 py-2"><button type="button" className="text-sm text-brand underline" onClick={downloadReport}>Download the full problem report</button></div>
                </details>
              )}

              {plan.rows.length > 0 && (
                <div className="-mx-4">
                  <Table head={["Row", "Name", "Email / phone", "Segment", "Budget", "Timeline", "Consent"]}>
                    {plan.rows.slice(0, 25).map((r) => (
                      <tr key={r.row_number}>
                        <Td className="tabular text-muted">{r.row_number}</Td>
                        <Td className="font-medium">{r.full_name}</Td>
                        <Td>{r.email ?? "—"}<div className="text-xs text-muted">{r.phone_e164}{r.country && ` · ${r.country}`}</div></Td>
                        <Td>{segmentLabel[r.segment]}</Td>
                        <Td className="tabular">{formatBudget(r.budget_min_minor, r.budget_max_minor, r.currency)}</Td>
                        <Td>{timelineLabel[r.timeline]}</Td>
                        <Td>{r.consent.length ? r.consent.map((c) => channelLabel[c.channel]).join(", ") : <span className="text-muted">None</span>}</Td>
                      </tr>
                    ))}
                  </Table>
                  {plan.rows.length > 25 && <p className="px-4 pt-2 text-xs text-muted">Showing 25 of {plan.rows.length} rows.</p>}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {plan && plan.missingColumns.length === 0 && plan.rows.length > 0 && !current?.result && (
        <Card title="3. Import">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Lead source" name="source_id" hint="Where these people came from. Add sources in Settings.">
              <Select name="source_id" value={options.source_id} onChange={(e) => setOptions({ ...options, source_id: e.target.value })}>
                <option value="">No source</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="Assign to" name="owner_id">
              <Select name="owner_id" value={options.owner_id} onChange={(e) => setOptions({ ...options, owner_id: e.target.value })}>
                <option value="">Leave unassigned</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </Select>
            </Field>
            <Field label="Existing leads (same email or phone)" name="on_duplicate">
              <Select name="on_duplicate" value={options.on_duplicate} onChange={(e) => setOptions({ ...options, on_duplicate: e.target.value })}>
                <option value="skip">Skip them</option>
                <option value="update">Fill in and update them</option>
              </Select>
            </Field>
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>
              I confirm this list was obtained lawfully (our own enquiries, a licensed provider, or a source whose terms permit this use),
              and that any consent marked in the file is backed by the stated source.
            </span>
          </label>
          {current?.error && <div className="mt-3"><Alert tone="danger">{current.error}</Alert></div>}
          <div className="mt-4">
            <Button type="button" disabled={!confirmed || committing} onClick={() => send(commitAction, options)}>
              {committing ? "Importing…" : `Import ${plan.rows.length} lead${plan.rows.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </Card>
      )}

      {current?.result && (
        <Alert tone="ok" title="Import finished">
          {current.result.created} created, {current.result.updated} updated, {current.result.skipped} skipped
          {current.result.suppressed > 0 && `, ${current.result.suppressed} already on the suppression list (imported but not contactable)`}.{" "}
          <Link href="/leads?sort=newest" className="underline">View leads</Link>
        </Alert>
      )}
    </div>
  );
}
