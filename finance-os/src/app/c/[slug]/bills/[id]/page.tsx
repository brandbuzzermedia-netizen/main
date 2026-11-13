import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { fieldsNeedingReview, type BillExtraction } from "@/integrations/ai/claude";
import { parseMoneyToMinor } from "@/domain/money";
import { formatDateTime } from "@/domain/dates";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { ReviewForm, type ReviewField } from "../forms";
import { rejectBillAction } from "../actions";

export const metadata: Metadata = { title: "Review bill" };
const LABELS: [Exclude<keyof BillExtraction, "line_items">, string, "date"?][] = [
  ["vendor_name", "Vendor"], ["vendor_gstin", "Vendor GSTIN"], ["bill_number", "Bill number"], ["bill_date", "Bill date", "date"], ["due_date", "Due date", "date"],
  ["taxable_value", "Taxable value"], ["cgst", "CGST"], ["sgst", "SGST"], ["igst", "IGST"], ["cess", "Cess"], ["total", "Total (incl. tax)"], ["place_of_supply", "Place of supply"], ["suggested_category", "Suggested category"],
];

export default async function ReviewBillPage({ params }: PageProps<"/c/[slug]/bills/[id]">) {
  const { slug, id } = await params;
  const ctx = await getCompanyContext(slug);
  const { data: doc } = await ctx.supabase.from("documents").select("id, storage_path, file_name, mime_type, created_at").eq("id", id).eq("organization_id", ctx.company.id).maybeSingle();
  if (!doc) notFound();
  const [{ data: ex }, signed, entities, units, posted] = await Promise.all([
    ctx.supabase.from("ocr_extractions").select("*").eq("document_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ctx.supabase.storage.from("documents").createSignedUrl(doc.storage_path as string, 300),
    ctx.supabase.from("legal_entities").select("id, name").eq("organization_id", ctx.company.id),
    ctx.supabase.from("rental_units").select("id, label").eq("organization_id", ctx.company.id),
    ctx.supabase.from("ledger_entries").select("id, status, amount_minor").eq("source_document_id", id),
  ]);
  const fields = (ex?.fields ?? {}) as BillExtraction;
  const needs = new Set(ex ? fieldsNeedingReview(fields) : []);
  const reviewFields: ReviewField[] = LABELS.map(([k, label, type]) => ({ key: k, label, type, value: fields[k]?.value ?? "", confidence: fields[k]?.confidence ?? 0, needsCheck: needs.has(k) && ["vendor_name", "bill_date", "total"].includes(k) }));
  let duplicates: string[] = [];
  const totalStr = fields.total?.value;
  if (fields.vendor_name?.value) {
    let amount: number | null = null;
    try { amount = totalStr ? parseMoneyToMinor(totalStr) : null; } catch { amount = null; }
    const dup = await ctx.supabase.rpc("possible_duplicate_bills", { p_org: ctx.company.id, p_vendor: fields.vendor_name.value, p_bill_number: fields.bill_number?.value ?? null, p_date: fields.bill_date?.value ?? "1900-01-01", p_amount_minor: amount ?? -1 });
    duplicates = ((dup.data ?? []) as { description: string; reason: string }[]).map((d) => `${d.reason}: ${d.description}`);
  }
  const url = signed.data?.signedUrl;
  return (
    <>
      <PageHeader title="Review bill" description={`${doc.file_name} · uploaded ${formatDateTime(doc.created_at as string)}. Original kept privately; this link expires in 5 minutes.`} />
      {ex?.is_mock && <div className="mb-4"><Alert tone="info" title="Manual entry">{ex.error ?? "OCR ran in mock mode: no fields were read automatically. Enter them from the original."}</Alert></div>}
      {ex?.status === "failed" && !ex.is_mock && <div className="mb-4"><Alert tone="warn">{ex.error}</Alert></div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Original">
          {url ? (doc.mime_type === "application/pdf"
            ? <iframe title="Original bill" src={url} className="h-[70vh] w-full rounded-lg border border-line" />
            // eslint-disable-next-line @next/next/no-img-element -- signed private URL, not optimisable
            : <img src={url} alt="Original bill" className="max-h-[70vh] w-full rounded-lg border border-line object-contain" />)
            : <p className="text-sm text-danger">The original could not be opened. It has not been deleted; try again.</p>}
        </Card>
        <Card title="Extracted fields" actions={ex && <Badge tone={ex.status === "reviewed" ? "ok" : "warn"}>{ex.status}</Badge>}>
          {posted.data && posted.data.length > 0 ? (
            <Alert tone="ok">Submitted. Ledger status: {posted.data.map((p) => p.status).join(", ")}.</Alert>
          ) : ex && ex.status !== "rejected" ? (
            <>
              <ReviewForm slug={slug} docId={id} extractionId={ex.id as string} fields={reviewFields} duplicates={duplicates}
                entities={(entities.data ?? []).map((e) => ({ id: e.id as string, label: e.name as string }))} units={(units.data ?? []).map((u) => ({ id: u.id as string, label: u.label as string }))} />
              <form action={rejectBillAction.bind(null, slug)} className="mt-4 border-t border-line pt-3">
                <input type="hidden" name="extraction_id" value={ex.id as string} />
                <button className="text-sm text-danger underline">Reject (keeps the original)</button>
              </form>
            </>
          ) : <p className="text-sm text-muted">Rejected. The original stays in the vault.</p>}
        </Card>
      </div>
    </>
  );
}
