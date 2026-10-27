"use client";

import { useActionState, useTransition } from "react";
import { saveLeadFormAction, savePropertyAction, setInterestStatusAction, sharePropertyAction, type PropState } from "@/app/(app)/property-actions";
import { SEGMENTS, segmentLabel } from "@/domain/labels";
import { minorToInput } from "@/domain/money";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";

function Result({ state }: { state: PropState }) {
  if (state.error) return <Alert tone="danger">{state.error}</Alert>;
  if (state.message) return <Alert tone="ok">{state.message}</Alert>;
  return null;
}

export type PropertyValues = {
  id: string; title: string; reference: string | null; address: string | null; city: string | null; country: string | null; property_type: string | null;
  listing_type: string; price_minor: number | null; currency: string; bedrooms: number | null; bathrooms: number | null; area_sqm: number | null;
  status: string; description: string | null; listing_url: string | null; video_url: string | null; image_url: string | null;
};

export function PropertyForm({ property, defaultCurrency }: { property?: PropertyValues; defaultCurrency: string }) {
  const [state, action, pending] = useActionState<PropState, FormData>(savePropertyAction.bind(null, property?.id ?? null), {});
  const e = state.fieldErrors ?? {};
  const cur = property?.currency ?? defaultCurrency;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2"><Field label="Title" name="title" error={e.title}><Input name="title" defaultValue={property?.title} required maxLength={200} placeholder="3-bed townhouse, Lincoln Park" /></Field></div>
        <Field label="Reference" name="reference" hint="Your listing or MLS ID" error={e.reference}><Input name="reference" defaultValue={property?.reference ?? ""} maxLength={60} /></Field>
        <Field label="Address" name="address" error={e.address}><Input name="address" defaultValue={property?.address ?? ""} maxLength={300} /></Field>
        <Field label="City / area" name="city" error={e.city}><Input name="city" defaultValue={property?.city ?? ""} maxLength={120} /></Field>
        <Field label="Country" name="country" error={e.country}><Input name="country" defaultValue={property?.country ?? ""} maxLength={60} className="uppercase" /></Field>
        <Field label="Listing" name="listing_type">
          <Select name="listing_type" defaultValue={property?.listing_type ?? "sale"}><option value="sale">For sale</option><option value="rent">For rent</option><option value="off_plan">Off-plan</option></Select>
        </Field>
        <Field label="Price" name="price" hint="Rent: per year" error={e.price}><Input name="price" inputMode="decimal" defaultValue={minorToInput(property?.price_minor, cur)} /></Field>
        <Field label="Currency" name="currency" error={e.currency}><Input name="currency" defaultValue={cur} maxLength={3} className="uppercase" /></Field>
        <Field label="Type" name="property_type" error={e.property_type}><Input name="property_type" defaultValue={property?.property_type ?? ""} maxLength={80} placeholder="Apartment, villa…" /></Field>
        <Field label="Bedrooms" name="bedrooms" error={e.bedrooms}><Input name="bedrooms" type="number" min={0} max={50} defaultValue={property?.bedrooms ?? ""} /></Field>
        <Field label="Bathrooms" name="bathrooms" error={e.bathrooms}><Input name="bathrooms" type="number" min={0} max={50} defaultValue={property?.bathrooms ?? ""} /></Field>
        <Field label="Area (m²)" name="area_sqm" error={e.area_sqm}><Input name="area_sqm" inputMode="decimal" defaultValue={property?.area_sqm ?? ""} /></Field>
        <Field label="Status" name="status">
          <Select name="status" defaultValue={property?.status ?? "available"}>
            {["draft", "available", "under_offer", "sold", "let", "withdrawn"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-3"><Field label="Video tour link" name="video_url" hint="https:// link to the listing video (YouTube, Vimeo, your website…)" error={e.video_url}><Input name="video_url" defaultValue={property?.video_url ?? ""} /></Field></div>
        <div className="sm:col-span-3"><Field label="Listing page link" name="listing_url" error={e.listing_url}><Input name="listing_url" defaultValue={property?.listing_url ?? ""} /></Field></div>
        <div className="sm:col-span-3"><Field label="Main photo link" name="image_url" error={e.image_url}><Input name="image_url" defaultValue={property?.image_url ?? ""} /></Field></div>
        <div className="sm:col-span-3"><Field label="Description" name="description" error={e.description}><Textarea name="description" rows={5} defaultValue={property?.description ?? ""} maxLength={10000} /></Field></div>
      </div>
      <p className="text-xs text-muted">Only list properties you are authorised to market, with accurate prices and availability.</p>
      <Result state={state} />
      <div><Button type="submit" disabled={pending}>{property ? "Save property" : "Add property"}</Button></div>
    </form>
  );
}

export function ShareProperty({ leadId, properties }: { leadId: string; properties: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState<PropState, FormData>(sharePropertyAction.bind(null, leadId), {});
  if (properties.length === 0) return <p className="text-sm text-muted">No available properties. Add them under Properties.</p>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <Field label="Property" name="property_id">
          <Select name="property_id" defaultValue=""><option value="" disabled>Choose…</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
        </Field>
        <Field label="Send by" name="channel"><Select name="channel" defaultValue="email"><option value="email">Email</option><option value="sms">SMS</option></Select></Field>
      </div>
      <Field label="Personal note (optional)" name="note"><Input name="note" maxLength={1000} placeholder="This one has the garden you asked about" /></Field>
      <Result state={state} />
      <div><Button type="submit" variant="secondary" disabled={pending}>{pending ? "Sending…" : "Share with video link"}</Button></div>
    </form>
  );
}

export function InterestButtons({ interestId }: { interestId: string }) {
  const [pending, start] = useTransition();
  return (
    <span className="flex gap-2 text-xs">
      <button type="button" disabled={pending} className="text-ok hover:underline" onClick={() => start(() => setInterestStatusAction(interestId, "interested"))}>Interested</button>
      <button type="button" disabled={pending} className="text-muted hover:underline" onClick={() => start(() => setInterestStatusAction(interestId, "not_interested"))}>Not for them</button>
    </span>
  );
}

export type LeadFormValues = {
  id: string; name: string; headline: string; intro: string | null; segment: string; source_id: string | null; assign_to: string | null;
  consent_email: string | null; consent_sms: string | null; consent_call: string | null; privacy_url: string | null; thank_you: string;
  ask_budget: boolean; ask_location: boolean; is_active: boolean;
};

export function LeadFormEditor({ form, orgName, sources, members }: { form?: LeadFormValues; orgName: string; sources: { id: string; name: string }[]; members: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<PropState, FormData>(saveLeadFormAction.bind(null, form?.id ?? null), {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Internal name" name="name" error={e.name}><Input name="name" defaultValue={form?.name} required maxLength={80} placeholder="Facebook ad: Lakeview launch" /></Field>
        <Field label="Lead type" name="segment"><Select name="segment" defaultValue={form?.segment ?? "buyer"}>{SEGMENTS.map((s) => <option key={s} value={s}>{segmentLabel[s]}</option>)}</Select></Field>
        <div className="sm:col-span-2"><Field label="Headline" name="headline" error={e.headline}><Input name="headline" defaultValue={form?.headline ?? "Tell us what you are looking for"} maxLength={160} /></Field></div>
        <div className="sm:col-span-2"><Field label="Intro (optional)" name="intro"><Textarea name="intro" rows={2} defaultValue={form?.intro ?? ""} maxLength={1000} /></Field></div>
        <Field label="Lead source" name="source_id"><Select name="source_id" defaultValue={form?.source_id ?? ""}><option value="">None</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Assign new leads to" name="assign_to" error={e.assign_to}><Select name="assign_to" defaultValue={form?.assign_to ?? ""}><option value="">Nobody</option>{members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
      </div>
      <fieldset className="flex flex-col gap-3 rounded-lg border border-line p-4">
        <legend className="px-1 text-sm font-medium">Consent checkboxes</legend>
        <p className="text-xs text-muted">The exact wording is stored with each consent as evidence. Leave a box empty to not offer that channel. Name your business and keep each box optional.</p>
        <Field label="Email" name="consent_email" error={e.consent_email}><Textarea name="consent_email" rows={2} maxLength={500} defaultValue={form?.consent_email ?? `I agree to receive emails from ${orgName} about properties that match my search. I can unsubscribe at any time.`} /></Field>
        <Field label="SMS" name="consent_sms" error={e.consent_sms}><Textarea name="consent_sms" rows={2} maxLength={500} defaultValue={form?.consent_sms ?? `I agree to receive marketing text messages from ${orgName} at the number provided. Message and data rates may apply. Reply STOP to opt out.`} /></Field>
        <Field label="Calls" name="consent_call" hint="Mention automated or AI calls explicitly if you will use them; otherwise this covers calls from a person only." error={e.consent_call}><Textarea name="consent_call" rows={2} maxLength={500} defaultValue={form?.consent_call ?? `I agree that ${orgName} may call me at the number provided, including with automated or AI-assisted calls, about properties. Consent is not a condition of purchase.`} /></Field>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Privacy notice link" name="privacy_url" error={e.privacy_url}><Input name="privacy_url" defaultValue={form?.privacy_url ?? ""} placeholder="https://" /></Field>
        <Field label="Thank-you message" name="thank_you"><Input name="thank_you" defaultValue={form?.thank_you ?? "Thank you. We will be in touch shortly."} maxLength={500} /></Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="ask_location" defaultChecked={form?.ask_location ?? true} className="size-4" /> Ask preferred area</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="ask_budget" defaultChecked={form?.ask_budget ?? true} className="size-4" /> Ask budget</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="is_active" defaultChecked={form?.is_active ?? true} className="size-4" /> Accepting submissions</label>
      </div>
      <Result state={state} />
      <div><Button type="submit" disabled={pending}>{form ? "Save form" : "Create form"}</Button></div>
    </form>
  );
}
