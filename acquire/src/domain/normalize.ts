import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Lowercased, trimmed email, or null if it is not a plausible address. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return v && EMAIL_RE.test(v) && v.length <= 254 ? v : null;
}

/**
 * E.164 phone number. Numbers without a +country prefix are read as national numbers of
 * `defaultCountry` (the lead's country, else the organization's market). Returns null for
 * anything libphonenumber does not consider a valid number.
 */
export function normalizePhone(raw: string | null | undefined, defaultCountry?: string | null): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const parsed = parsePhoneNumberFromString(v, (defaultCountry?.toUpperCase() as CountryCode) || undefined);
  return parsed && parsed.isValid() ? parsed.number : null;
}

/** ISO country of an E.164 number, when it identifies exactly one country. */
export function phoneCountry(e164: string | null | undefined): string | null {
  if (!e164) return null;
  return parsePhoneNumberFromString(e164)?.country ?? null;
}

/** Countries with a single time zone can have it filled in automatically. */
const SINGLE_TZ: Record<string, string> = {
  GB: "Europe/London", AE: "Asia/Dubai", IE: "Europe/Dublin", SG: "Asia/Singapore", IN: "Asia/Kolkata",
  NZ: "Pacific/Auckland", QA: "Asia/Qatar", SA: "Asia/Riyadh", HK: "Asia/Hong_Kong",
};

export function defaultTimezone(country: string | null | undefined): string | null {
  return country ? (SINGLE_TZ[country.toUpperCase()] ?? null) : null;
}

export function normalizeCountry(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v) return null;
  const aliases: Record<string, string> = {
    USA: "US", "UNITED STATES": "US", "UNITED STATES OF AMERICA": "US", UK: "GB", "UNITED KINGDOM": "GB",
    "GREAT BRITAIN": "GB", ENGLAND: "GB", SCOTLAND: "GB", WALES: "GB", UAE: "AE", "UNITED ARAB EMIRATES": "AE",
    CANADA: "CA", AUSTRALIA: "AU", INDIA: "IN", SINGAPORE: "SG", IRELAND: "IE", "NEW ZEALAND": "NZ",
  };
  if (aliases[v]) return aliases[v];
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

export function normalizeTags(raw: string | string[] | null | undefined): string[] {
  const list = Array.isArray(raw) ? raw : (raw ?? "").split(/[,;|]/);
  return [...new Set(list.map((t) => t.trim().toLowerCase().replace(/\s+/g, "-")).filter((t) => t && t.length <= 40))].slice(0, 30);
}
