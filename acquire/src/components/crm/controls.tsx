"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  createAppointmentAction, createTaskAction, logInteractionAction, setAppointmentStatusAction, setTaskStatusAction, type CrmFormState,
} from "@/app/(app)/crm-actions";
import {
  APPOINTMENT_KINDS, INTERACTION_KINDS, INTERACTION_OUTCOMES, TASK_PRIORITIES, appointmentKindLabel, interactionLabel,
  type AppointmentStatus, type InteractionKind,
} from "@/domain/labels";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";

type Member = { id: string; label: string };

function useReset(state: CrmFormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return ref;
}

/** Checkbox that completes or reopens a task. */
export function TaskToggle({ taskId, done, title }: { taskId: string; done: boolean; title: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <input
        type="checkbox"
        checked={done}
        disabled={pending}
        aria-label={done ? `Reopen “${title}”` : `Mark “${title}” done`}
        className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
        onChange={() => start(async () => {
          setError(null);
          try { await setTaskStatusAction(taskId, done ? "open" : "done"); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
        })}
      />
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </>
  );
}

export function AppointmentStatusMenu({ appointmentId, status }: { appointmentId: string; status: AppointmentStatus }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <label htmlFor={`appt-${appointmentId}`} className="sr-only">Outcome</label>
      <select
        id={`appt-${appointmentId}`}
        value={status}
        disabled={pending}
        onChange={(e) => start(async () => {
          setError(null);
          try { await setAppointmentStatusAction(appointmentId, e.target.value as AppointmentStatus); } catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
        })}
        className="rounded border border-line bg-surface px-1.5 py-0.5 text-xs"
      >
        <option value="scheduled">Scheduled</option>
        <option value="completed">Held</option>
        <option value="no_show">No-show</option>
        <option value="cancelled">Cancelled</option>
      </select>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </span>
  );
}

export function TaskForm({ leadId, members, canAssign, compact }: { leadId: string | null; members: Member[]; canAssign: boolean; compact?: boolean }) {
  const [state, action, pending] = useActionState<CrmFormState, FormData>(createTaskAction.bind(null, leadId), {});
  const ref = useReset(state);
  const e = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3">
      <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"}>
        <Field label="Task" name="title" error={e.title}><Input name="title" required maxLength={200} placeholder="Send floor plans" /></Field>
        <Field label="Due" name="due_at" error={e.due_at}><Input name="due_at" type="datetime-local" /></Field>
        <Field label="Priority" name="priority">
          <Select name="priority" defaultValue="normal">{TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</Select>
        </Field>
        {canAssign && (
          <Field label="Assignee" name="assignee_id">
            <Select name="assignee_id" defaultValue=""><option value="">Me</option>{members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>
          </Field>
        )}
      </div>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <div><Button type="submit" variant="secondary" disabled={pending}>{pending ? "Adding…" : "Add task"}</Button></div>
    </form>
  );
}

export function AppointmentForm({ leadId, members, canAssign, defaultTitle }: { leadId: string; members: Member[]; canAssign: boolean; defaultTitle: string }) {
  const [state, action, pending] = useActionState<CrmFormState, FormData>(createAppointmentAction.bind(null, leadId), {});
  const ref = useReset(state);
  const e = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" name="kind">
          <Select name="kind" defaultValue="viewing">{APPOINTMENT_KINDS.map((k) => <option key={k} value={k}>{appointmentKindLabel[k]}</option>)}</Select>
        </Field>
        <Field label="Length" name="duration_minutes">
          <Select name="duration_minutes" defaultValue="45">
            {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Title" name="title" error={e.title}><Input name="title" defaultValue={defaultTitle} required maxLength={200} /></Field>
      <Field label="Starts" name="starts_at" hint="Workspace time zone" error={e.starts_at}><Input name="starts_at" type="datetime-local" required /></Field>
      <Field label="Location" name="location" error={e.location}><Input name="location" maxLength={300} placeholder="Address, video link or phone" /></Field>
      {canAssign && (
        <Field label="With" name="assigned_to">
          <Select name="assigned_to" defaultValue=""><option value="">Me</option>{members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>
        </Field>
      )}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="ok">Booked. The lead moved to Appointment booked if it was at an earlier stage.</Alert>}
      <div><Button type="submit" variant="secondary" disabled={pending}>{pending ? "Booking…" : "Book appointment"}</Button></div>
    </form>
  );
}

export function InteractionForm({ leadId, blockedChannels }: { leadId: string; blockedChannels: string[] }) {
  const [state, action, pending] = useActionState<CrmFormState, FormData>(logInteractionAction.bind(null, leadId), {});
  const [kind, setKind] = useState<InteractionKind>("call");
  const [direction, setDirection] = useState("outbound");
  const ref = useReset(state);
  const e = state.fieldErrors ?? {};
  const channelFor: Record<InteractionKind, string> = { call: "phone_call", email: "email", sms: "sms", whatsapp: "whatsapp", meeting: "" };
  const warn = direction === "outbound" && blockedChannels.includes(channelFor[kind]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Type" name="kind">
          <Select name="kind" value={kind} onChange={(ev) => setKind(ev.target.value as InteractionKind)}>
            {INTERACTION_KINDS.map((k) => <option key={k} value={k}>{interactionLabel[k]}</option>)}
          </Select>
        </Field>
        <Field label="Direction" name="direction">
          <Select name="direction" value={direction} onChange={(ev) => setDirection(ev.target.value)}>
            <option value="outbound">We contacted them</option>
            <option value="inbound">They contacted us</option>
          </Select>
        </Field>
        <Field label="Outcome" name="outcome">
          <Select name="outcome" defaultValue="" key={kind}>
            <option value="">—</option>
            {INTERACTION_OUTCOMES[kind].map((o) => <option key={o} value={o}>{o.replaceAll("_", " ")}</option>)}
          </Select>
        </Field>
        <Field label="When" name="occurred_at" hint="Blank = now" error={e.occurred_at}><Input name="occurred_at" type="datetime-local" /></Field>
      </div>
      <Field label="Summary" name="summary" error={e.summary}>
        <Textarea name="summary" rows={2} maxLength={5000} placeholder="Wants 3 beds near schools; can view Saturday morning" />
      </Field>
      {warn && <Alert tone="warn">This channel shows <strong>Blocked</strong> for this lead. You can still record what happened, but don&apos;t initiate contact this way.</Alert>}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Log interaction"}</Button></div>
    </form>
  );
}
