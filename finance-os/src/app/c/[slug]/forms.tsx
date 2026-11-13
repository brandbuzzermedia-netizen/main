"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { MODULES, CORE_MODULES, type ModuleKey } from "@/domain/registry";
import {
  addMemberAction, aiSettingsAction, createDealAction, createMeetingAction, createTaskAction, emergencyStopAction, saveModulesAction, type FormState,
} from "./actions";

type Opt = { id: string; label: string };

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <Alert tone="danger">{state.error}</Alert>;
  if (state.ok) return <Alert tone="ok">{state.ok}</Alert>;
  return null;
}

export function DealForm({ slug, stages, people, canAssign }: { slug: string; stages: Opt[]; people: Opt[]; canAssign: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createDealAction.bind(null, slug), {});
  const f = state.fields ?? {};
  return (
    <form action={action} className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Deal name" name="title" error={f.title}><Input name="title" required maxLength={200} /></Field></div>
      <Field label="Account / company" name="account_name" error={f.account_name}><Input name="account_name" maxLength={200} /></Field>
      <Field label="Stage" name="stage_id" error={f.stage_id}>
        <Select name="stage_id" required>{stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
      </Field>
      <Field label="Value" name="value" hint="Excluding GST. Leave 0 if not known yet." error={f.value}><Input name="value" inputMode="decimal" defaultValue="0" /></Field>
      <Field label="Currency" name="currency" error={f.currency}><Input name="currency" defaultValue="INR" maxLength={3} /></Field>
      <Field label="Expected close" name="expected_close_on" error={f.expected_close_on}><Input type="date" name="expected_close_on" /></Field>
      <Field label="Source" name="source" error={f.source}><Input name="source" maxLength={80} placeholder="Referral, ad, form…" /></Field>
      <Field label="Next step" name="next_action" error={f.next_action}><Input name="next_action" maxLength={300} /></Field>
      <Field label="Next step due" name="next_action_on" error={f.next_action_on}><Input type="date" name="next_action_on" /></Field>
      {canAssign && (
        <Field label="Owner" name="owner_id" error={f.owner_id}>
          <Select name="owner_id" defaultValue=""><option value="">Me</option>{people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
        </Field>
      )}
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="is_hot" /> Hot deal</label>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <Feedback state={state} />
        <div><Button type="submit" variant="company" disabled={pending}>{pending ? "Saving…" : "Create deal"}</Button></div>
      </div>
    </form>
  );
}

export function MeetingForm({ slug, deals, people, canAssign, today }: { slug: string; deals: Opt[]; people: Opt[]; canAssign: boolean; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createMeetingAction.bind(null, slug), {});
  const f = state.fields ?? {};
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Title" name="title" error={f.title}><Input name="title" required maxLength={200} /></Field></div>
      <Field label="Date" name="date" error={f.date}><Input type="date" name="date" defaultValue={today} required /></Field>
      <Field label="Time (IST)" name="time" error={f.time}><Input type="time" name="time" defaultValue="11:00" required /></Field>
      <Field label="Duration (minutes)" name="duration" error={f.duration}><Input type="number" name="duration" defaultValue={30} min={5} max={600} /></Field>
      <Field label="Deal" name="deal_id" error={f.deal_id}>
        <Select name="deal_id" defaultValue=""><option value="">None</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</Select>
      </Field>
      <Field label="Location or link" name="location"><Input name="location" maxLength={200} /></Field>
      {canAssign && (
        <Field label="Owner" name="owner_id"><Select name="owner_id" defaultValue=""><option value="">Me</option>{people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></Field>
      )}
      <div className="flex flex-col gap-3 sm:col-span-2"><Feedback state={state} /><div><Button type="submit" variant="company" disabled={pending}>{pending ? "Saving…" : "Add meeting"}</Button></div></div>
    </form>
  );
}

export function TaskForm({ slug, people, canAssign }: { slug: string; people: Opt[]; canAssign: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTaskAction.bind(null, slug), {});
  const f = state.fields ?? {};
  return (
    <form action={action} id="new" className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Task" name="title" error={f.title}><Input name="title" required maxLength={200} /></Field></div>
      <Field label="Due" name="due_on" error={f.due_on}><Input type="date" name="due_on" /></Field>
      <Field label="Priority" name="priority"><Select name="priority" defaultValue="normal">{["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>
      {canAssign && (
        <Field label="Assign to" name="assignee_id"><Select name="assignee_id" defaultValue=""><option value="">Me</option>{people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></Field>
      )}
      <div className="sm:col-span-2"><Field label="Details" name="details"><Textarea name="details" maxLength={2000} /></Field></div>
      <div className="flex flex-col gap-3 sm:col-span-2"><Feedback state={state} /><div><Button type="submit" variant="company" disabled={pending}>{pending ? "Saving…" : "Add task"}</Button></div></div>
    </form>
  );
}

export function MemberForm({ slug, roles }: { slug: string; roles: Opt[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addMemberAction.bind(null, slug), {});
  const f = state.fields ?? {};
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
      <Field label="Email" name="email" error={f.email}><Input type="email" name="email" required /></Field>
      <Field label="Role" name="role" error={f.role}><Select name="role" defaultValue="staff">{roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></Field>
      <Button type="submit" variant="company" disabled={pending}>{pending ? "Adding…" : "Add member"}</Button>
      <div className="sm:col-span-3"><Feedback state={state} /></div>
    </form>
  );
}

export function SettingsForm({ slug, enabled, sidebar, accent }: { slug: string; enabled: ModuleKey[]; sidebar: string; accent: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveModulesAction.bind(null, slug), {});
  const f = state.fields ?? {};
  return (
    <form action={action} className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Modules</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODULES.map((m) => {
            const core = CORE_MODULES.includes(m.key);
            return (
              <label key={m.key} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <input type="checkbox" name="modules" value={m.key} defaultChecked={enabled.includes(m.key) || core} disabled={core} />
                <span className="flex-1">{m.label}</span>
                {m.phase > 0 && <span className="text-[10px] text-faint uppercase">Phase {m.phase}</span>}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="grid max-w-md gap-3 sm:grid-cols-2">
        <Field label="Sidebar colour" name="sidebar_color" error={f.sidebar_color}><Input name="sidebar_color" defaultValue={sidebar} pattern="#[0-9A-Fa-f]{6}" /></Field>
        <Field label="Accent colour" name="accent_color" error={f.accent_color}><Input name="accent_color" defaultValue={accent} pattern="#[0-9A-Fa-f]{6}" /></Field>
      </div>
      <Feedback state={state} />
      <div><Button type="submit" variant="company" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button></div>
    </form>
  );
}

export function StopForm({ slug, stopped }: { slug: string; stopped: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(emergencyStopAction.bind(null, slug), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="on" value={stopped ? "false" : "true"} />
      {!stopped && (
        <Field label="Reason" name="reason" hint="Recorded with your name and the time in the audit log." error={state.fields?.reason}>
          <Input name="reason" required minLength={5} maxLength={300} />
        </Field>
      )}
      <Feedback state={state} />
      <div><Button type="submit" variant={stopped ? "company" : "danger"} disabled={pending}>{stopped ? "Resume company" : "Stop all outbound activity"}</Button></div>
    </form>
  );
}

export function AiSettingsForm({ slug, enabled, limit, selfLimit }: { slug: string; enabled: boolean; limit: number; selfLimit: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(aiSettingsAction.bind(null, slug), {});
  return (
    <form action={action} className="grid max-w-xl gap-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ai_enabled" defaultChecked={enabled} /> Allow Claude to read bills and draft follow-ups for this company</label>
      <Field label="Monthly AI token budget" name="ai_monthly_token_limit" hint="Requests stop when the month's budget is used."><Input name="ai_monthly_token_limit" type="number" min={0} defaultValue={limit} /></Field>
      <Field label="Self-approval limit (₹)" name="self_approval_limit" hint="Ledger entries above this need a second person to approve. 0 means always a second person."><Input name="self_approval_limit" inputMode="decimal" defaultValue={selfLimit} /></Field>
      <Feedback state={state} />
      <div><Button type="submit" variant="company" disabled={pending}>Save</Button></div>
    </form>
  );
}
