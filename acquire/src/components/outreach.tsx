"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  applyQualificationAction, enrollLeadAction, enrollStageAction, markThreadReadAction, qualifyLeadAction, saveCampaignAction,
  saveSendingSettingsAction, saveTemplateAction, sendMessageAction, setEnrollmentStatusAction, type OutreachState,
} from "@/app/(app)/outreach-actions";
import { smsSegments } from "@/domain/sms";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";

type TemplateOption = { id: string; name: string; channel: "email" | "sms" };

function useReset(state: OutreachState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return ref;
}

function Result({ state }: { state: OutreachState }) {
  if (state.error) return <Alert tone="danger">{state.error}</Alert>;
  if (state.message) return <Alert tone="ok">{state.message}</Alert>;
  return null;
}

export function MessageComposer({ leadId, templates, channelStatus }: {
  leadId: string;
  templates: TemplateOption[];
  channelStatus: Record<"email" | "sms", { decision: string; note: string }>;
}) {
  const [state, action, pending] = useActionState<OutreachState, FormData>(sendMessageAction.bind(null, leadId), {});
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [templateId, setTemplateId] = useState("");
  const [length, setLength] = useState(0);
  const ref = useReset(state);
  const status = channelStatus[channel];
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Channel" name="channel">
          <Select name="channel" value={channel} onChange={(e) => { setChannel(e.target.value as "email" | "sms"); setTemplateId(""); }}>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </Select>
        </Field>
        <Field label="Template" name="template_id">
          <Select name="template_id" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Write my own</option>
            {templates.filter((t) => t.channel === channel).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      </div>
      {!templateId && (
        <>
          {channel === "email" && <Field label="Subject" name="subject" error={state.fieldErrors?.subject}><Input name="subject" maxLength={200} /></Field>}
          <Field label="Message" name="body" hint={channel === "sms" ? `${length} characters. Variables like {{first_name}} work here.` : "Variables like {{first_name}} work here. An unsubscribe footer is added automatically."} error={state.fieldErrors?.body}>
            <Textarea name="body" rows={4} maxLength={5000} onChange={(e) => setLength(e.target.value.length)} />
          </Field>
        </>
      )}
      <p className="text-xs text-muted">
        Eligibility right now: <strong>{status.decision}</strong>{status.note && ` — ${status.note}`}. It is checked again at the moment of sending.
      </p>
      <Result state={state} />
      <div><Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send"}</Button></div>
    </form>
  );
}

export function MarkReadButton({ leadId }: { leadId: string }) {
  const [pending, start] = useTransition();
  return <button type="button" disabled={pending} onClick={() => start(() => markThreadReadAction(leadId))} className="text-xs text-brand underline-offset-2 hover:underline">Mark replies read</button>;
}

