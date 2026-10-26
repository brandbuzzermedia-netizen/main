import { z } from "zod";
import { BASES, CHANNELS } from "./eligibility";
import { ROLES, SEGMENTS, SOURCE_KINDS, STAGE_CATEGORIES, SUPPRESSION_REASONS, TIMELINES } from "./labels";
import { parseAmount } from "./money";
import { normalizeCountry, normalizeEmail, normalizePhone, normalizeTags } from "./normalize";
import { isValidTimeZone } from "./eligibility";
import { fromLocalInput } from "./dates";

export type FieldErrors = Record<string, string[]>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v), z.string().max(max).optional());
const uuidOrEmpty = z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional());

/**
 * Lead form. Phone and budget need context (country, currency), so the schema keeps them as
 * text and normalizeLead() turns them into stored values, adding field errors.
 */
export const leadFormSchema = z.object({
  full_name: z.string().trim().min(1, "Enter a name").max(200),
  email: optionalText(254),
  phone: optionalText(40),
  country: optionalText(60),
  timezone: optionalText(64),
  segment: z.enum(SEGMENTS),
  property_interest: optionalText(300),
  property_type: optionalText(80),
  preferred_location: optionalText(200),
  budget_min: optionalText(30),
  budget_max: optionalText(30),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code"),
  timeline: z.enum(TIMELINES),
  stage_id: z.uuid("Choose a stage"),
  owner_id: uuidOrEmpty,
  source_id: uuidOrEmpty,
  tags: optionalText(600),
  next_follow_up_at: optionalText(30),
  notes: optionalText(5000),
});

export type LeadForm = z.infer<typeof leadFormSchema>;

/** `timeZone` is the zone the person typed the follow-up time in (the organization's). */
export function normalizeLead(v: LeadForm, defaultCountry: string, timeZone: string) {
  const errors: FieldErrors = {};
  const country = v.country ? normalizeCountry(v.country) : null;
  if (v.country && !country) errors.country = ["Use a 2-letter country code, e.g. US, GB, AE"];
  const email = v.email ? normalizeEmail(v.email) : null;
  if (v.email && !email) errors.email = ["Enter a valid email address"];
  const phone = v.phone ? normalizePhone(v.phone, country ?? defaultCountry) : null;
  if (v.phone && !phone) errors.phone = [`Not a valid number for ${country ?? defaultCountry}. Include the +country code if it is from elsewhere.`];
  if (!v.email && !v.phone) errors.email = ["Enter an email or a phone number"];
  if (v.timezone && !isValidTimeZone(v.timezone)) errors.timezone = ["Use an IANA time zone, e.g. America/New_York"];
  const min = parseAmount(v.budget_min, v.currency);
  const max = parseAmount(v.budget_max, v.currency);
  if (Number.isNaN(min)) errors.budget_min = ["Enter a number, e.g. 450000 or 450k"];
  if (Number.isNaN(max)) errors.budget_max = ["Enter a number, e.g. 600000 or 1.2m"];
  if (min !== null && max !== null && !Number.isNaN(min) && !Number.isNaN(max) && max < min) errors.budget_max = ["Max is lower than min"];
  let followUp: string | null = null;
  if (v.next_follow_up_at) {
    followUp = fromLocalInput(v.next_follow_up_at, timeZone);
    if (!followUp) errors.next_follow_up_at = ["Enter a valid date and time"];
  }
  const hasBudget = (min !== null && !Number.isNaN(min)) || (max !== null && !Number.isNaN(max));
  return {
    errors,
    values: {
      full_name: v.full_name.replace(/\s+/g, " "),
      email,
      phone_e164: phone,
      country,
      timezone: v.timezone ?? null,
      segment: v.segment,
      property_interest: v.property_interest ?? null,
      property_type: v.property_type ?? null,
      preferred_location: v.preferred_location ?? null,
      budget_min_minor: min !== null && !Number.isNaN(min) ? min : null,
      budget_max_minor: max !== null && !Number.isNaN(max) ? max : null,
      currency: hasBudget ? v.currency : null,
      timeline: v.timeline,
      stage_id: v.stage_id,
      owner_id: v.owner_id ?? null,
      source_id: v.source_id ?? null,
      tags: normalizeTags(v.tags),
      next_follow_up_at: followUp,
      notes: v.notes ?? null,
    },
  };
}

export const consentFormSchema = z.object({
  channel: z.enum(CHANNELS),
  status: z.enum(["granted", "withdrawn"]),
  basis: z.preprocess((v) => (v === "" ? undefined : v), z.enum(BASES).optional()),
  source: z.string().trim().min(3, "Describe where and how this was captured").max(500),
  evidence_url: z.preprocess((v) => (v === "" ? undefined : v), z.url("Enter a full URL").max(1000).optional()),
  captured_at: optionalText(30),
  expires_at: optionalText(30),
}).refine((v) => v.status === "withdrawn" || v.basis, { message: "Choose the basis", path: ["basis"] });

export const suppressionFormSchema = z.object({
  target: z.enum(["email", "phone", "both"]),
  channel: z.preprocess((v) => (v === "" || v === "all" ? undefined : v), z.enum(CHANNELS).optional()),
  reason: z.enum(SUPPRESSION_REASONS),
  source: optionalText(300),
});

export const noteSchema = z.object({ summary: z.string().trim().min(1, "Write a note").max(5000) });

export const stageSchema = z.object({
  name: z.string().trim().min(1).max(60),
  category: z.enum(STAGE_CATEGORIES),
});

export const sourceSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  kind: z.enum(SOURCE_KINDS),
  provenance_note: optionalText(1000),
});

export const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(ROLES),
});

export const settingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone"),
  contact_window_start: z.string().regex(/^\d{2}:\d{2}$/),
  contact_window_end: z.string().regex(/^\d{2}:\d{2}$/),
  implied_inquiry_days: z.coerce.number().int().min(1).max(730),
}).refine((v) => v.contact_window_end > v.contact_window_start, { message: "End must be after start", path: ["contact_window_end"] });

export const savedViewSchema = z.object({
  name: z.string().trim().min(1, "Name the view").max(60),
  query: z.string().max(1000),
  is_shared: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});
