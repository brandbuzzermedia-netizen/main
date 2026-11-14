"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCompanyContext } from "@/lib/workspace";
import { MAX_UPLOAD_BYTES, safeFileName, sniffMime } from "@/lib/files";
import { emptyBill, extractBill, fieldsNeedingReview, type BillExtraction } from "@/integrations/ai/claude";
import { parseMoneyToMinor } from "@/domain/money";

export type UploadState = { error?: string; duplicateOf?: string };

/** Upload original → store privately → extract → open the review screen. */
export async function uploadBillAction(slug: string, _p: UploadState, fd: FormData): Promise<UploadState> {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("documents.write")) return { error: "Your role cannot upload documents." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a bill (PDF or photo)." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "Files must be 15 MB or smaller." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) return { error: "Only PDF, JPEG, PNG, WebP or HEIC files are accepted." };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { data: dup } = await ctx.supabase.from("documents").select("id").eq("organization_id", ctx.company.id).eq("sha256", sha256).maybeSingle();
  if (dup) return { error: "This exact file was uploaded before.", duplicateOf: dup.id as string };

  const id = randomUUID();
  const path = `${ctx.company.id}/${id}/${safeFileName(file.name)}`;
  const up = await ctx.supabase.storage.from("documents").upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) return { error: `Upload failed: ${up.error.message}` };
  const doc = await ctx.supabase.from("documents").insert({
    id, organization_id: ctx.company.id, storage_path: path, file_name: file.name.slice(0, 200), mime_type: mime, size_bytes: file.size, sha256,
    kind: "bill", uploaded_by: ctx.userId,
  });
  if (doc.error) return { error: doc.error.message };

  // AI extraction only when enabled for the company and within its monthly budget; otherwise mock (empty fields, labelled).
  const { data: settings } = await ctx.supabase.from("app_settings").select("ai_enabled").eq("organization_id", ctx.company.id).maybeSingle();
  const { data: remaining } = await ctx.supabase.rpc("ai_budget_remaining", { p_org: ctx.company.id });
  const allowed = Boolean(settings?.ai_enabled) && Number(remaining ?? 0) > 20000;
  const x = allowed ? await extractBill({ bytes, mime }) : { result: emptyBill(), usage: { model: "mock", input_tokens: 0, output_tokens: 0, is_mock: true, refused: false }, error: undefined };
  await ctx.supabase.from("ocr_extractions").insert({
    organization_id: ctx.company.id, document_id: id, provider: x.usage.is_mock ? "mock" : "anthropic", model: x.usage.model, is_mock: x.usage.is_mock,
    status: x.error ? "failed" : "extracted", fields: x.result, error: x.error ?? (allowed ? null : "AI extraction is off or over budget for this company; fields are empty for manual entry."),
  });
  if (!x.usage.is_mock) {
    await ctx.supabase.from("ai_usage_log").insert({ organization_id: ctx.company.id, user_id: ctx.userId, purpose: "bill_extraction", model: x.usage.model,
      input_tokens: x.usage.input_tokens, output_tokens: x.usage.output_tokens, refused: x.usage.refused, outcome: x.error ? "error" : "draft" });
  }
  redirect(`/c/${slug}/finance?tab=expenses&bill=${id}`);
}

const reviewSchema = z.object({
  extraction_id: z.uuid(), legal_entity_id: z.uuid(), category: z.string().trim().min(1).max(60), vendor_name: z.string().trim().min(1, "Vendor is required").max(200),
  vendor_gstin: z.string().trim().regex(/^([0-9]{2}[A-Z0-9]{13})?$/, "GSTIN must be 15 characters").optional(), bill_number: z.string().trim().max(60).optional(),
  bill_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bill date is required"), due_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional(),
  total: z.string().min(1, "Total is required"), cgst: z.string().optional(), sgst: z.string().optional(), igst: z.string().optional(), cess: z.string().optional(),
  place_of_supply: z.string().max(60).optional(), rental_unit_id: z.uuid().optional().or(z.literal("")),
});

export type ReviewState = { error?: string };

