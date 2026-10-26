import { parseCsv } from "./csv";
import { BASES, type Basis, type Channel } from "./eligibility";
import { parseSegment, parseTimeline, type Segment, type Timeline } from "./labels";
import { parseAmount } from "./money";
import { defaultTimezone, normalizeCountry, normalizeEmail, normalizePhone, normalizeTags, phoneCountry } from "./normalize";
import { isValidTimeZone } from "./eligibility";

export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_CUSTOM_FIELDS = 20;

/** Accepted header spellings per field (compared case-insensitively, ignoring punctuation). */
const HEADERS = {
  fullName: ["full name", "name", "contact name", "lead name", "client name"],
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  email: ["email", "e mail", "email address", "e mail address"],
  phone: ["phone", "phone number", "mobile", "mobile number", "cell", "cell phone", "telephone", "tel"],
  country: ["country", "country code"],
  timezone: ["timezone", "time zone", "tz"],
  segment: ["segment", "type", "lead type", "contact type", "category"],
  propertyInterest: ["property interest", "interest", "interested in", "property"],
  propertyType: ["property type"],
  preferredLocation: ["preferred location", "location", "area", "city", "neighbourhood", "neighborhood"],
  budgetMin: ["budget min", "min budget", "minimum budget", "budget from"],
  budgetMax: ["budget max", "max budget", "maximum budget", "budget to", "budget", "price"],
  currency: ["currency"],
  timeline: ["timeline", "timeframe", "time frame", "purchase timeline", "selling timeline", "move timeline"],
  tags: ["tags", "labels"],
  notes: ["notes", "note", "comments", "comment"],
  emailConsent: ["email consent", "email opt in", "email optin"],
  smsConsent: ["sms consent", "sms opt in", "text consent"],
  callConsent: ["call consent", "phone consent", "phone call consent"],
  aiCallConsent: ["ai call consent", "ai voice consent", "automated call consent"],
  whatsappConsent: ["whatsapp consent", "whatsapp opt in"],
  consentBasis: ["consent basis", "basis"],
  consentSource: ["consent source", "consent evidence", "opt in source", "optin source"],
  consentDate: ["consent date", "opt in date", "optin date", "consent captured at"],
} as const;

export type ImportField = keyof typeof HEADERS;

const CONSENT_COLUMNS: [ImportField, Channel][] = [
  ["emailConsent", "email"], ["smsConsent", "sms"], ["callConsent", "phone_call"],
  ["aiCallConsent", "ai_voice_call"], ["whatsappConsent", "whatsapp"],
];

export type ImportRow = {
  row_number: number;
  full_name: string;
  email: string | null;
  phone_e164: string | null;
  country: string | null;
  timezone: string | null;
  segment: Segment;
  property_interest: string | null;
  property_type: string | null;
  preferred_location: string | null;
  budget_min_minor: number | null;
  budget_max_minor: number | null;
  currency: string | null;
  timeline: Timeline;
  tags: string[];
  notes: string | null;
  custom_fields: Record<string, string>;
  consent: { channel: Channel; basis: Basis; source: string; captured_at?: string }[];
};

export type ImportIssue = { rowNumber: number; severity: "error" | "warning"; message: string };

export type ImportPlan = {
  totalRows: number;
  mapped: Partial<Record<ImportField, string>>;
  customColumns: string[];
  ignoredColumns: string[];
  missingColumns: string[];
  rows: ImportRow[];
  issues: ImportIssue[];
};

const canon = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const slug = (h: string) => canon(h).replace(/ /g, "_").slice(0, 40);
const YES = /^(y|yes|true|1|opted in|opt in|granted|x)$/i;

