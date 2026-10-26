"use client";

import { useActionState, type ReactNode } from "react";
import { bulkAssignAction, type FormState } from "./actions";
import { Alert, Button, Select } from "@/components/ui";

/** Wraps the lead table in a form so selected rows can be assigned in one step. */
export function BulkAssign({ enabled, members, children }: { enabled: boolean; members: { id: string; label: string }[]; children: ReactNode }) {
  const [state, action, pending] = useActionState<FormState, FormData>(bulkAssignAction, {});
  if (!enabled) return <>{children}</>;
  return (
    <form action={action}>
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="bulk-owner" className="text-muted">Assign selected to</label>
        <Select id="bulk-owner" name="owner_id" defaultValue="" className="w-auto">
          <option value="">Nobody (unassign)</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </Select>
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Saving…" : "Apply"}</Button>
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        {state.message && <span role="status" className="text-ok">{state.message}</span>}
      </div>
    </form>
  );
}
