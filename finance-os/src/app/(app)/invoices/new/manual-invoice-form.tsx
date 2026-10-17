"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createManualInvoiceAction, type ManualState } from "../actions";
import { todayInBusinessTz } from "@/domain/dates";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";

export function ManualInvoiceForm({ clients, defaultClient }: { clients: { id: string; name: string }[]; defaultClient?: string }) {
  const [state, action, pending] = useActionState<ManualState, FormData>(createManualInvoiceAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error && (
        <Alert tone="danger">
          {state.error} {state.existingId && <Link className="underline" href={`/invoices/${state.existingId}`}>Open it</Link>}
        </Alert>
      )}
      <Card title="Invoice reference (copy from Swipe)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client" name="client_id" error={e.client_id}>
            <Select name="client_id" defaultValue={defaultClient ?? ""} required>
              <option value="" disabled>Choose a client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Invoice number" name="invoice_number" hint="Exactly as on the Swipe invoice" error={e.invoice_number}>
            <Input name="invoice_number" required />
          </Field>
          <Field label="Invoice date" name="invoice_date" error={e.invoice_date}>
            <Input name="invoice_date" type="date" defaultValue={todayInBusinessTz()} required />
          </Field>
          <Field label="Due date" name="due_date" hint="Leave blank to use the client's payment terms" error={e.due_date}>
            <Input name="due_date" type="date" />
          </Field>
          <Field label="Billing period start" name="billing_period_start" error={e.billing_period_start}>
            <Input name="billing_period_start" type="date" />
          </Field>
          <Field label="Billing period end" name="billing_period_end" error={e.billing_period_end}>
            <Input name="billing_period_end" type="date" />
          </Field>
        </div>
      </Card>
      <Card title="Amounts">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Subtotal (₹)" name="subtotal_minor" hint="Taxable value" error={e.subtotal_minor}>
            <Input name="subtotal_minor" inputMode="decimal" />
          </Field>
          <Field label="GST (₹)" name="tax_minor" error={e.tax_minor}>
            <Input name="tax_minor" inputMode="decimal" />
          </Field>
          <Field label="Invoice total (₹)" name="total_minor" error={e.total_minor}>
            <Input name="total_minor" inputMode="decimal" required />
          </Field>
        </div>
      </Card>
      <Card title="Link to the official invoice">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Swipe invoice / PDF link" name="pdf_url" hint="Optional. Used in reminders so clients can open the official invoice." error={e.pdf_url}>
            <Input name="pdf_url" type="url" placeholder="https://" />
          </Field>
          <Field label="Swipe document ID" name="external_id" hint="Optional. Lets a later API sync match this invoice." error={e.external_id}>
            <Input name="external_id" />
          </Field>
        </div>
      </Card>
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save invoice reference"}</Button></div>
    </form>
  );
}
