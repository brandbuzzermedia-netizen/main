"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";
import { FIELD_LABELS, planImport, type ImportRow } from "@/lib/lead-import";

const back = (slug: string, note: string) => redirect(`/c/${slug}/leads/import?note=${encodeURIComponent(note)}`);
const list = (v: FormDataEntryValue | null) => String(v ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 20);

/** CSV from D7, Apollo or any spreadsheet → this company's leads. Duplicates (same email or phone) are skipped. */
export async function importLeadsAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) throw new Error("Not allowed");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back(slug, "Choose a CSV file first.");
  if ((file as File).size > 5_000_000) back(slug, "That file is over 5 MB. Split it into smaller files.");
  const source = z.string().trim().min(2).max(80).catch("Imported list").parse(fd.get("source"));
  const basis = z.enum(["legitimate_interest", "consent", "none"]).parse(fd.get("basis"));
  const seq = z.uuid().nullable().catch(null).parse(fd.get("sequence_id") || null);
  const plan = planImport(await (file as File).text());
  if (!plan.mapped.full_name && !plan.mapped.first_name) back(slug, "No name column found. Name a column Name, Full name, First name or Business name.");
  if (!plan.mapped.email && !plan.mapped.phone) back(slug, "No email or phone column found.");

  const now = new Date().toISOString();
  const note = basis === "legitimate_interest" ? `Bought/imported list (${source}); legitimate interest, B2B. Email, LinkedIn and calls only, never WhatsApp.`
    : basis === "consent" ? `Imported from ${source}; consent confirmed by the importer.` : null;
  const toRow = (r: ImportRow) => ({ organization_id: ctx.company.id, ...r, source, lead_status: "new", consent_basis: basis, consent_at: basis === "none" ? null : now, consent_note: note });
  const ids: string[] = [];
  let existing = 0;
  for (let i = 0; i < plan.rows.length; i += 500) {
    const chunk = plan.rows.slice(i, i + 500);
    const { data, error } = await ctx.supabase.from("contacts").insert(chunk.map(toRow)).select("id");
    if (!error) { ids.push(...(data ?? []).map((d) => d.id as string)); continue; }
    // Some are already in this company: add the rest one by one.
    for (const r of chunk) {
      const one = await ctx.supabase.from("contacts").insert(toRow(r)).select("id").single();
      if (one.data) ids.push(one.data.id as string); else existing++;
    }
  }
  let enrolled = 0;
  if (seq && basis !== "none" && ids.length) {
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await ctx.supabase.from("outreach_enrollments").insert(ids.slice(i, i + 500).map((c) => ({ organization_id: ctx.company.id, sequence_id: seq, contact_id: c, next_step_at: now }))).select("id");
      enrolled += data?.length ?? 0;
    }
  }
  revalidatePath(`/c/${slug}/leads`);
  const cols = Object.entries(plan.mapped).map(([k, h]) => `${FIELD_LABELS[k as keyof typeof FIELD_LABELS]} ← "${h}"`).join(", ");
  back(slug, `Added ${ids.length} of ${plan.total} rows. Already in this company: ${existing}. Repeated in the file: ${plan.duplicatesInFile}. Missing name or valid email/phone: ${plan.invalid}.`
    + (enrolled ? ` Enrolled in the campaign: ${enrolled}.` : seq && basis === "none" ? " Not enrolled: leads with no lawful basis cannot get outreach." : "") + ` Columns used: ${cols}.`);
}

export async function addSearchAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.manage")) back(slug, "Only a sales manager or owner can add Apollo searches.");
  const titles = list(fd.get("titles")), locations = list(fd.get("locations"));
  const keywords = String(fd.get("keywords") ?? "").trim().slice(0, 200) || null;
  if (!titles.length && !locations.length && !keywords) back(slug, "Give at least job titles, locations or keywords.");
  const { error } = await ctx.supabase.from("lead_searches").insert({
    organization_id: ctx.company.id, name: z.string().trim().min(2).max(80).parse(fd.get("name")), titles, locations, keywords,
    employee_ranges: fd.getAll("employees").map(String).filter((s) => /^\d+,\d+$/.test(s)),
    per_run: z.coerce.number().int().min(1).max(100).catch(25).parse(fd.get("per_run")),
    enroll_sequence_id: z.uuid().nullable().catch(null).parse(fd.get("sequence_id") || null),
  });
  revalidatePath(`/c/${slug}/leads/import`);
  back(slug, error ? error.message : "Search saved. It runs daily once the Apollo automation is switched on in Automation.");
}

export async function searchStatusAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.manage")) throw new Error("Not allowed");
  const id = z.uuid().parse(fd.get("id"));
  const op = z.enum(["pause", "resume", "delete"]).parse(fd.get("op"));
  const q = ctx.supabase.from("lead_searches");
  await (op === "delete" ? q.delete() : q.update({ active: op === "resume" })).eq("id", id).eq("organization_id", ctx.company.id);
  revalidatePath(`/c/${slug}/leads/import`);
  back(slug, op === "delete" ? "Search removed." : op === "pause" ? "Search paused." : "Search resumed.");
}
