import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeEmail, normalizePhone, phoneCountry, defaultTimezone } from "./normalize";
import { parseAmount } from "./money";

export type FormConfig = { consent_email: string | null; consent_sms: string | null; consent_call: string | null; ask_budget: boolean; ask_location: boolean };

export type ParsedSubmission =
  | { ok: true; spam: false; data: { full_name: string; email: string | null; phone_e164: string | null; country: string | null; timezone: string | null; message: string | null; preferred_location: string | null; budget_max_minor: number | null; currency: string; consent: { channel: string; text: string }[] } }
  | { ok: false; spam: boolean; errors: Record<string, string> };

/** Calls only count as consent for automated/AI calls if the wording says so explicitly. */
export function coversAutomatedCalls(text: string): boolean {
  return /\b(automated|artificial|pre-?recorded|ai|autodial)/i.test(text);
}

/**
 * Validates a public form post. `fields` are raw strings from the request.
 * The honeypot field "website" must be empty; bots fill it.
 */
export function parseSubmission(fields: Record<string, string | undefined>, form: FormConfig, opts: { market: string; currency: string }): ParsedSubmission {
  if ((fields.website ?? "").trim() !== "") return { ok: false, spam: true, errors: {} };
  const errors: Record<string, string> = {};
  const name = (fields.full_name ?? "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 200) errors.full_name = "Enter your name";
  const rawEmail = (fields.email ?? "").trim();
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  if (rawEmail && !email) errors.email = "Enter a valid email address";
  const rawPhone = (fields.phone ?? "").trim();
  const phone = rawPhone ? normalizePhone(rawPhone, opts.market) : null;
  if (rawPhone && !phone) errors.phone = "Enter a valid phone number, with country code if outside " + opts.market;
  if (!rawEmail && !rawPhone) errors.email = "Enter an email address or phone number";
  const message = (fields.message ?? "").trim().slice(0, 2000) || null;
  const location = form.ask_location ? (fields.preferred_location ?? "").trim().slice(0, 200) || null : null;
  let budget: number | null = null;
  if (form.ask_budget && fields.budget) {
    const b = parseAmount(fields.budget, opts.currency);
    if (Number.isNaN(b)) errors.budget = "Enter a number, e.g. 500k";
    else budget = b;
  }
  const consent: { channel: string; text: string }[] = [];
  const ticked = (k: string) => fields[k] === "on" || fields[k] === "true" || fields[k] === "yes";
  if (form.consent_email && ticked("consent_email") && email) consent.push({ channel: "email", text: form.consent_email });
  if (form.consent_sms && ticked("consent_sms") && phone) consent.push({ channel: "sms", text: form.consent_sms });
  if (form.consent_call && ticked("consent_call") && phone) {
    consent.push({ channel: "phone_call", text: form.consent_call });
    if (coversAutomatedCalls(form.consent_call)) consent.push({ channel: "ai_voice_call", text: form.consent_call });
  }
  if (Object.keys(errors).length) return { ok: false, spam: false, errors };
  const country = phoneCountry(phone) ?? opts.market;
  return {
    ok: true, spam: false,
    data: { full_name: name, email, phone_e164: phone, country, timezone: defaultTimezone(country), message, preferred_location: location, budget_max_minor: budget, currency: opts.currency, consent },
  };
}

/** IP hashed with a per-day key: enough to rate-limit, without storing addresses. */
export function hashIp(secret: string, ip: string, day = new Date().toISOString().slice(0, 10)): string {
  return createHmac("sha256", `${secret}:${day}`).update(ip).digest("hex").slice(0, 32);
}

// Signed property links: /p/<token>
export function propertyLinkToken(secret: string, orgId: string, leadId: string, propertyId: string): string {
  const payload = Buffer.from(`${orgId}.${leadId}.${propertyId}`).toString("base64url");
  const sig = createHmac("sha256", `property:${secret}`).update(payload).digest("base64url").slice(0, 32);
  return `${payload}.${sig}`;
}

export function readPropertyLinkToken(secret: string, token: string): { orgId: string; leadId: string; propertyId: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", `property:${secret}`).update(payload).digest("base64url").slice(0, 32);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const [orgId, leadId, propertyId] = Buffer.from(payload, "base64url").toString().split(".");
  const uuid = /^[0-9a-f-]{36}$/i;
  return [orgId, leadId, propertyId].every((v) => uuid.test(v ?? "")) ? { orgId, leadId, propertyId } : null;
}
