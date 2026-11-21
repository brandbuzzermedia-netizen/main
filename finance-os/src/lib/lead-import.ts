import { parseCsv } from "@/integrations/swipe/csv";

/** Column names used by Apollo, D7 Lead Finder and common spreadsheets, matched case-insensitively. */
const SYN: Record<string, string[]> = {
  full_name: ["name", "full name", "contact name", "person name", "contact"],
  first_name: ["first name", "firstname", "given name"],
  last_name: ["last name", "lastname", "surname", "family name"],
  email: ["email", "email address", "emails", "work email", "e-mail", "email 1", "primary email"],
  phone: ["phone", "phone number", "phones", "mobile", "mobile phone", "mobile number", "contact number", "corporate phone", "work direct phone", "telephone", "whatsapp"],
  company_name: ["company", "company name", "organization", "organisation", "business name", "account name", "business"],
  linkedin_url: ["linkedin", "linkedin url", "person linkedin url", "linkedin profile"],
};
export type LeadField = keyof typeof SYN;
export const FIELD_LABELS: Record<LeadField, string> = { full_name: "Name", first_name: "First name", last_name: "Last name", email: "Email", phone: "Phone", company_name: "Company", linkedin_url: "LinkedIn" };

export type ImportRow = { full_name: string; email: string | null; phone_e164: string | null; company_name: string | null; linkedin_url: string | null };
export type ImportPlan = { rows: ImportRow[]; mapped: Partial<Record<LeadField, string>>; ignored: string[]; total: number; invalid: number; duplicatesInFile: number };

const norm = (h: string) => h.trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");

/** Indian numbers without a country code get +91; anything that is not a valid E.164 number is dropped. */
export function toE164(raw: string): string | null {
  const first = raw.split(/[,;/|]/)[0]?.trim() ?? "";
  if (!first) return null;
  const plus = first.startsWith("+");
  let d = first.replace(/\D/g, "");
  if (!plus) {
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    if (d.length === 10 && /^[6-9]/.test(d)) d = `91${d}`;
    else if (!(d.length === 12 && d.startsWith("91"))) return null;
  }
  const e = `+${d}`;
  return /^\+[1-9][0-9]{7,14}$/.test(e) ? e : null;
}

export function planImport(text: string, maxRows = 10_000): ImportPlan {
  const all = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  const [header = [], ...body] = all;
  const mapped: Partial<Record<LeadField, string>> = {};
  const idx: Partial<Record<LeadField, number>> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    const f = (Object.keys(SYN) as LeadField[]).find((k) => idx[k] === undefined && SYN[k].includes(n));
    if (f) { idx[f] = i; mapped[f] = h.trim(); }
  });
  // D7 and similar business lists: the business name is the only name.
  if (idx.full_name === undefined && idx.first_name === undefined && idx.company_name !== undefined) { idx.full_name = idx.company_name; mapped.full_name = mapped.company_name; }
  const used = new Set(Object.values(idx));
  const ignored = header.filter((_, i) => !used.has(i)).map((h) => h.trim()).filter(Boolean);
  const get = (r: string[], f: LeadField) => (idx[f] === undefined ? "" : (r[idx[f]!] ?? "").trim());
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  let invalid = 0, dup = 0;
  for (const r of body.slice(0, maxRows)) {
    const name = (get(r, "full_name") || [get(r, "first_name"), get(r, "last_name")].filter(Boolean).join(" ")).slice(0, 200);
    const em = get(r, "email").split(/[,;\s]+/)[0]?.toLowerCase() ?? "";
    const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) ? em : null;
    const phone = toE164(get(r, "phone"));
    if (!name || (!email && !phone)) { invalid++; continue; }
    const keys = [email && `e:${email}`, phone && `p:${phone}`].filter(Boolean) as string[];
    if (keys.some((k) => seen.has(k))) { dup++; continue; }
    keys.forEach((k) => seen.add(k));
    const li = get(r, "linkedin_url").replace(/^http:/, "https:");
    rows.push({ full_name: name, email, phone_e164: phone, company_name: get(r, "company_name").slice(0, 200) || null, linkedin_url: /^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(li) ? li : null });
  }
  return { rows, mapped, ignored, total: Math.min(body.length, maxRows), invalid, duplicatesInFile: dup };
}
