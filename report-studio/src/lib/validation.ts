// Form validation for the studio, kept dependency-free.
import type { ClientInput } from "@/lib/data/shared";
import type { Template } from "@/lib/report/types";

export type FieldErrors = Partial<Record<keyof ClientInput | "primary" | "accent", string>>;

const text = (v: FormDataEntryValue | null, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return { value: s || null, tooLong: s.length > max };
};

const URL_RE = /^https?:\/\/[^\s.]+\.[^\s]+$/i;
const TEMPLATES: Template[] = ["premium", "minimal", "dark"];

/** "www.brand.in" or "brand.in" -> "https://www.brand.in". Anything else is returned as typed. */
export function withScheme(v: string | null): string | null {
  if (!v) return v;
  const t = v.trim().replace(/\s+/g, "");
  return /^https?:\/\//i.test(t) ? t : /^[^\s/]+\.[a-z]{2,}(\/.*)?$/i.test(t) ? `https://${t}` : t;
}

/** Accepts "brand", "@brand" or a profile address and returns the handle. */
export function instagramHandle(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  return (m ? m[1] : v).replace(/^@/, "").replace(/\/$/, "");
}

export function parseClientForm(fd: FormData): { ok: true; value: ClientInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const f = {
    name: text(fd.get("name"), 120),
    company: text(fd.get("company"), 160),
    industry: text(fd.get("industry"), 120),
    location: text(fd.get("location"), 120),
    website: text(fd.get("website"), 200),
    instagram: text(fd.get("instagram"), 200),
    facebook: text(fd.get("facebook"), 200),
    contact: text(fd.get("contact"), 120),
    notes: text(fd.get("notes"), 2000),
  };
  if (!f.name.value) errors.name = "Enter the client's name.";
  for (const [k, v] of Object.entries(f)) if (v.tooLong) errors[k as keyof ClientInput] = "This is too long.";
  // People type addresses without https://, or a Facebook page name alone; accept both.
  f.website.value = withScheme(f.website.value);
  if (f.facebook.value && !/[./]/.test(f.facebook.value)) f.facebook.value = `https://facebook.com/${f.facebook.value.replace(/^@/, "")}`;
  f.facebook.value = withScheme(f.facebook.value);
  if (f.website.value && !URL_RE.test(f.website.value)) errors.website = "This does not look like a web address. Use one like lykes.in or https://lykes.in.";
  if (f.facebook.value && !/^https?:\/\/([a-z0-9-]+\.)?(facebook|fb)\.com\/\S+$/i.test(f.facebook.value)) errors.facebook = "Use the page address (facebook.com/yourpage) or just the page name.";
  const handle = instagramHandle(f.instagram.value);
  if (handle && !/^[A-Za-z0-9._]{1,30}$/.test(handle)) errors.instagram = "Use the handle or profile address, like @brandname.";
  const t = String(fd.get("template") ?? "");
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: f.name.value!, company: f.company.value, industry: f.industry.value, location: f.location.value,
      website: f.website.value, instagram: handle, facebook: f.facebook.value, contact: f.contact.value, notes: f.notes.value,
      template: TEMPLATES.includes(t as Template) ? (t as Template) : null,
    },
  };
}