export function EnrollForm({ leadId, campaigns }: { leadId: string; campaigns: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<OutreachState, FormData>(enrollLeadAction.bind(null, leadId), {});
  if (campaigns.length === 0) return <p className="text-sm text-muted">No active sequences. A manager can create one under Campaigns.</p>;
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <label htmlFor="campaign_id" className="sr-only">Sequence</label>
        <Select name="campaign_id" defaultValue="">
          <option value="" disabled>Choose a sequence…</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Button type="submit" variant="secondary" disabled={pending}>Enroll</Button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function EnrollmentButton({ enrollmentId, to, label }: { enrollmentId: string; to: "active" | "stopped"; label: string }) {
  const [pending, start] = useTransition();
  return <button type="button" disabled={pending} onClick={() => start(() => setEnrollmentStatusAction(enrollmentId, to))} className="text-xs text-brand underline-offset-2 hover:underline">{label}</button>;
}

export function QualifyButton({ leadId, enabled }: { leadId: string; enabled: boolean }) {
  const [state, action, pending] = useActionState<OutreachState, FormData>(() => qualifyLeadAction(leadId), {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <div><Button type="submit" variant="secondary" disabled={!enabled || pending}>{pending ? "Assessing… (can take a minute)" : "Assess with AI"}</Button></div>
      {!enabled && <p className="text-xs text-muted">AI is not connected (ANTHROPIC_API_KEY).</p>}
      <Result state={state} />
    </form>
  );
}

export function ApplyQualification({ runId, hasStage }: { runId: string; hasStage: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (stage: boolean) => start(async () => {
    setError(null);
    try { await applyQualificationAction(runId, stage); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  });
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <Button type="button" variant="secondary" disabled={pending} onClick={() => run(false)}>Apply score</Button>
      {hasStage && <Button type="button" variant="secondary" disabled={pending} onClick={() => run(true)}>Apply score and stage</Button>}
      {error && <span role="alert" className="text-danger">{error}</span>}
    </div>
  );
}

export function TemplateForm({ template }: { template?: { id: string; name: string; channel: "email" | "sms"; subject: string | null; body: string } }) {
  const [state, action, pending] = useActionState<OutreachState, FormData>(saveTemplateAction.bind(null, template?.id ?? null), {});
  const [channel, setChannel] = useState(template?.channel ?? "email");
  const [body, setBody] = useState(template?.body ?? "");
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" name="name" error={e.name}><Input name="name" defaultValue={template?.name} required maxLength={80} /></Field>
        <Field label="Channel" name="channel">
          <Select name="channel" value={channel} onChange={(ev) => setChannel(ev.target.value as "email" | "sms")} disabled={Boolean(template)}>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </Select>
        </Field>
      </div>
      {template && <input type="hidden" name="channel" value={channel} />}
      {channel === "email" && <Field label="Subject" name="subject" error={e.subject}><Input name="subject" defaultValue={template?.subject ?? ""} maxLength={200} /></Field>}
      <Field label="Message" name="body" hint={`Variables: {{first_name}}, {{full_name}}, {{preferred_location}}, {{property_interest}}, {{agent_name}}, {{company}}.${channel === "sms" ? ` ${smsSegments(body || " ")} segment(s).` : ""} Claims such as “only 3 units left” must be true.`} error={e.body}>
        <Textarea name="body" rows={channel === "sms" ? 3 : 8} value={body} onChange={(ev) => setBody(ev.target.value)} maxLength={channel === "sms" ? 1600 : 10000} />
      </Field>
      <Result state={state} />
      <div><Button type="submit" disabled={pending}>{template ? "Save changes" : "Create draft"}</Button></div>
    </form>
  );
}

type StepRow = { channel: "email" | "sms"; template_id: string; delay_days: number };

export function CampaignForm({ campaign, templates }: { campaign?: { id: string; name: string; steps: StepRow[]; stop_on_reply: boolean }; templates: TemplateOption[] }) {
  const [state, action, pending] = useActionState<OutreachState, FormData>(saveCampaignAction.bind(null, campaign?.id ?? null), {});
  const initial = campaign?.steps.length ? campaign.steps : [{ channel: "email" as const, template_id: "", delay_days: 0 }];
  const [steps, setSteps] = useState<StepRow[]>(initial);
  const set = (i: number, patch: Partial<StepRow>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Sequence name" name="name" error={state.fieldErrors?.name}><Input name="name" defaultValue={campaign?.name} required maxLength={80} placeholder="New buyer follow-up" /></Field>
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">Steps</div>
        {steps.map((s, i) => (
          <div key={i} className="grid grid-cols-[3rem_1fr] items-center gap-2 sm:grid-cols-[3rem_8rem_1fr_9rem_auto]">
            <span className="text-sm text-muted">#{i + 1}</span>
            <Select aria-label={`Step ${i + 1} channel`} name={`step_${i}_channel`} value={s.channel} onChange={(e) => set(i, { channel: e.target.value as "email" | "sms", template_id: "" })}>
              <option value="email">Email</option><option value="sms">SMS</option>
            </Select>
            <Select aria-label={`Step ${i + 1} template`} name={`step_${i}_template`} value={s.template_id} onChange={(e) => set(i, { template_id: e.target.value })}>
              <option value="">Choose a template…</option>
              {templates.filter((t) => t.channel === s.channel).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <label className="flex items-center gap-1 text-sm">
              <Input aria-label={`Step ${i + 1} delay in days`} name={`step_${i}_delay`} type="number" min={0} max={90} value={s.delay_days} onChange={(e) => set(i, { delay_days: Number(e.target.value) })} className="w-16" />
              <span className="whitespace-nowrap text-muted">{i === 0 ? "days after enrolling" : "days later"}</span>
            </label>
            <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} disabled={steps.length === 1}>Remove</button>
          </div>
        ))}
        {steps.length < 10 && <button type="button" className="self-start text-sm text-brand" onClick={() => setSteps((x) => [...x, { channel: x[x.length - 1]?.channel ?? "email", template_id: "", delay_days: 2 }])}>+ Add step</button>}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="stop_on_reply" defaultChecked={campaign?.stop_on_reply ?? true} className="size-4" /> Stop when the lead replies</label>
      <p className="text-xs text-muted">Only approved templates can run. Before every step the lead&apos;s eligibility is checked again: outside contact hours waits, needs-review pauses the lead for a person, blocked skips the step.</p>
      <Result state={state} />
      <div><Button type="submit" disabled={pending}>{campaign ? "Save sequence" : "Create sequence"}</Button></div>
    </form>
  );
}

export function EnrollStageForm({ campaignId, stages }: { campaignId: string; stages: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<OutreachState, FormData>(enrollStageAction.bind(null, campaignId), {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <label htmlFor="stage_id" className="sr-only">Stage</label>
        <Select name="stage_id" defaultValue="">
          <option value="" disabled>Leads in stage…</option>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Button type="submit" variant="secondary" disabled={pending}>Enroll</Button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function SendingSettingsForm({ values, disabled }: { values: { email_from_name: string | null; email_from_address: string | null; postal_address: string | null; sms_from_number: string | null }; disabled: boolean }) {
  const [state, action, pending] = useActionState<OutreachState, FormData>(saveSendingSettingsAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <Field label="Email sender name" name="email_from_name"><Input name="email_from_name" defaultValue={values.email_from_name ?? ""} maxLength={80} placeholder="Harbor Realty" /></Field>
        <Field label="Email sender address" name="email_from_address" hint="On a domain verified in Resend" error={e.email_from_address}><Input name="email_from_address" defaultValue={values.email_from_address ?? ""} placeholder="hello@yourdomain.com" /></Field>
        <div className="sm:col-span-2"><Field label="Postal address" name="postal_address" hint="Shown in every marketing email (required by CAN-SPAM and similar laws)."><Input name="postal_address" defaultValue={values.postal_address ?? ""} maxLength={300} /></Field></div>
        <Field label="SMS number" name="sms_from_number" hint="Your Twilio number in international format. Point its incoming-message webhook at /api/webhooks/twilio/sms." error={e.sms_from_number}><Input name="sms_from_number" defaultValue={values.sms_from_number ?? ""} placeholder="+12125550123" /></Field>
      </fieldset>
      <Result state={state} />
      {!disabled && <div><Button type="submit" disabled={pending}>Save sending settings</Button></div>}
    </form>
  );
}
