"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

type Action = (prev: { error?: string }, fd: FormData) => Promise<{ error?: string }>;

export function VerificationForm({ action, status }: { action: Action; status: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label={status === "verified" ? "Note (to reopen or reject)" : "Where did you see the money?"} name="note" hint="e.g. HDFC current account statement, 18 Oct">
        <Input name="note" />
      </Field>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {status !== "verified" && <Button name="decision" value="verified" type="submit" disabled={pending}>Mark verified</Button>}
        {status !== "rejected" && <Button name="decision" value="rejected" variant="danger" type="submit" disabled={pending}>Reject</Button>}
        {status !== "pending_verification" && <Button name="decision" value="pending_verification" variant="secondary" type="submit" disabled={pending}>Back to awaiting</Button>}
      </div>
    </form>
  );
}

export function AssignClientForm({ action, clients }: { action: Action; clients: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label="Assign to client" name="client_id">
        <Select name="client_id" defaultValue="" required>
          <option value="" disabled>Choose a client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>Assign</Button>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
    </form>
  );
}
