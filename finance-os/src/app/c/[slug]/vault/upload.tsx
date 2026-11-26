"use client";

import { useActionState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { uploadDocumentAction, type VaultState } from "./actions";

export function VaultUpload({ slug, canRestrict }: { slug: string; canRestrict: boolean }) {
  const [s, action, pending] = useActionState<VaultState, FormData>(uploadDocumentAction.bind(null, slug), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="File (PDF or image, up to 15 MB)" name="file"><input id="file" name="file" type="file" required accept="application/pdf,image/*" className="text-sm" /></Field>
      <Field label="Kind" name="kind">
        <select id="kind" name="kind" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">{["agreement", "lease", "certificate", "tax", "receipt", "other"].map((k) => <option key={k}>{k}</option>)}</select>
      </Field>
      {canRestrict && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="restricted" /> Restricted (salary, partner terms, owner distributions)</label>}
      {s.error && <Alert tone="danger">{s.error}</Alert>}{s.ok && <Alert tone="ok">{s.ok}</Alert>}
      <div><Button variant="company" disabled={pending}>{pending ? "Uploading…" : "Upload"}</Button></div>
    </form>
  );
}