export function mapHeaders(headers: string[]) {
  const mapped: Partial<Record<ImportField, number>> = {};
  const used = new Set<number>();
  for (const [field, names] of Object.entries(HEADERS) as [ImportField, readonly string[]][]) {
    // Exact spellings in order of preference, so "budget" only maps to budgetMax if no better column exists.
    for (const name of names) {
      const idx = headers.findIndex((h, i) => !used.has(i) && canon(h) === name);
      if (idx >= 0) {
        mapped[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  const unmapped = headers.map((h, i) => ({ h, i })).filter(({ h, i }) => !used.has(i) && h.trim() !== "");
  return { mapped, unmapped };
}

export function planImport(text: string, opts: { defaultCountry: string; defaultCurrency: string; now?: Date }): ImportPlan {
  const table = parseCsv(text);
  if (table.length === 0) throw new Error("The file is empty.");
  const [headers, ...body] = table;
  if (body.length > MAX_IMPORT_ROWS) throw new Error(`The file has ${body.length} rows. The limit is ${MAX_IMPORT_ROWS} per import; split the file.`);

  const { mapped, unmapped } = mapHeaders(headers);
  const missingColumns: string[] = [];
  if (mapped.fullName === undefined && mapped.firstName === undefined) missingColumns.push("Name (or First name)");
  if (mapped.email === undefined && mapped.phone === undefined) missingColumns.push("Email or Phone");

  const customColumns = unmapped.slice(0, MAX_CUSTOM_FIELDS).map((u) => u.h);
  const ignoredColumns = unmapped.slice(MAX_CUSTOM_FIELDS).map((u) => u.h);
  const plan: ImportPlan = {
    totalRows: body.length,
    mapped: Object.fromEntries(Object.entries(mapped).map(([k, i]) => [k, headers[i as number]])),
    customColumns,
    ignoredColumns,
    missingColumns,
    rows: [],
    issues: [],
  };
  if (missingColumns.length) return plan;

  const seenEmail = new Map<string, number>();
  const seenPhone = new Map<string, number>();
  const now = opts.now ?? new Date();

  body.forEach((cells, i) => {
    const rowNumber = i + 2; // header is row 1
    const get = (f: ImportField) => {
      const idx = mapped[f];
      return idx === undefined ? "" : (cells[idx] ?? "").trim();
    };
    const errors: string[] = [];
    const warn = (message: string) => plan.issues.push({ rowNumber, severity: "warning", message });

    const name = (get("fullName") || [get("firstName"), get("lastName")].filter(Boolean).join(" ")).replace(/\s+/g, " ");
    if (!name) errors.push("Name is empty");
    if (name.length > 200) errors.push("Name is longer than 200 characters");

    const country = normalizeCountry(get("country"));
    if (get("country") && !country) warn(`Country “${get("country")}” not recognised; left empty`);

    const rawEmail = get("email");
    const email = normalizeEmail(rawEmail);
    if (rawEmail && !email) errors.push(`Email “${rawEmail}” is not valid`);

    const rawPhone = get("phone");
    const phone = normalizePhone(rawPhone, country ?? opts.defaultCountry);
    if (rawPhone && !phone) errors.push(`Phone “${rawPhone}” is not a valid number for ${country ?? opts.defaultCountry}`);
    if (!rawEmail && !rawPhone) errors.push("Needs an email or a phone number");

    if (email && seenEmail.has(email)) errors.push(`Same email as row ${seenEmail.get(email)}`);
    if (phone && seenPhone.has(phone)) errors.push(`Same phone as row ${seenPhone.get(phone)}`);

    const finalCountry = country ?? phoneCountry(phone);
    const rawTz = get("timezone");
    let timezone = rawTz && isValidTimeZone(rawTz) ? rawTz : null;
    if (rawTz && !timezone) warn(`Time zone “${rawTz}” not recognised; left empty`);
    timezone ??= defaultTimezone(finalCountry);

    const rawSegment = get("segment");
    const segment = parseSegment(rawSegment);
    if (rawSegment && !segment) warn(`Segment “${rawSegment}” not recognised; set to Other`);

    const rawTimeline = get("timeline");
    const timeline = parseTimeline(rawTimeline);
    if (rawTimeline && !timeline) warn(`Timeline “${rawTimeline}” not recognised; set to Unknown`);

    const currency = (get("currency") || opts.defaultCurrency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) errors.push(`Currency “${currency}” is not an ISO code`);
    const budgetMin = parseAmount(get("budgetMin"), currency);
    const budgetMax = parseAmount(get("budgetMax"), currency);
    if (Number.isNaN(budgetMin)) errors.push(`Budget min “${get("budgetMin")}” is not a number`);
    if (Number.isNaN(budgetMax)) errors.push(`Budget “${get("budgetMax")}” is not a number`);
    if (budgetMin !== null && budgetMax !== null && !Number.isNaN(budgetMin) && !Number.isNaN(budgetMax) && budgetMax < budgetMin) {
      errors.push("Budget max is lower than budget min");
    }

    // Consent: only with a stated source. A "yes" with no evidence is not consent.
    const consent: ImportRow["consent"] = [];
    const source = get("consentSource");
    const rawBasis = canon(get("consentBasis")).replace(/ /g, "_");
    const basis: Basis = (BASES as readonly string[]).includes(rawBasis) ? (rawBasis as Basis) : "express";
    if (get("consentBasis") && basis !== rawBasis) warn(`Consent basis “${get("consentBasis")}” not recognised; read as express consent`);
    const rawDate = get("consentDate");
    let capturedAt: string | undefined;
    if (rawDate) {
      const d = new Date(rawDate);
      if (Number.isNaN(d.getTime()) || d > now) warn(`Consent date “${rawDate}” is not a valid past date; using the import time`);
      else capturedAt = d.toISOString();
    }
    for (const [col, channel] of CONSENT_COLUMNS) {
      if (!YES.test(get(col))) continue;
      if (source.length < 3) {
        warn(`${channel.replace("_", " ")} consent marked yes but “Consent source” is empty; consent not recorded`);
        continue;
      }
      consent.push({ channel, basis, source: source.slice(0, 400), ...(capturedAt ? { captured_at: capturedAt } : {}) });
    }

    const custom: Record<string, string> = {};
    for (const u of unmapped.slice(0, MAX_CUSTOM_FIELDS)) {
      const v = (cells[u.i] ?? "").trim();
      if (v) custom[slug(u.h)] = v.slice(0, 500);
    }

    if (errors.length) {
      for (const message of errors) plan.issues.push({ rowNumber, severity: "error", message });
      return;
    }
    if (email) seenEmail.set(email, rowNumber);
    if (phone) seenPhone.set(phone, rowNumber);

    plan.rows.push({
      row_number: rowNumber,
      full_name: name,
      email,
      phone_e164: phone,
      country: finalCountry,
      timezone,
      segment: segment ?? (rawSegment ? "other" : "buyer"),
      property_interest: get("propertyInterest") || null,
      property_type: get("propertyType") || null,
      preferred_location: get("preferredLocation") || null,
      budget_min_minor: budgetMin,
      budget_max_minor: budgetMax,
      currency: budgetMin !== null || budgetMax !== null ? currency : null,
      timeline: timeline ?? "unknown",
      tags: normalizeTags(get("tags")),
      notes: get("notes") || null,
      custom_fields: custom,
      consent,
    });
  });
  return plan;
}

export const TEMPLATE_HEADERS = [
  "Full name", "Email", "Phone", "Country", "Time zone", "Segment", "Property interest", "Property type",
  "Preferred location", "Budget min", "Budget max", "Currency", "Timeline", "Tags", "Notes",
  "Email consent", "SMS consent", "Call consent", "AI call consent", "WhatsApp consent", "Consent basis", "Consent source", "Consent date",
];
