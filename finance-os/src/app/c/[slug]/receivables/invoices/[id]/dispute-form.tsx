"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";

export function DisputeForm({ action, disputed }: { action: (prev: { error?: string }, fd: FormData) => Promise<{ error?: string }>; disputed: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {!disputed && (
        <Field label="Reason" name="dispute_reason" hint="Disputed invoices get no automated reminders and are excluded from expected collections.">
          <Input name="dispute_reason" required minLength={3} />
        </Field>
      )}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <div>
        <Button type="submit" variant={disputed ? "secondary" : "danger"} disabled={pending}>
          {disputed ? "Resolve dispute" : "Mark as disputed"}
        </Button>
      </div>
    </form>
  );
}
