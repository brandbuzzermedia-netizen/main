"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";
import type { Lead, Stage, Source } from "@/lib/db-types";
import { SEGMENTS, TIMELINES, segmentLabel, timelineLabel } from "@/domain/labels";
import { minorToInput } from "@/domain/money";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";

export function LeadForm({
  action, lead, stages, sources, members, canAssign, defaultCurrency, followUpLocal, submitLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  lead?: Lead;
  stages: Stage[];
  sources: Source[];
  members: { id: string; label: string }[];
  canAssign: boolean;
  defaultCurrency: string;
  followUpLocal: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const e = state.fieldErrors ?? {};
  const currency = lead?.currency ?? defaultCurrency;
  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Card title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" name="full_name" error={e.full_name}>
            <Input name="full_name" defaultValue={lead?.full_name} required maxLength={200} autoComplete="off" />
          </Field>
          <Field label="Segment" name="segment" error={e.segment}>
            <Select name="segment" defaultValue={lead?.segment ?? "buyer"}>
              {SEGMENTS.map((s) => <option key={s} value={s}>{segmentLabel[s]}</option>)}
            </Select>
          </Field>
          <Field label="Email" name="email" error={e.email}>
            <Input name="email" type="email" defaultValue={lead?.email ?? ""} autoComplete="off" />
          </Field>
          <Field label="Phone" name="phone" hint="National format for the lead's country, or +country code" error={e.phone}>
            <Input name="phone" type="tel" defaultValue={lead?.phone_e164 ?? ""} autoComplete="off" />
          </Field>
          <Field label="Country" name="country" hint="2-letter code, e.g. US, GB, AE. Decides which contact rules apply." error={e.country}>
            <Input name="country" defaultValue={lead?.country ?? ""} maxLength={60} className="uppercase" />
          </Field>
          <Field label="Time zone" name="timezone" hint="Needed to respect calling hours, e.g. America/Chicago" error={e.timezone}>
            <Input name="timezone" defaultValue={lead?.timezone ?? ""} maxLength={64} />
          </Field>
        </div>
      </Card>

      <Card title="Property interest">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Field label="What they are looking for" name="property_interest" error={e.property_interest}>
              <Input name="property_interest" defaultValue={lead?.property_interest ?? ""} maxLength={300} placeholder="3-bed family home near good schools" />
            </Field>
          </div>
          <Field label="Property type" name="property_type" error={e.property_type}>
            <Input name="property_type" defaultValue={lead?.property_type ?? ""} maxLength={80} placeholder="Apartment, villa, townhouse…" />
          </Field>
          <Field label="Preferred location" name="preferred_location" error={e.preferred_location}>
            <Input name="preferred_location" defaultValue={lead?.preferred_location ?? ""} maxLength={200} />
          </Field>
          <Field label="Budget from" name="budget_min" hint="e.g. 450000 or 450k" error={e.budget_min}>
            <Input name="budget_min" inputMode="decimal" defaultValue={minorToInput(lead?.budget_min_minor, currency)} />
          </Field>
          <Field label="Budget to" name="budget_max" error={e.budget_max}>
            <Input name="budget_max" inputMode="decimal" defaultValue={minorToInput(lead?.budget_max_minor, currency)} />
          </Field>
          <Field label="Currency" name="currency" error={e.currency}>
            <Input name="currency" defaultValue={currency} maxLength={3} className="uppercase" />
          </Field>
          <Field label="Timeline" name="timeline" error={e.timeline}>
            <Select name="timeline" defaultValue={lead?.timeline ?? "unknown"}>
              {TIMELINES.map((t) => <option key={t} value={t}>{timelineLabel[t]}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      <Card title="Pipeline">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Stage" name="stage_id" error={e.stage_id}>
            <Select name="stage_id" defaultValue={lead?.stage_id ?? stages.find((s) => s.key === "new")?.id}>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Source" name="source_id" error={e.source_id}>
            <Select name="source_id" defaultValue={lead?.source_id ?? sources.find((s) => s.kind === "manual")?.id ?? ""}>
              <option value="">No source</option>
              {sources.filter((s) => s.is_active || s.id === lead?.source_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Owner" name="owner_id" hint={canAssign ? undefined : "Leads you create are assigned to you."} error={e.owner_id}>
            <Select name="owner_id" defaultValue={lead?.owner_id ?? ""} disabled={!canAssign}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Next follow-up" name="next_follow_up_at" hint="Your workspace's time zone" error={e.next_follow_up_at}>
            <Input name="next_follow_up_at" type="datetime-local" defaultValue={followUpLocal} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Tags" name="tags" hint="Comma-separated, e.g. luxury, first-time-buyer" error={e.tags}>
              <Input name="tags" defaultValue={lead?.tags.join(", ") ?? ""} maxLength={600} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes" name="notes" error={e.notes}>
              <Textarea name="notes" defaultValue={lead?.notes ?? ""} maxLength={5000} />
            </Field>
          </div>
        </div>
      </Card>

      <p className="text-xs text-muted">
        Consent is recorded separately on the lead page, with where and how it was given. An email or phone number on its own is not consent to contact.
      </p>
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button></div>
    </form>
  );
}
