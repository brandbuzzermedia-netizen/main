"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";
import { todayInBusinessTz } from "@/domain/dates";
import { parseMoneyToMinor } from "@/domain/money";
import { toE164 } from "@/lib/lead-import";
import { FIELD_STATUSES, MAX_ROUTE_STOPS, OUTCOMES, planFieldImport, SEGMENTS, SOURCES } from "@/lib/field-sales";

async function writer(slug: string) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) throw new Error("Your role cannot change field sales records.");
  return ctx;
}
const opt = (v: FormDataEntryValue | null, max: number) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null; };
const coord = (v: FormDataEntryValue | null, lim: number) => { const s = String(v ?? "").trim(); if (!s) return null; const n = Number(s); return Number.isFinite(n) && Math.abs(n) <= lim ? Number(n.toFixed(6)) : null; };
const go = (slug: string, path: string, note: string): never => redirect(`/c/${slug}/field${path}${path.includes("?") ? "&" : "?"}note=${encodeURIComponent(note)}`);
/** "2026-11-25T16:00" from a phone's time picker is India time. */
const istInstant = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? `${s}:00+05:30` : null; };
const isNext = (e: unknown) => typeof e === "object" && e !== null && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_");

/** Adds or edits a field lead. A phone already in the OS opens that lead instead of making a duplicate. */
export async function saveLeadAction(slug: string, id: string, fd: FormData) {
  const ctx = await writer(slug);
  const org = ctx.company.id;
  const isNew = id === "new";
  const back = isNew ? "/leads/new" : `/leads/${id}`;
  try {
    const company = opt(fd.get("company_name"), 200);
    if (!company) return go(slug, back, "Not saved: enter the business name.");
    const rawPhone = opt(fd.get("phone"), 40), rawWa = opt(fd.get("whatsapp"), 40);
    const phone = rawPhone ? toE164(rawPhone) : null, wa = rawWa ? toE164(rawWa) : null;
    if ((rawPhone && !phone) || (rawWa && !wa)) return go(slug, back, "Not saved: phone and WhatsApp must be 10-digit Indian mobile numbers or start with +country code.");
    const lat = coord(fd.get("lat"), 90), lng = coord(fd.get("lng"), 180);
    const segment = z.enum(SEGMENTS).catch("other").parse(fd.get("segment"));
    const source = z.enum(SOURCES).catch("Other").parse(fd.get("source"));
    const ownerId = z.uuid().safeParse(fd.get("owner_id")).data ?? null;
    const lead = {
      company_name: company, full_name: opt(fd.get("owner_name"), 200) ?? company, phone_e164: phone, whatsapp_e164: wa ?? phone, field_segment: segment, source,
      address: opt(fd.get("address"), 500), area: opt(fd.get("area"), 120), lat: lat !== null && lng !== null ? lat : null, lng: lat !== null && lng !== null ? lng : null,
      place_id: lat !== null && lng !== null ? opt(fd.get("place_id"), 300) : null,
      next_follow_up_on: z.iso.date().nullable().catch(null).parse(opt(fd.get("next_follow_up_on"), 10)), notes: opt(fd.get("notes"), 4000),
      ...(ownerId && ctx.can("crm.manage") ? { owner_id: ownerId } : {}),
    };
    if (isNew) {
      if (phone) {
        const { data: dup } = await ctx.supabase.from("contacts").select("id, field_status").eq("organization_id", org).eq("phone_e164", phone).limit(1).maybeSingle();
        if (dup) {
          if (!dup.field_status) await ctx.supabase.from("contacts").update({ field_status: "to_visit", field_segment: segment, ...(lead.lat !== null ? { lat: lead.lat, lng: lead.lng, place_id: lead.place_id } : {}), ...(lead.address ? { address: lead.address } : {}), ...(lead.area ? { area: lead.area } : {}) }).eq("id", dup.id);
          revalidatePath(`/c/${slug}`, "layout");
          return go(slug, `/leads/${dup.id}`, dup.field_status ? "This phone number is already a lead, so it was opened instead of adding a duplicate." : "This phone number was already in your leads. It is now on your field list.");
        }
      }
      const { data, error } = await ctx.supabase.from("contacts").insert({ organization_id: org, ...lead, owner_id: lead.owner_id ?? ctx.userId, field_status: "to_visit" }).select("id").single();
      if (error) return go(slug, back, `Not saved: ${error.message}`);
      revalidatePath(`/c/${slug}`, "layout");
      return go(slug, `/leads/${data.id}`, "Lead added.");
    }
    if (phone) {
      const { data: dup } = await ctx.supabase.from("contacts").select("id, company_name").eq("organization_id", org).eq("phone_e164", phone).neq("id", id).limit(1).maybeSingle();
      if (dup) return go(slug, back, `Not saved: ${phone} already belongs to ${dup.company_name ?? "another lead"}.`);
    }
    const { error } = await ctx.supabase.from("contacts").update(lead).eq("id", id).eq("organization_id", org);
    revalidatePath(`/c/${slug}`, "layout");
    return go(slug, back, error ? `Not saved: ${error.message}` : "Saved.");
  } catch (e) {
    if (isNext(e)) throw e;
    return go(slug, back, `Not saved: ${e instanceof Error ? e.message : "try again"}`);
  }
}

