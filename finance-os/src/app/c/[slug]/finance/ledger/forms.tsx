"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { createEntryAction, transferAction, type LedgerState } from "./actions";
import { LEDGER_TYPE_LABELS, type LedgerType } from "@/domain/ledger";

type Opt = { id: string; label: string };
const Feedback = ({ s }: { s: LedgerState }) => (s.error ? <Alert tone="danger">{s.error}</Alert> : s.ok ? <Alert tone="ok">{s.ok}</Alert> : null);

export function EntryForm({ slug, entities, units, today }: { slug: string; entities: Opt[]; units: Opt[]; today: string }) {
  const [s, action, pending] = useActionState<LedgerState, FormData>(createEntryAction.bind(null, slug), {});
  const [type, setType] = useState<LedgerType>("expense");
  const [currency, setCurrency] = useState("INR");
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Type" name="entry_type">
        <Select name="entry_type" value={type} onChange={(e) => setType(e.target.value as LedgerType)}>
          {(Object.keys(LEDGER_TYPE_LABELS) as LedgerType[]).filter((t) => !t.startsWith("transfer")).map((t) => <option key={t} value={t}>{LEDGER_TYPE_LABELS[t]}</option>)}
        </Select>
      </Field>
      <Field label="Legal entity" name="legal_entity_id"><Select name="legal_entity_id">{entities.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select></Field>
      <Field label="Category" name="category"><Input name="category" required maxLength={60} placeholder="Software, Retainer, Repairs…" /></Field>
      <Field label="Counterparty" name="counterparty"><Input name="counterparty" maxLength={200} /></Field>
      <div className="sm:col-span-2"><Field label="Description" name="description"><Input name="description" required maxLength={300} /></Field></div>
      <Field label="Date" name="txn_date"><Input type="date" name="txn_date" defaultValue={today} required /></Field>
      <Field label="Due on" name="due_on"><Input type="date" name="due_on" /></Field>
      <Field label="Amount" name="amount"><Input name="amount" inputMode="decimal" required /></Field>
      <Field label="Currency" name="currency"><Input name="currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></Field>
      {currency !== "INR" && (
        <>
          <Field label="FX rate to INR" name="fx_rate" hint="Required before approval. Indicative rates are not booked values."><Input name="fx_rate" inputMode="decimal" /></Field>
          <Field label="Rate date" name="fx_rate_date"><Input type="date" name="fx_rate_date" /></Field>
        </>
      )}
      {(type === "expense" || type === "write_off") && units.length > 0 && (
        <Field label="Rental unit (optional)" name="rental_unit_id"><Select name="rental_unit_id" defaultValue=""><option value="">None</option>{units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</Select></Field>
      )}
      <div className="flex flex-col gap-3 sm:col-span-2">
        <Feedback s={s} />
        <div className="flex gap-2">
          <Button type="submit" name="submit" value="1" variant="company" disabled={pending}>Submit for approval</Button>
          <Button type="submit" variant="secondary" disabled={pending}>Save draft</Button>
        </div>
      </div>
    </form>
  );
}

export function TransferForm({ slug, companies, today }: { slug: string; companies: Opt[]; today: string }) {
  const [s, action, pending] = useActionState<LedgerState, FormData>(transferAction.bind(null, slug), {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="To company" name="to"><Select name="to">{companies.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
      <Field label="Amount" name="amount"><Input name="amount" inputMode="decimal" required /></Field>
      <Field label="Date" name="on"><Input type="date" name="on" defaultValue={today} required /></Field>
      <Field label="Bank reference" name="reference"><Input name="reference" required /></Field>
      <div className="sm:col-span-2"><Field label="Purpose" name="description"><Input name="description" required /></Field></div>
      <div className="flex flex-col gap-3 sm:col-span-2"><Feedback s={s} /><div><Button type="submit" variant="secondary" disabled={pending}>Record transfer</Button></div></div>
    </form>
  );
}
