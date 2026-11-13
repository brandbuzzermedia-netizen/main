"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { uploadBillAction, submitReviewAction, type ReviewState, type UploadState } from "./actions";

export function UploadForm({ slug }: { slug: string }) {
  const [s, action, pending] = useActionState<UploadState, FormData>(uploadBillAction.bind(null, slug), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Bill or receipt" name="file" hint="PDF, or a photo from your phone camera. Up to 15 MB. The original is kept privately.">
        <input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" capture="environment" required className="text-sm" />
      </Field>
      {s.error && <Alert tone="danger">{s.error} {s.duplicateOf && <Link className="underline" href={`/c/${slug}/bills/${s.duplicateOf}`}>Open the earlier upload</Link>}</Alert>}
      <div><Button type="submit" variant="company" disabled={pending}>{pending ? "Uploading and reading…" : "Upload and read"}</Button></div>
    </form>
  );
}

export type ReviewField = { key: string; label: string; value: string; confidence: number; needsCheck: boolean; type?: "date" };

export function ReviewForm({ slug, docId, extractionId, fields, entities, units, duplicates }: {
  slug: string; docId: string; extractionId: string; fields: ReviewField[]; entities: { id: string; label: string }[]; units: { id: string; label: string }[]; duplicates: string[];
}) {
  const [s, action, pending] = useActionState<ReviewState, FormData>(submitReviewAction.bind(null, slug, docId), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="extraction_id" value={extractionId} />
      {duplicates.length > 0 && <Alert tone="warn" title="Possible duplicate">{duplicates.join(" · ")}</Alert>}
      {fields.map((f) => (
        <div key={f.key} className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field label={f.label} name={f.key}>
            <Input name={f.key} type={f.type ?? "text"} defaultValue={f.value} />
          </Field>
          <div className="flex flex-col items-end gap-1 pb-1.5 text-xs">
            <span className={f.confidence >= 0.85 ? "rounded bg-ok-soft px-1.5 text-ok" : f.value ? "rounded bg-warn-soft px-1.5 text-warn" : "rounded bg-danger-soft px-1.5 text-danger"}>
              {f.value ? `${Math.round(f.confidence * 100)}%` : "Missing"}
            </span>
            {f.needsCheck && <label className="flex items-center gap-1"><input type="checkbox" name={`checked_${f.key}`} />checked</label>}
          </div>
        </div>
      ))}
      <Field label="Category" name="category"><Input name="category" required defaultValue={fields.find((f) => f.key === "suggested_category")?.value || ""} /></Field>
      <Field label="Legal entity" name="legal_entity_id"><select id="legal_entity_id" name="legal_entity_id" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">{entities.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select></Field>
      {units.length > 0 && <Field label="Rental unit (optional)" name="rental_unit_id"><select id="rental_unit_id" name="rental_unit_id" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"><option value="">None</option>{units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select></Field>}
      <p className="text-xs text-muted">Category and tax fields are suggestions, not tax advice. Submitting sends the expense for approval; it posts to the ledger only once approved.</p>
      {s.error && <Alert tone="danger">{s.error}</Alert>}
      <div><Button type="submit" variant="company" disabled={pending}>{pending ? "Submitting…" : "Submit for approval"}</Button></div>
    </form>
  );
}
