"use client";

import { useActionState, useEffect, useRef } from "react";
import { addSourceAction, addStageAction, inviteMemberAction, updateSettingsAction, type FormState } from "./actions";
import { addDealStageAction, type CrmFormState } from "../crm-actions";
import { ROLES, SOURCE_KINDS, STAGE_CATEGORIES, roleLabel, sourceKindLabel } from "@/domain/labels";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";

function useReset(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return ref;
}

export function WorkspaceForm({ name, timezone, windowStart, windowEnd, inquiryDays, disabled }: {
  name: string; timezone: string; windowStart: string; windowEnd: string; inquiryDays: number; disabled: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateSettingsAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <Field label="Workspace name" name="name" error={e.name}><Input name="name" defaultValue={name} required /></Field>
        <Field label="Time zone" name="timezone" hint="Used for dates, “today” and follow-up times" error={e.timezone}><Input name="timezone" defaultValue={timezone} required /></Field>
        <Field label="Contact window starts" name="contact_window_start" hint="Recipient's local time. Statutory hours still apply; the stricter wins." error={e.contact_window_start}>
          <Input name="contact_window_start" type="time" defaultValue={windowStart} required />
        </Field>
        <Field label="Contact window ends" name="contact_window_end" error={e.contact_window_end}>
          <Input name="contact_window_end" type="time" defaultValue={windowEnd} required />
        </Field>
        <Field label="Enquiry counts as implied consent for (days)" name="implied_inquiry_days" hint="Capped by each market's own limit (US calls: 90, Canada: 180)." error={e.implied_inquiry_days}>
          <Input name="implied_inquiry_days" type="number" min={1} max={730} defaultValue={inquiryDays} required />
        </Field>
      </fieldset>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="ok">{state.message}</Alert>}
      {!disabled && <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button></div>}
    </form>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteMemberAction, {});
  const ref = useReset(state);
  const e = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
      <div className="flex-1"><Field label="Email" name="email" error={e.email}><Input name="email" type="email" required /></Field></div>
      <div className="sm:w-48">
        <Field label="Role" name="role" error={e.role}>
          <Select name="role" defaultValue="sales_rep">{ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}</Select>
        </Field>
      </div>
      <div className="sm:pt-6"><Button type="submit" disabled={pending}>{pending ? "Inviting…" : "Invite"}</Button></div>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="ok">{state.message}</Alert>}
    </form>
  );
}

export function AddStageForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addStageAction, {});
  const ref = useReset(state);
  const e = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex-1"><Field label="New stage" name="name" error={e.name}><Input name="name" required maxLength={60} placeholder="Viewing scheduled" /></Field></div>
      <div className="sm:w-44">
        <Field label="Counts as" name="category" error={e.category}>
          <Select name="category" defaultValue="working">{STAGE_CATEGORIES.filter((c) => c !== "opted_out").map((c) => <option key={c} value={c}>{c}</option>)}</Select>
        </Field>
      </div>
      <div className="sm:pt-6"><Button type="submit" variant="secondary" disabled={pending}>Add stage</Button></div>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
    </form>
  );
}

export function AddSourceForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addSourceAction, {});
  const ref = useReset(state);
  const e = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Name" name="name" error={e.name}><Input name="name" required maxLength={80} placeholder="Spring open houses" /></Field>
      <Field label="Kind" name="kind" error={e.kind}>
        <Select name="kind" defaultValue="web_form">{SOURCE_KINDS.map((k) => <option key={k} value={k}>{sourceKindLabel[k]}</option>)}</Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Provenance" name="provenance_note" hint="Where the data comes from and on what terms: form URL, provider and licence, contract reference." error={e.provenance_note}>
          <Textarea name="provenance_note" rows={2} maxLength={1000} />
        </Field>
      </div>
      {state.error && <div className="sm:col-span-2"><Alert tone="danger">{state.error}</Alert></div>}
      <div><Button type="submit" variant="secondary" disabled={pending}>Add source</Button></div>
    </form>
  );
}

export function AddDealStageForm() {
  const [state, action, pending] = useActionState<CrmFormState, FormData>(addDealStageAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  const e = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex-1"><Field label="New deal stage" name="name" error={e.name}><Input name="name" required maxLength={60} placeholder="Mortgage approved" /></Field></div>
      <div className="sm:w-36"><Field label="Probability %" name="probability" error={e.probability}><Input name="probability" type="number" min={0} max={100} defaultValue={50} required /></Field></div>
      <div className="sm:pt-6"><Button type="submit" variant="secondary" disabled={pending}>Add stage</Button></div>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
    </form>
  );
}
