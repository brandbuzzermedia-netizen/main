"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FieldErrors } from "@/domain/schemas";
import { todayInBusinessTz, addDays } from "@/domain/dates";
import { minorToInput } from "@/domain/money";
import { Alert, Button, Field, Input, Select } from "./ui";

type State = { error?: string; fieldErrors?: FieldErrors; ok?: boolean };
type Action = (prev: State, fd: FormData) => Promise<State>;

function useResettingForm(action: Action) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return { state, formAction, pending, ref, e: state.fieldErrors ?? {} };
}

export function CommitmentForm({ action, defaultAmountMinor, invoices }: { action: Action; defaultAmountMinor?: number; invoices?: { id: string; label: string }[] }) {
  const { state, formAction, pending, ref, e } = useResettingForm(action);
  return (
    <form ref={ref} action={formAction} className="grid gap-3 sm:grid-cols-2">
      {invoices && (
        <div className="sm:col-span-2">
          <Field label="For invoice" name="invoice_id" hint="Optional. Leave blank for a promise about the account as a whole." error={e.invoice_id}>
            <Select name="invoice_id" defaultValue="">
              <option value="">Whole account</option>
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </Select>
          </Field>
        </div>
      )}
      <Field label="Promised amount (₹)" name="promised_amount_minor" error={e.promised_amount_minor}>
        <Input name="promised_amount_minor" inputMode="decimal" defaultValue={defaultAmountMinor ? minorToInput(defaultAmountMinor) : ""} required />
      </Field>
      <Field label="Will pay by" name="commitment_date" error={e.commitment_date}>
        <Input name="commitment_date" type="date" defaultValue={addDays(todayInBusinessTz(), 3)} required />
      </Field>
      <Field label="Promised by" name="promised_by" hint="Name and role, e.g. Ravi, accounts" error={e.promised_by}>
        <Input name="promised_by" required />
      </Field>
      <Field label="Notes" name="notes" hint="Where it was said: call, WhatsApp, email" error={e.notes}>
        <Input name="notes" />
      </Field>
      {state.error && <div className="sm:col-span-2"><Alert tone="danger">{state.error}</Alert></div>}
      {state.ok && <div className="sm:col-span-2"><Alert tone="ok">Promise logged. Normal reminders pause until the promised date.</Alert></div>}
      <div><Button type="submit" variant="secondary" disabled={pending}>Log promise</Button></div>
    </form>
  );
}

export function ExtensionForm({ action, minDate }: { action: Action; minDate: string }) {
  const { state, formAction, pending, ref, e } = useResettingForm(action);
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3">
      <Field label="New due date" name="new_due_date" error={e.new_due_date}>
        <Input name="new_due_date" type="date" min={addDays(minDate, 1)} required />
      </Field>
      <Field label="Reason" name="extension_reason" hint="Recorded in the audit log" error={e.reason}>
        <Input name="extension_reason" required />
      </Field>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="ok">Extension approved.</Alert>}
      <div><Button type="submit" variant="secondary" disabled={pending}>Approve extension</Button></div>
    </form>
  );
}

export function CreditNoteForm({ action }: { action: Action }) {
  const { state, formAction, pending, ref, e } = useResettingForm(action);
  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3">
      <p className="text-xs text-muted">Issue the credit note in Swipe first, then record it here so the balance matches.</p>
      <Field label="Credit note number" name="credit_note_number" error={e.credit_note_number}><Input name="credit_note_number" required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" name="amount_minor" error={e.amount_minor}><Input name="amount_minor" inputMode="decimal" required /></Field>
        <Field label="Issued on" name="issued_on" error={e.issued_on}><Input name="issued_on" type="date" defaultValue={todayInBusinessTz()} required /></Field>
      </div>
      <Field label="Reason" name="credit_reason" error={e.reason}><Input name="credit_reason" /></Field>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="ok">Credit note recorded.</Alert>}
      <div><Button type="submit" variant="secondary" disabled={pending}>Record credit note</Button></div>
    </form>
  );
}
