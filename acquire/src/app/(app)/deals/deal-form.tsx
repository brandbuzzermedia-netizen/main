"use client";

import { useActionState } from "react";
import type { CrmFormState } from "../crm-actions";
import type { Deal, DealStage } from "@/lib/db-types";
import { DEAL_TYPES, dealTypeLabel } from "@/domain/labels";
import { minorToInput } from "@/domain/money";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";

export function DealForm({
  action, deal, stages, members, canAssign, defaultCurrency, defaultTitle, submitLabel,
}: {
  action: (prev: CrmFormState, fd: FormData) => Promise<CrmFormState>;
  deal?: Deal;
  stages: DealStage[];
  members: { id: string; label: string }[];
  canAssign: boolean;
  defaultCurrency: string;
  defaultTitle?: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const e = state.fieldErrors ?? {};
  const currency = deal?.currency ?? defaultCurrency;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="ok">Saved.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Deal name" name="title" error={e.title}>
          <Input name="title" defaultValue={deal?.title ?? defaultTitle} required maxLength={200} placeholder="12 Oak St purchase" />
        </Field>
        <Field label="Type" name="deal_type" error={e.deal_type}>
          <Select name="deal_type" defaultValue={deal?.deal_type ?? "purchase"}>
            {DEAL_TYPES.map((t) => <option key={t} value={t}>{dealTypeLabel[t]}</option>)}
          </Select>
        </Field>
        <Field label="Property value" name="value" hint="Price, or annual rent for rentals" error={e.value}>
          <Input name="value" inputMode="decimal" defaultValue={minorToInput(deal?.value_minor, currency)} placeholder="650k" />
        </Field>
        <Field label="Expected commission" name="commission" hint="Your revenue from this deal" error={e.commission}>
          <Input name="commission" inputMode="decimal" defaultValue={minorToInput(deal?.commission_minor, currency)} placeholder="19500" />
        </Field>
        <Field label="Currency" name="currency" error={e.currency}>
          <Input name="currency" defaultValue={currency} maxLength={3} className="uppercase" />
        </Field>
        <Field label="Stage" name="stage_id" error={e.stage_id}>
          <Select name="stage_id" defaultValue={deal?.stage_id ?? stages[0]?.id}>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}{s.category === "open" ? ` (${s.probability}%)` : ""}</option>)}
          </Select>
        </Field>
        <Field label="Owner" name="owner_id" hint={canAssign ? undefined : "Deals you open are yours."} error={e.owner_id}>
          <Select name="owner_id" defaultValue={deal?.owner_id ?? ""} disabled={!canAssign}>
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </Select>
        </Field>
        <Field label="Expected close" name="expected_close_date" error={e.expected_close_date}>
          <Input name="expected_close_date" type="date" defaultValue={deal?.expected_close_date ?? ""} />
        </Field>
        <Field label="Property" name="property_ref" hint="Address, listing ID or link" error={e.property_ref}>
          <Input name="property_ref" defaultValue={deal?.property_ref ?? ""} maxLength={300} />
        </Field>
        <Field label="Lost reason" name="lost_reason" hint="If it is closed lost" error={e.lost_reason}>
          <Input name="lost_reason" defaultValue={deal?.lost_reason ?? ""} maxLength={300} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes" name="notes" error={e.notes}><Textarea name="notes" defaultValue={deal?.notes ?? ""} maxLength={5000} /></Field>
        </div>
      </div>
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button></div>
    </form>
  );
}