/** Check-in: the phone's location and time, plus the outcome picked with one tap. The database moves the lead's status and follow-up. */
export async function checkInAction(slug: string, id: string, fd: FormData) {
  const ctx = await writer(slug);
  const outcome = z.enum(OUTCOMES).safeParse(fd.get("outcome"));
  if (!outcome.success) return go(slug, `/leads/${id}`, "Pick what happened.");
  const lat = coord(fd.get("lat"), 90), lng = coord(fd.get("lng"), 180);
  const acc = Number(fd.get("accuracy"));
  let amount: number | null = null;
  const rawAmount = opt(fd.get("amount"), 20);
  if (rawAmount) { try { amount = parseMoneyToMinor(rawAmount); } catch { return go(slug, `/leads/${id}`, "Not saved: the amount looks wrong."); } }
  if (outcome.data === "paid_advance" && !amount) return go(slug, `/leads/${id}?checkin=1`, "Enter the advance amount, then tap Paid advance.");
  const { error } = await ctx.supabase.from("field_visits").insert({
    organization_id: ctx.company.id, contact_id: id, outcome: outcome.data, created_by: ctx.userId,
    owner_back_at: outcome.data === "owner_absent" ? istInstant(fd.get("owner_back_at")) : null,
    amount_minor: amount, note: opt(fd.get("note"), 2000),
    lat: lat !== null && lng !== null ? lat : null, lng: lat !== null && lng !== null ? lng : null, accuracy_m: Number.isFinite(acc) && acc >= 0 ? Math.min(acc, 999999) : null,
  });
  revalidatePath(`/c/${slug}`, "layout");
  if (error) return go(slug, `/leads/${id}`, `Not saved: ${error.message}`);
  const msg = { owner_absent: "Visit logged: owner absent. Follow-up set for when they are back.", demo_shown: "Visit logged: demo shown. Follow-up in 2 days.",
    interested: "Visit logged: interested. Follow-up tomorrow.", paid_advance: "Advance logged. The delivery team has a task due in 7 days.", not_interested: "Visit logged: marked lost." }[outcome.data];
  return go(slug, `/leads/${id}`, msg + (lat === null ? " (No location: the phone did not share it.)" : ""));
}

/** Manual status change (e.g. Delivered, Final paid, or Lost with a reason). */
export async function setStatusAction(slug: string, id: string, fd: FormData) {
  const ctx = await writer(slug);
  const status = z.enum(FIELD_STATUSES).safeParse(fd.get("status"));
  if (!status.success) return go(slug, `/leads/${id}`, "Pick a status.");
  const reason = opt(fd.get("lost_reason"), 300);
  if (status.data === "lost" && !reason) return go(slug, `/leads/${id}`, "Give a reason when marking a lead lost.");
  const { error } = await ctx.supabase.from("contacts").update({ field_status: status.data, ...(status.data === "lost" ? { lost_reason: reason, next_follow_up_on: null } : {}) })
    .eq("id", id).eq("organization_id", ctx.company.id);
  revalidatePath(`/c/${slug}`, "layout");
  return go(slug, `/leads/${id}`, error ? `Not saved: ${error.message}` : status.data === "advance_paid" ? "Advance paid. The delivery team has a task due in 7 days." : "Status updated.");
}

/** Bulk add from pasted rows or a CSV. Duplicates by phone are skipped; leads already in the OS join the field list. */
export async function importFieldLeadsAction(slug: string, fd: FormData) {
  const ctx = await writer(slug);
  const file = fd.get("file");
  const text = file instanceof File && file.size > 0 ? (file.size > 2_000_000 ? "" : await file.text()) : String(fd.get("text") ?? "");
  if (!text.trim()) return go(slug, "/import", "Paste rows or choose a CSV file (up to 2 MB).");
  const plan = planFieldImport(text);
  if (!plan.rows.length) return go(slug, "/import", `Nothing to add. ${plan.invalid} row(s) had no business name or valid phone. Check the header row: Business name, Owner, Phone, Address, Area, Segment.`);
  const phones = plan.rows.map((r) => r.phone_e164!).filter(Boolean);
  const existing = new Map<string, { id: string; field_status: string | null }>();
  for (let i = 0; i < phones.length; i += 200) {
    const { data } = await ctx.supabase.from("contacts").select("id, phone_e164, field_status").eq("organization_id", ctx.company.id).in("phone_e164", phones.slice(i, i + 200));
    (data ?? []).forEach((c) => existing.set(c.phone_e164 as string, { id: c.id, field_status: c.field_status }));
  }
  const fresh = plan.rows.filter((r) => !existing.has(r.phone_e164!));
  const joining = plan.rows.filter((r) => existing.get(r.phone_e164!)?.field_status === null);
  for (let i = 0; i < fresh.length; i += 500) {
    const { error } = await ctx.supabase.from("contacts").insert(fresh.slice(i, i + 500).map((r) => ({ organization_id: ctx.company.id, owner_id: ctx.userId, field_status: "to_visit", ...r })));
    if (error) return go(slug, "/import", `Stopped after ${i} rows: ${error.message}`);
  }
  for (const r of joining) await ctx.supabase.from("contacts").update({ field_status: "to_visit", field_segment: r.field_segment }).eq("id", existing.get(r.phone_e164!)!.id);
  revalidatePath(`/c/${slug}`, "layout");
  const skipped = plan.rows.length - fresh.length - joining.length;
  return go(slug, "/leads", `Added ${fresh.length} lead(s).${joining.length ? ` ${joining.length} already in the OS joined the field list.` : ""}${skipped ? ` ${skipped} already on the field list were skipped.` : ""}${plan.duplicatesInFile ? ` ${plan.duplicatesInFile} duplicate row(s) in the file were skipped.` : ""}${plan.invalid ? ` ${plan.invalid} row(s) had no name or valid phone.` : ""}`);
}

