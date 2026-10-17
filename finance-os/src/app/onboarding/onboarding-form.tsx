"use client";

import { useActionState } from "react";
import { createDemoWorkspace, createOrganization, type OnboardingState } from "./actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export function OnboardingForm({ showDemo }: { showDemo: boolean }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createOrganization, {});
  const [demoState, demoAction, demoPending] = useActionState<OnboardingState, FormData>(() => createDemoWorkspace(), {});
  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <Field label="Agency name" name="name" hint="You become the owner. You can invite colleagues later.">
          <Input name="name" defaultValue="Get Bee Seen" required />
        </Field>
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create workspace"}</Button>
      </form>
      {showDemo && (
        <form action={demoAction} className="border-t border-line pt-5">
          <p className="mb-3 text-sm text-muted">
            Development only: create a separate workspace filled with clearly labelled, made-up clients and invoices.
          </p>
          {demoState.error && <Alert tone="danger">{demoState.error}</Alert>}
          <Button type="submit" variant="secondary" disabled={demoPending}>
            {demoPending ? "Creating demo…" : "Create demo workspace"}
          </Button>
        </form>
      )}
    </div>
  );
}