/** Person confirms the fields → extraction marked reviewed → expense created pending approval. */
export async function submitReviewAction(slug: string, docId: string, _p: ReviewState, fd: FormData): Promise<ReviewState> {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("documents.write") || !ctx.can("finance.write")) return { error: "You need document and finance access to submit bills." };
  const p = reviewSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return { error: p.error.issues[0].message };
  const { data: ex } = await ctx.supabase.from("ocr_extractions").select("id, fields, status").eq("id", p.data.extraction_id).eq("document_id", docId).single();
  if (!ex || ex.status === "reviewed") return { error: "This bill was already reviewed." };
  // Every low-confidence or missing field must be explicitly confirmed.
  const unchecked = fieldsNeedingReview(ex.fields as BillExtraction).filter((k) => ["vendor_name", "bill_date", "total"].includes(k) && fd.get(`checked_${k}`) !== "on");
  if (unchecked.length) return { error: `Tick "checked" for: ${unchecked.join(", ").replace(/_/g, " ")}.` };
  let total: number, tax: number[];
  try {
    total = parseMoneyToMinor(p.data.total);
    tax = [p.data.cgst, p.data.sgst, p.data.igst, p.data.cess].map((v) => (v ? parseMoneyToMinor(v) : 0));
  } catch (e) { return { error: (e as Error).message }; }
  const corrected = Object.fromEntries(Object.entries(p.data).filter(([k]) => !["extraction_id", "legal_entity_id", "rental_unit_id"].includes(k)));
  const r1 = await ctx.supabase.from("ocr_extractions").update({ status: "reviewed", corrected, reviewed_by: ctx.userId, reviewed_at: new Date().toISOString() }).eq("id", ex.id);
  if (r1.error) return { error: r1.error.message };
  const r2 = await ctx.supabase.from("ledger_entries").insert({
    organization_id: ctx.company.id, legal_entity_id: p.data.legal_entity_id, entry_type: "expense", category: p.data.category,
    description: `Bill ${p.data.bill_number ?? ""} · ${p.data.vendor_name}`.trim(), counterparty: p.data.vendor_name, txn_date: p.data.bill_date,
    due_on: p.data.due_date || null, amount_minor: total, tax_minor: tax.reduce((a, b) => a + b, 0), cgst_minor: tax[0], sgst_minor: tax[1], igst_minor: tax[2], cess_minor: tax[3],
    vendor_gstin: p.data.vendor_gstin || null, bill_number: p.data.bill_number || null, place_of_supply: p.data.place_of_supply || null,
    source_document_id: docId, ocr_extraction_id: ex.id, rental_unit_id: p.data.rental_unit_id || null, status: "pending_approval", submitted_at: new Date().toISOString(),
  });
  if (r2.error) return { error: r2.error.message };
  revalidatePath(`/c/${slug}/finance`, "layout");
  redirect(`/c/${slug}/finance?tab=expenses&bill=${docId}`);
}

export async function rejectBillAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("documents.write")) throw new Error("Not allowed");
  const id = z.uuid().parse(fd.get("extraction_id"));
  const { error } = await ctx.supabase.from("ocr_extractions").update({ status: "rejected" }).eq("id", id).eq("organization_id", ctx.company.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/c/${slug}/finance`, "layout");
  redirect(`/c/${slug}/finance?tab=expenses`);
}

/** Reads the original again (new extraction row; the earlier one is kept). */
export async function rescanAction(slug: string, fd: FormData) {
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("documents.write")) throw new Error("Not allowed");
  const docId = z.uuid().parse(fd.get("document_id"));
  const { data: doc } = await ctx.supabase.from("documents").select("storage_path, mime_type").eq("id", docId).eq("organization_id", ctx.company.id).single();
  const { data: settings } = await ctx.supabase.from("app_settings").select("ai_enabled").eq("organization_id", ctx.company.id).maybeSingle();
  const { data: remaining } = await ctx.supabase.rpc("ai_budget_remaining", { p_org: ctx.company.id });
  if (!doc || !settings?.ai_enabled || Number(remaining ?? 0) <= 20000) redirect(`/c/${slug}/finance?tab=expenses&bill=${docId}&edit=1`);
  const file = await ctx.supabase.storage.from("documents").download(doc.storage_path as string);
  if (file.error || !file.data) throw new Error("The original could not be read from storage.");
  const x = await extractBill({ bytes: new Uint8Array(await file.data.arrayBuffer()), mime: doc.mime_type as string });
  await ctx.supabase.from("ocr_extractions").insert({ organization_id: ctx.company.id, document_id: docId, provider: "anthropic", model: x.usage.model, is_mock: false,
    status: x.error ? "failed" : "extracted", fields: x.result, error: x.error ?? null });
  await ctx.supabase.from("ai_usage_log").insert({ organization_id: ctx.company.id, user_id: ctx.userId, purpose: "bill_extraction", model: x.usage.model,
    input_tokens: x.usage.input_tokens, output_tokens: x.usage.output_tokens, refused: x.usage.refused, outcome: x.error ? "error" : "draft" });
  revalidatePath(`/c/${slug}/finance`, "layout");
  redirect(`/c/${slug}/finance?tab=expenses&bill=${docId}`);
}
