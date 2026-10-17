import { z } from "zod";
import { parseMoneyToMinor } from "./money";
import { parseFlexibleDate } from "./dates";

/** FormData → trimmed string or undefined (empty inputs become undefined). */
const text = (max = 500) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined), z.string().max(max).optional());

const requiredText = (label: string, max = 200) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string({ error: `${label} is required` }).min(1, `${label} is required`).max(max));

function parseWith<T>(fn: (v: string) => T) {
  return (v: string, ctx: z.RefinementCtx) => {
    try {
      return fn(v);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: (e as Error).message });
      return z.NEVER;
    }
  };
}

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** Required rupee amount → integer paise. */
export const moneyField = (label: string) =>
  z.preprocess(blankToUndefined, z.string({ error: `${label} is required` }).transform(parseWith(parseMoneyToMinor)));

/** Optional rupee amount → integer paise or null. */
export const optionalMoneyField = () =>
  z.preprocess(blankToUndefined, z.string().optional())
    .transform((v, ctx) => (v === undefined ? null : parseWith(parseMoneyToMinor)(v, ctx)));

/** Required date (DD-MM-YYYY or ISO) → ISO date. */
export const dateField = (label: string) =>
  z.preprocess(blankToUndefined, z.string({ error: `${label} is required` }).transform(parseWith(parseFlexibleDate)));

export const optionalDateField = () =>
  z.preprocess(blankToUndefined, z.string().optional())
    .transform((v, ctx) => (v === undefined ? null : parseWith(parseFlexibleDate)(v, ctx)));

const intField = (label: string, min: number, max: number, { required = true } = {}) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? Number(v) : v),
    required
      ? z.number({ error: `${label} is required` }).int().min(min).max(max)
      : z.number().int().min(min).max(max).optional(),
  );

const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());

export const clientSchema = z.object({
  client_code: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
    z.string().regex(/^[A-Z0-9][A-Z0-9-]{1,31}$/, "2–32 letters, digits or dashes, e.g. SHOBHA"),
  ),
  legal_name: requiredText("Legal billing name"),
  trading_name: text(200),
  gstin: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim().toUpperCase() : undefined),
    z.string().regex(/^[0-9]{2}[A-Z0-9]{13}$/, "GSTIN is 15 characters, e.g. 29ABCDE1234F1Z5").optional(),
  ),
  monthly_retainer_minor: moneyField("Monthly retainer"),
  billing_frequency: z.enum(["monthly", "quarterly", "half_yearly", "yearly", "one_time"]),
  invoice_day: intField("Invoice day", 1, 28, { required: false }),
  payment_terms_days: intField("Payment terms", 0, 180),
  service_status: z.enum(["onboarding", "active", "paused", "suspended", "offboarded"]),
  account_owner_id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  source_aliases: z.preprocess(
    (v) => (typeof v === "string" ? v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) : []),
    z.array(z.string().max(200)).max(20),
  ),
  communication_paused: checkbox,
  notes: text(4000),
});

export const newClientExtrasSchema = z.object({
  contract_start_date: dateField("Contract start date"),
  contract_end_date: optionalDateField(),
  final_deadline_days: intField("Final deadline", 1, 365),
  contact_name: text(200),
  contact_email: z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined), z.email("Enter a valid email").optional()),
  contact_whatsapp: text(20),
});

/** Normalize an Indian or international number to E.164. "98450 12345" → "+919845012345". */
export function toE164(input: string | undefined | null): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
  const d = digits.replace(/^0+/, "");
  if (/^[6-9]\d{9}$/.test(d)) return `+91${d}`;
  if (/^91[6-9]\d{9}$/.test(d)) return `+${d}`;
  return null;
}

export const contactSchema = z
  .object({
    name: requiredText("Name"),
    email: z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined), z.email("Enter a valid email").optional()),
    whatsapp: text(20),
    is_primary: checkbox,
    receives_reminders: checkbox,
    whatsapp_consent: checkbox,
    whatsapp_consent_note: text(500),
  })
  .superRefine((v, ctx) => {
    if (!v.email && !v.whatsapp) ctx.addIssue({ code: "custom", path: ["email"], message: "Add an email or a WhatsApp number" });
    if (v.whatsapp && !toE164(v.whatsapp)) ctx.addIssue({ code: "custom", path: ["whatsapp"], message: "Enter a valid mobile number, e.g. +91 98450 12345" });
    if (v.whatsapp_consent && !v.whatsapp_consent_note)
      ctx.addIssue({ code: "custom", path: ["whatsapp_consent_note"], message: "Record how the client opted in (date, channel, who)" });
  });

export const manualInvoiceSchema = z
  .object({
    client_id: z.uuid("Choose a client"),
    invoice_number: requiredText("Invoice number", 64),
    external_id: text(128),
    invoice_date: dateField("Invoice date"),
    due_date: optionalDateField(),
    billing_period_start: optionalDateField(),
    billing_period_end: optionalDateField(),
    subtotal_minor: optionalMoneyField(),
    tax_minor: optionalMoneyField(),
    total_minor: moneyField("Invoice total"),
    pdf_url: z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined), z.url({ protocol: /^https$/, error: "Use the https:// link from Swipe" }).optional()),
  })
  .superRefine((v, ctx) => {
    if (v.due_date && v.due_date < v.invoice_date) ctx.addIssue({ code: "custom", path: ["due_date"], message: "Due date is before the invoice date" });
    if (v.billing_period_start && v.billing_period_end && v.billing_period_end < v.billing_period_start)
      ctx.addIssue({ code: "custom", path: ["billing_period_end"], message: "Period ends before it starts" });
    const tax = v.tax_minor ?? 0;
    if (v.subtotal_minor !== null && Math.abs(v.subtotal_minor + tax - v.total_minor) > 100)
      ctx.addIssue({ code: "custom", path: ["total_minor"], message: "Subtotal + tax does not match the total" });
  });

export type FieldErrors = Record<string, string[] | undefined>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}
