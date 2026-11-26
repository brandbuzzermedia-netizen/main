"use server";

import { revalidatePath } from "next/cache";
import { getCompanyContext } from "@/lib/workspace";
import { RESOURCES, type Field } from "@/lib/resources";
import { parseMoneyToMinor } from "@/domain/money";

export type RecordState = { ok?: string; error?: string; fields?: Record<string, string[]> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Coerces one form value by field type. Throws a message the form shows next to the field. */
export async function coerce(f: Field, raw: FormDataEntryValue | null): Promise<unknown> {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (f.type === "checkbox") return v === "on" || v === "true";
  if (!v) {
    if (f.required) throw new Error("Required");
    return null;
  }
  if (f.max && v.length > f.max) throw new Error(`At most ${f.max} characters`);
  switch (f.type) {
    case "number": { const n = Number(v); if (!Number.isFinite(n)) throw new Error("Enter a number"); return n; }
    case "money": return parseMoneyToMinor(v);
    case "date": if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("Use a valid date"); return v;
    case "datetime": { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new Error("Use a valid date and time"); return new Date(`${v}:00+05:30`).toISOString(); }
    case "email": if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new Error("Enter a valid email"); return v.toLowerCase();
    case "phone": { const p = v.replace(/[\s()-]/g, ""); if (!/^\+[1-9][0-9]{7,14}$/.test(p)) throw new Error("Use +country code and number"); return p; }
    case "select": if (!f.options?.some(([k]) => k === v)) throw new Error("Choose an option"); return v;
    case "ref": if (!UUID.test(v)) throw new Error("Choose an option"); return v;
    default: return v;
  }
}

export async function createRecordAction(slug: string, key: string, _prev: RecordState, fd: FormData): Promise<RecordState> {
  const r = RESOURCES[key];
  if (!r) return { error: "Unknown record type." };
  const ctx = await getCompanyContext(slug);
  if (!ctx.can(r.write)) return { error: "Your role cannot add these records." };
  const row: Record<string, unknown> = { organization_id: ctx.company.id };
  const fields: Record<string, string[]> = {};
  for (const f of r.fields) {
    try {
      row[f.name] = await coerce(f, fd.get(f.name));
    } catch (e) {
      fields[f.name] = [(e as Error).message];
    }
  }
  if (Object.keys(fields).length) return { error: "Check the highlighted fields.", fields };
  if (r.owner) row[r.owner] = ctx.userId;
  const { error } = await ctx.supabase.from(r.table).insert(row);
  if (error) {
    const friendly = error.code === "23505" ? "A record with these details already exists (possible duplicate)." : error.message;
    return { error: friendly };
  }
  revalidatePath(`/c/${slug}/r/${key}`);
  return { ok: "Saved." };
}
