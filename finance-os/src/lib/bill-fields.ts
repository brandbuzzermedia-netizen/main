import { formatDate } from "@/domain/dates";
import type { BillExtraction } from "@/integrations/ai/claude";
import type { BillField } from "@/views/finance";

function chip(...fs: ({ value: string | null; confidence: number } | undefined)[]): BillField["c"] {
  if (fs.some((f) => !f || f.value === null)) return "Missing";
  const m = Math.min(...fs.map((f) => f!.confidence));
  return m >= 0.85 ? "High" : m >= 0.6 ? "Check" : "Low";
}

/** The design's review rows for one bill, with a confidence chip per field. */
export function billFields(f: BillExtraction): BillField[] {
  const v = (x?: { value: string | null }) => x?.value ?? null;
  return [
    { l: "Vendor", v: v(f.vendor_name) ?? "Not found", c: chip(f.vendor_name) },
    { l: "GSTIN", v: v(f.vendor_gstin) ?? "Not printed", c: chip(f.vendor_gstin) },
    { l: "Bill no. / date", v: [v(f.bill_number), v(f.bill_date) && formatDate(v(f.bill_date))].filter(Boolean).join(" · ") || "Not found", c: chip(f.bill_number, f.bill_date) },
    { l: "Taxable value", v: v(f.taxable_value) ? `₹${v(f.taxable_value)}` : "Not found", c: chip(f.taxable_value) },
    { l: "CGST / SGST", v: `${v(f.cgst) ?? "—"} / ${v(f.sgst) ?? "—"}`, c: chip(f.cgst, f.sgst) },
    { l: "IGST / cess", v: `${v(f.igst) ?? "—"} / ${v(f.cess) ?? "—"}`, c: chip(f.igst, f.cess) === "Missing" ? "Low" : chip(f.igst, f.cess) },
    { l: "Total", v: v(f.total) ? `₹${v(f.total)}` : "Not found", c: chip(f.total) },
    { l: "Currency", v: v(f.currency) ?? "INR", c: f.currency?.value ? chip(f.currency) : "Check" },
    { l: "Due date", v: v(f.due_date) ? formatDate(v(f.due_date)) : "Not found", c: chip(f.due_date) },
    { l: "Suggested category", v: v(f.suggested_category) ? `${v(f.suggested_category)} (suggestion)` : "None", c: f.suggested_category?.value ? "Low" : "Missing" },
    { l: "Entity / unit", v: "Chosen on review", c: "Low" },
  ];
}
