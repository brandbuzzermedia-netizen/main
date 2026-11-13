"use client";

import { useActionState } from "react";
import type { Field } from "@/lib/resources";
import { Alert, Button, Field as F, Input, Select, Textarea } from "@/components/ui";
import { createRecordAction, type RecordState } from "@/app/c/[slug]/r/actions";

export function RecordForm({ slug, resource, fields, refOptions }: { slug: string; resource: string; fields: Field[]; refOptions: Record<string, [string, string][]> }) {
  const [s, action, pending] = useActionState<RecordState, FormData>(createRecordAction.bind(null, slug, resource), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {fields.map((f) => {
        const err = s.fields?.[f.name];
        if (f.type === "checkbox") {
          return <label key={f.name} className="flex items-center gap-2 text-sm"><input type="checkbox" name={f.name} defaultChecked={f.default === "on"} />{f.label}</label>;
        }
        const control = f.type === "select" || f.type === "ref" ? (
          <Select name={f.name} required={f.required} defaultValue={f.default ?? ""}>
            {!f.required && <option value="">—</option>}
            {(f.type === "ref" ? refOptions[f.ref!.table] ?? [] : f.options ?? []).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        ) : f.type === "textarea" ? <Textarea name={f.name} required={f.required} maxLength={f.max ?? 2000} />
          : <Input name={f.name} required={f.required} defaultValue={f.default} maxLength={f.max}
              type={f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
              inputMode={f.type === "money" ? "decimal" : undefined} step={f.type === "number" ? "any" : undefined} />;
        return <F key={f.name} label={`${f.label}${f.required ? " *" : ""}`} name={f.name} hint={f.hint} error={err}>{control}</F>;
      })}
      {s.error && <Alert tone="danger">{s.error}</Alert>}
      {s.ok && <Alert tone="ok">{s.ok}</Alert>}
      <div><Button type="submit" variant="company" disabled={pending}>{pending ? "Saving…" : "Add"}</Button></div>
    </form>
  );
}
