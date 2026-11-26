"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "../actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export function ContactForm({ action }: { action: (prev: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const e = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={formAction} className="grid gap-3 sm:grid-cols-3">
      <Field label="Name" name="name" error={e.name}><Input name="name" required /></Field>
      <Field label="Email" name="email" error={e.email}><Input name="email" type="email" /></Field>
      <Field label="WhatsApp" name="whatsapp" error={e.whatsapp}><Input name="whatsapp" inputMode="tel" placeholder="+91 98450 12345" /></Field>
      <div className="flex flex-col gap-2 text-sm sm:col-span-3">
        <label className="flex gap-2"><input type="checkbox" name="is_primary" /> Primary billing contact</label>
        <label className="flex gap-2"><input type="checkbox" name="receives_reminders" defaultChecked /> Receives payment reminders</label>
        <label className="flex gap-2"><input type="checkbox" name="whatsapp_consent" /> Has opted in to WhatsApp billing messages</label>
      </div>
      <div className="sm:col-span-3">
        <Field label="Opt-in evidence" name="whatsapp_consent_note" hint="Required with opt-in, e.g. 'Agreed by email on 12 Oct 2026, signed SOW clause 6'" error={e.whatsapp_consent_note}>
          <Input name="whatsapp_consent_note" />
        </Field>
      </div>
      {state.error && <div className="sm:col-span-3"><Alert tone="danger">{state.error}</Alert></div>}
      <div><Button type="submit" variant="secondary" disabled={pending}>{pending ? "Adding…" : "Add contact"}</Button></div>
    </form>
  );
}
