"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addNoteAction, eraseLeadAction, recordConsentAction, suppressAction, type FormState } from "../actions";
import { BASES, CHANNELS } from "@/domain/eligibility";
import { SUPPRESSION_REASONS, basisLabel, channelLabel, suppressionReasonLabel } from "@/domain/labels";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";

function useResetOnSuccess(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function NoteForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addNoteAction.bind(null, leadId), {});
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <label htmlFor="summary" className="sr-only">Add a note</label>
      <Textarea name="summary" placeholder="Add a note: what was said, what happens next" maxLength={5000} rows={2} />
      {(state.error || state.fieldErrors?.summary) && <Alert tone="danger">{state.error ?? state.fieldErrors?.summary?.[0]}</Alert>}
      <div><Button type="submit" variant="secondary" disabled={pending}>{pending ? "Saving…" : "Add note"}</Button></div>
    </form>
  );
}

export function ConsentForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(recordConsentAction.bind(null, leadId), {});
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("granted");
  const ref = useResetOnSuccess(state);
  const e = state.fieldErrors ?? {};
  if (!open) {
    return <button type="button" className="mt-3 text-sm text-brand underline-offset-2 hover:underline" onClick={() => setOpen(true)}>Record consent or withdrawal</button>;
  }
  return (
    <form ref={ref} action={action} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Channel" name="channel" error={e.channel}>
          <Select name="channel">{CHANNELS.map((c) => <option key={c} value={c}>{channelLabel[c]}</option>)}</Select>
        </Field>
        <Field label="Status" name="status" error={e.status}>
          <Select name="status" value={status} onChange={(ev) => setStatus(ev.target.value)}>
            <option value="granted">Granted</option>
            <option value="withdrawn">Withdrawn</option>
          </Select>
        </Field>
      </div>
      {status === "granted" && (
        <Field label="Basis" name="basis" error={e.basis}>
          <Select name="basis" defaultValue="">
            <option value="" disabled>Choose…</option>
            {BASES.map((b) => <option key={b} value={b}>{basisLabel[b]}</option>)}
          </Select>
        </Field>
      )}
      <Field label="How and where" name="source" hint="e.g. “Website form /valuation, SMS checkbox (wording v3)” or “Verbal on recorded call 12 Oct”" error={e.source}>
        <Input name="source" required minLength={3} maxLength={500} />
      </Field>
      <Field label="Evidence link (optional)" name="evidence_url" error={e.evidence_url}>
        <Input name="evidence_url" type="url" placeholder="https://" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Captured (optional)" name="captured_at" hint="Workspace time zone; defaults to now" error={e.captured_at}>
          <Input name="captured_at" type="datetime-local" />
        </Field>
        {status === "granted" && (
          <Field label="Expires (optional)" name="expires_at" error={e.expires_at}>
            <Input name="expires_at" type="datetime-local" />
          </Field>
        )}
      </div>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="ok">Recorded. The eligibility panel has been updated.</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

export function SuppressForm({ leadId, hasEmail, hasPhone }: { leadId: string; hasEmail: boolean; hasPhone: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(suppressAction.bind(null, leadId), {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button type="button" className="mt-3 text-sm text-brand underline-offset-2 hover:underline" onClick={() => setOpen(true)}>Record an opt-out</button>;
  }
  return (
    <form action={action} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Suppress" name="target">
          <Select name="target" defaultValue={hasEmail && hasPhone ? "both" : hasEmail ? "email" : "phone"}>
            {hasEmail && hasPhone && <option value="both">Email and phone</option>}
            {hasEmail && <option value="email">Email</option>}
            {hasPhone && <option value="phone">Phone</option>}
          </Select>
        </Field>
        <Field label="For" name="channel">
          <Select name="channel" defaultValue="all">
            <option value="all">All channels</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{channelLabel[c]}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Reason" name="reason">
        <Select name="reason" defaultValue="opt_out">
          {SUPPRESSION_REASONS.filter((r) => r !== "erasure").map((r) => <option key={r} value={r}>{suppressionReasonLabel[r]}</option>)}
        </Select>
      </Field>
      <Field label="Note (optional)" name="source">
        <Input name="source" maxLength={300} placeholder="Said “please stop calling” on 26 Oct" />
      </Field>
      <p className="text-xs text-muted">An all-channel opt-out moves the lead to Opted out. Only an agency admin can lift it.</p>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="ok">Suppressed. No automated outreach will reach this contact.</Alert>}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>{pending ? "Saving…" : "Suppress"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

export function EraseForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(eraseLeadAction.bind(null, leadId), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        For a deletion request. Removes the lead, its timeline and consent history, and redacts it from the audit log. This cannot be undone.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="keep_suppression" defaultChecked className="mt-0.5 size-4" />
        <span>Keep their email and phone on the suppression list so a future import cannot contact them again (recommended).</span>
      </label>
      <Field label="Type ERASE to confirm" name="confirm" error={state.fieldErrors?.confirm}>
        <Input name="confirm" autoComplete="off" />
      </Field>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <div><Button type="submit" variant="danger" disabled={pending}>{pending ? "Erasing…" : "Erase permanently"}</Button></div>
    </form>
  );
}
