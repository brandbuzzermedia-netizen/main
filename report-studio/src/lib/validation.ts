// Form validation for the studio, kept dependency-free.
import type { ClientInput } from "@/lib/data/repo";

export type FieldErrors = Partial<Record<keyof ClientInput, string>>;

const text = (v: FormDataEntryValue | null, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return { value: s || null, tooLong: s.length > max };
};

export function parseClientForm(fd: FormData): { ok: true; value: ClientInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const name = text(fd.get("name"), 120);
  const industry = text(fd.get("industry"), 120);
  const location = text(fd.get("location"), 120);
  const website = text(fd.get("website"), 200);
  const instagram = text(fd.get("instagram"), 100);
  if (!name.value) errors.name = "Enter the client's name.";
  for (const [k, f] of Object.entries({ name, industry, location, website, instagram })) {
    if (f.tooLong) errors[k as keyof ClientInput] = "This is too long.";
  }
  if (website.value && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(website.value)) errors.website = "Use a full address, like https://example.com.";
  const handle = instagram.value?.replace(/^@/, "") ?? null;
  if (handle && !/^[A-Za-z0-9._]{1,30}$/.test(handle)) errors.instagram = "Use the handle only, like thrishankdoors.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name: name.value!, industry: industry.value, location: location.value, website: website.value, instagram: handle } };
}
