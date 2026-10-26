"use client";

import { useActionState } from "react";
import { createDemoWorkspace, createOrganization, type OnboardingState } from "./actions";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

const MARKETS = [
  ["US", "United States"], ["GB", "United Kingdom"], ["AE", "United Arab Emirates"], ["CA", "Canada"], ["AU", "Australia"],
];

export function OnboardingForm({ showDemo }: { showDemo: boolean }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createOrganization, {});
  const [demoState, demoAction, demoPending] = useActionState<OnboardingState, FormData>(() => createDemoWorkspace(), {});
  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <Field label="Business name" name="name" hint="Your brokerage, team or agency. You become its admin and can invite colleagues.">
          <Input name="name" required maxLength={120} autoComplete="organization" />
        </Field>
        <Field label="Primary market" name="market" hint="Sets the default time zone, currency, phone format and contact rules. Leads in other countries use their own country's rules.">
          <Select name="market" defaultValue="US">
            {MARKETS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </Select>
        </Field>
        <Field label="Time zone (optional)" name="timezone" hint="IANA name, e.g. America/Chicago. Leave empty to use the market default.">
          <Input name="timezone" placeholder="America/Chicago" />
        </Field>
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create workspace"}</Button>
      </form>
      {showDemo && (
        <form action={demoAction} className="border-t border-line pt-5">
          <p className="mb-3 text-sm text-muted">
            Development only: create a separate workspace with clearly labelled, made-up leads.
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