/** Saves today's route (up to 9 leads, in visiting order) for the signed-in person. */
export async function saveRouteAction(slug: string, ids: string[]) {
  const ctx = await writer(slug);
  const clean = [...new Set(ids.filter((x) => z.uuid().safeParse(x).success))].slice(0, MAX_ROUTE_STOPS);
  const { error } = await ctx.supabase.from("field_route_plans").upsert({ organization_id: ctx.company.id, user_id: ctx.userId, plan_date: todayInBusinessTz(), contact_ids: clean },
    { onConflict: "organization_id,user_id,plan_date" });
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/field`);
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Brand details and uploads for a delivery handoff. */
export async function saveHandoffAction(slug: string, id: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write") && !ctx.can("tasks.write")) throw new Error("Not allowed");
  const back = `/handoffs/${id}`;
  const { data: h } = await ctx.supabase.from("delivery_handoffs").select("id, organization_id, logo_path, photo_paths, task_id").eq("id", id).eq("organization_id", ctx.company.id).maybeSingle();
  if (!h) return go(slug, "/handoffs", "Handoff not found.");
  const upload = async (f: File) => {
    if (!EXT[f.type]) throw new Error(`${f.name}: use PNG, JPG or WebP.`);
    if (f.size > 4_000_000) throw new Error(`${f.name} is over 4 MB.`);
    const path = `${ctx.company.id}/${id}/${crypto.randomUUID()}.${EXT[f.type]}`;
    const { error } = await ctx.supabase.storage.from("handoffs").upload(path, f, { contentType: f.type });
    if (error) throw new Error(error.message);
    return path;
  };
  try {
    const logo = fd.get("logo");
    const photos = fd.getAll("photos").filter((x): x is File => x instanceof File && x.size > 0);
    const logoPath = logo instanceof File && logo.size > 0 ? await upload(logo) : h.logo_path;
    const remove = new Set(fd.getAll("remove_photo").map(String));
    const kept = (h.photo_paths as string[]).filter((p) => !remove.has(p));
    if (kept.length + photos.length > 12) return go(slug, back, "Not saved: up to 12 photos.");
    const added = [];
    for (const p of photos) added.push(await upload(p));
    if (remove.size) await ctx.supabase.storage.from("handoffs").remove([...remove].filter((p) => p.startsWith(`${ctx.company.id}/${id}/`)));
    const status = z.enum(["awaiting_details", "ready", "in_progress", "done"]).catch("awaiting_details").parse(fd.get("status"));
    const { error } = await ctx.supabase.from("delivery_handoffs").update({
      services: opt(fd.get("services"), 2000), brand_colours: opt(fd.get("brand_colours"), 300), contact_name: opt(fd.get("contact_name"), 200),
      contact_phone: opt(fd.get("contact_phone"), 40), contact_email: opt(fd.get("contact_email"), 200), notes: opt(fd.get("notes"), 4000),
      logo_path: logoPath, photo_paths: [...kept, ...added], status,
    }).eq("id", id);
    if (error) return go(slug, back, `Not saved: ${error.message}`);
    if (h.task_id && status === "done") await ctx.supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", h.task_id);
    revalidatePath(`/c/${slug}`, "layout");
    return go(slug, back, "Saved.");
  } catch (e) {
    if (isNext(e)) throw e;
    return go(slug, back, `Not saved: ${e instanceof Error ? e.message : "upload failed"}`);
  }
}

/** Who gets delivery tasks, and how many days they have. */
export async function saveFieldSettingsAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("company.settings")) throw new Error("Not allowed");
  const days = Math.round(Number(fd.get("handoff_days")));
  const { error } = await ctx.supabase.from("field_sales_settings").upsert({ organization_id: ctx.company.id,
    delivery_assignee_id: z.uuid().safeParse(fd.get("delivery_assignee_id")).data ?? null, handoff_days: days >= 1 && days <= 60 ? days : 7 });
  revalidatePath(`/c/${slug}/field`);
  return go(slug, "/handoffs", error ? `Not saved: ${error.message}` : "Delivery settings saved.");
}
