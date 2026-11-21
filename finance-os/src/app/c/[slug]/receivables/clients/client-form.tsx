"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";
import type { Client } from "@/lib/db-types";
import { minorToInput } from "@/domain/money";
import { todayInBusinessTz } from "@/domain/dates";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";

type Member = { id: string; label: string };

export function ClientForm({
  action,
  client,
  members,
  isNew,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  client?: Client;
  members: Member[];
  isNew: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Card title="Billing identity">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client code" name="client_code" hint="Short unique ID, e.g. SHOBHA" error={e.client_code}>
            <Input name="client_code" defaultValue={client?.client_code} required maxLength={32} className="uppercase" />
          </Field>
          <Field label="Legal billing name" name="legal_name" hint="Exactly as on the Swipe invoice" error={e.legal_name}>
            <Input name="legal_name" defaultValue={client?.legal_name} required />
          </Field>
          <Field label="Brand / trading name" name="trading_name" error={e.trading_name}>
            <Input name="trading_name" defaultValue={client?.trading_name ?? ""} />
          </Field>
          <Field label="GSTIN" name="gstin" hint="Used to match Swipe exports exactly" error={e.gstin}>
            <Input name="gstin" defaultValue={client?.gstin ?? ""} maxLength={15} className="uppercase" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Names in Swipe" name="source_aliases" hint="Other customer names this client appears under in Swipe exports. One per line or comma-separated." error={e.source_aliases}>
              <Textarea name="source_aliases" defaultValue={client?.source_aliases.join("\n")} rows={2} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Commercial terms">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Monthly retainer (₹)" name="monthly_retainer_minor" hint="Before GST" error={e.monthly_retainer_minor}>
            <Input name="monthly_retainer_minor" inputMode="decimal" defaultValue={minorToInput(client?.monthly_retainer_minor ?? 0)} required />
          </Field>
          <Field label="Billing frequency" name="billing_frequency" error={e.billing_frequency}>
            <Select name="billing_frequency" defaultValue={client?.billing_frequency ?? "monthly"}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="half_yearly">Half-yearly</option>
              <option value="yearly">Yearly</option>
              <option value="one_time">One-time</option>
            </Select>
          </Field>
          <Field label="Invoice day of month" name="invoice_day" hint="1–28" error={e.invoice_day}>
            <Input name="invoice_day" type="number" min={1} max={28} defaultValue={client?.invoice_day ?? 1} />
          </Field>
          <Field label="Payment terms (days)" name="payment_terms_days" hint="Used when Swipe has no due date" error={e.payment_terms_days}>
            <Input name="payment_terms_days" type="number" min={0} max={180} defaultValue={client?.payment_terms_days ?? 7} required />
          </Field>
          <Field label="Service status" name="service_status" error={e.service_status}>
            <Select name="service_status" defaultValue={client?.service_status ?? "active"}>
              <option value="onboarding">Onboarding</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="suspended">Suspended</option>
              <option value="offboarded">Offboarded</option>
            </Select>
          </Field>
          <Field label="Account owner" name="account_owner_id" error={e.account_owner_id}>
            <Select name="account_owner_id" defaultValue={client?.account_owner_id ?? ""}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" name="communication_paused" defaultChecked={client?.communication_paused} className="mt-0.5" />
          <span>
            Pause automated reminders for this client
            <span className="block text-xs text-muted">Invoices still age; the founder still gets escalations.</span>
          </span>
        </label>
      </Card>

      {isNew && (
        <Card title="Contract and primary billing contact">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Contract start" name="contract_start_date" error={e.contract_start_date}>
              <Input name="contract_start_date" type="date" defaultValue={todayInBusinessTz()} required />
            </Field>
            <Field label="Contract end" name="contract_end_date" hint="Leave blank if rolling" error={e.contract_end_date}>
              <Input name="contract_end_date" type="date" />
            </Field>
            <Field label="Final deadline (days after due)" name="final_deadline_days" hint="When suspension goes to founder review" error={e.final_deadline_days}>
              <Input name="final_deadline_days" type="number" min={1} max={365} defaultValue={21} required />
            </Field>
            <Field label="Contact name" name="contact_name" error={e.contact_name}>
              <Input name="contact_name" />
            </Field>
            <Field label="Billing email" name="contact_email" error={e.contact_email}>
              <Input name="contact_email" type="email" />
            </Field>
            <Field label="WhatsApp number" name="contact_whatsapp" hint="Consent is recorded per contact later" error={e.contact_whatsapp}>
              <Input name="contact_whatsapp" inputMode="tel" placeholder="+91 98450 12345" />
            </Field>
          </div>
        </Card>
      )}

      <Card title="Notes">
        <Textarea name="notes" defaultValue={client?.notes ?? ""} rows={3} />
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : isNew ? "Create client" : "Save changes"}</Button>
      </div>
    </form>
  );
}
