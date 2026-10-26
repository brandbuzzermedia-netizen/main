"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { deleteViewAction, saveViewAction, type FormState } from "./actions";
import { Alert, Button, Input } from "@/components/ui";

type View = { id: string; name: string; query: string; is_shared: boolean; mine: boolean };

export function SavedViews({ views, currentQuery, canShare }: { views: View[]; currentQuery: string; canShare: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveViewAction, {});
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Views:</span>
      {views.length === 0 && <span className="text-muted">none saved</span>}
      {views.map((v) => (
        <span key={v.id} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 ${v.query === currentQuery ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface"}`}>
          <Link href={`/leads${v.query ? `?${v.query}` : ""}`}>{v.name}</Link>
          {v.is_shared && <span className="text-[10px] uppercase text-muted">shared</span>}
          {v.mine && (
            <button type="button" aria-label={`Delete view ${v.name}`} className="text-muted hover:text-danger" onClick={() => deleteViewAction(v.id)}>×</button>
          )}
        </span>
      ))}
      {currentQuery && !open && (
        <button type="button" className="text-brand underline-offset-2 hover:underline" onClick={() => setOpen(true)}>Save current filters</button>
      )}
      {open && !state.ok && (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="query" value={currentQuery} />
          <label htmlFor="view-name" className="sr-only">View name</label>
          <Input id="view-name" name="name" placeholder="View name" required maxLength={60} className="w-44" />
          {canShare && <label className="flex items-center gap-1"><input type="checkbox" name="is_shared" /> Share with team</label>}
          <Button type="submit" variant="secondary" disabled={pending}>Save</Button>
          {(state.error || state.fieldErrors?.name) && <Alert tone="danger">{state.error ?? state.fieldErrors?.name?.[0]}</Alert>}
        </form>
      )}
    </div>
  );
}
