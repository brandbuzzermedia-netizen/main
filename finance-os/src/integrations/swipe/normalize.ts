import { parseFlexibleDate, DateParseError } from "@/domain/dates";
import { parseMoneyToMinor, MoneyParseError } from "@/domain/money";
import type { InvoiceRecord, RowIssue } from "./types";

/**
 * Column names accepted for each field. Swipe's export headers are not documented
 * publicly, so we accept common variants plus our own template headers (first in each list),
 * and show unknown columns to the user instead of guessing.
 */
export const COLUMN_ALIASES = {
  invoiceNumber: ["invoice_number", "invoice number", "invoice no", "invoice no.", "invoice #", "bill no", "bill number", "document number", "doc no", "serial number", "serial no"],
  externalId: ["swipe_id", "swipe id", "document id", "doc id"],
  customerName: ["customer", "customer name", "client", "client name", "party", "party name", "billing name", "bill to", "company name"],
  customerGstin: ["customer_gstin", "customer gstin", "gstin", "party gstin", "gst number", "gstin/uin"],
  invoiceDate: ["invoice_date", "invoice date", "date", "document date", "bill date"],
  dueDate: ["due_date", "due date", "payment due date", "due on"],
  billingPeriodStart: ["billing_period_start", "billing period start", "period start", "service from"],
  billingPeriodEnd: ["billing_period_end", "billing period end", "period end", "service to"],
  currency: ["currency"],
  subtotal: ["subtotal", "sub total", "taxable amount", "taxable value", "amount before tax", "net amount"],
  tax: ["tax", "total tax", "tax amount", "gst", "gst amount", "total gst"],
  total: ["total", "total amount", "grand total", "invoice amount", "invoice total", "amount", "bill amount"],
  paid: ["paid", "paid amount", "amount paid", "received", "amount received"],
  status: ["status", "payment status", "invoice status"],
  pdfUrl: ["pdf_url", "pdf url", "pdf", "link", "invoice link", "url", "share link"],
} as const;

export type FieldKey = keyof typeof COLUMN_ALIASES;

const REQUIRED: FieldKey[] = ["invoiceNumber", "customerName", "invoiceDate", "total"];

function norm(h: string): string {
  return h.trim().toLowerCase().replace(/[_\s]+/g, " ").replace(/[:*]+$/, "").trim();
}

export type HeaderMapping = {
  columns: Partial<Record<FieldKey, number>>;
  missing: FieldKey[];
  unmapped: string[];
};

export function mapHeaders(headers: string[]): HeaderMapping {
  const normalized = headers.map(norm);
  const columns: Partial<Record<FieldKey, number>> = {};
  const used = new Set<number>();
  for (const key of Object.keys(COLUMN_ALIASES) as FieldKey[]) {
    for (const alias of COLUMN_ALIASES[key]) {
      const target = norm(alias);
      const idx = normalized.findIndex((h, i) => !used.has(i) && h === target);
      if (idx >= 0) {
        columns[key] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return {
    columns,
    missing: REQUIRED.filter((k) => columns[k] === undefined),
    unmapped: headers.filter((_, i) => !used.has(i) && headers[i].trim() !== ""),
  };
}

const CANCELLED = /^(cancel+ed|void|voided|deleted)$/i;

export type NormalizeResult = { records: InvoiceRecord[]; issues: RowIssue[] };

/** Turn CSV rows (header first) into validated InvoiceRecords. Never throws on bad rows. */
export function normalizeRows(rows: string[][], mapping: HeaderMapping): NormalizeResult {
  const records: InvoiceRecord[] = [];
  const issues: RowIssue[] = [];
  const seen = new Map<string, InvoiceRecord>();

  rows.slice(1).forEach((cells, i) => {
    const rowNumber = i + 2; // spreadsheet row, header is row 1
    const get = (k: FieldKey) => {
      const idx = mapping.columns[k];
      return idx === undefined ? "" : (cells[idx] ?? "").trim();
    };
    const rowIssues: RowIssue[] = [];
    const date = (k: FieldKey, required: boolean): string | null => {
      const v = get(k);
      if (!v) {
        if (required) rowIssues.push({ rowNumber, field: k, message: `${k} is required` });
        return null;
      }
      try {
        return parseFlexibleDate(v);
      } catch (e) {
        rowIssues.push({ rowNumber, field: k, message: e instanceof DateParseError ? e.message : String(e) });
        return null;
      }
    };
    const money = (k: FieldKey, required: boolean): number | null => {
      const v = get(k);
      if (!v) {
        if (required) rowIssues.push({ rowNumber, field: k, message: `${k} is required` });
        return null;
      }
      try {
        return parseMoneyToMinor(v);
      } catch (e) {
        rowIssues.push({ rowNumber, field: k, message: e instanceof MoneyParseError ? e.message : String(e) });
        return null;
      }
    };

    const invoiceNumber = get("invoiceNumber");
    if (!invoiceNumber) rowIssues.push({ rowNumber, field: "invoiceNumber", message: "Invoice number is required" });
    const customerName = get("customerName") || null;
    if (!customerName) rowIssues.push({ rowNumber, field: "customerName", message: "Customer is required" });
    const invoiceDate = date("invoiceDate", true);
    const dueDate = date("dueDate", false);
    const billingPeriodStart = date("billingPeriodStart", false);
    const billingPeriodEnd = date("billingPeriodEnd", false);
    const totalMinor = money("total", true);
    const taxMinor = money("tax", false) ?? 0;
    const subtotalMinor = money("subtotal", false);
    const paidMinor = money("paid", false);
    const statusText = get("status") || null;
    const currency = (get("currency") || "INR").toUpperCase();
    const pdfUrl = get("pdfUrl") || null;

    if (invoiceDate && dueDate && dueDate < invoiceDate) {
      rowIssues.push({ rowNumber, field: "dueDate", message: "Due date is before the invoice date" });
    }
    if (billingPeriodStart && billingPeriodEnd && billingPeriodEnd < billingPeriodStart) {
      rowIssues.push({ rowNumber, field: "billingPeriodEnd", message: "Billing period ends before it starts" });
    }
    if (!/^[A-Z]{3}$/.test(currency)) rowIssues.push({ rowNumber, field: "currency", message: `Unknown currency "${currency}"` });
    if (pdfUrl && !/^https:\/\//i.test(pdfUrl)) {
      rowIssues.push({ rowNumber, field: "pdfUrl", message: "Invoice link must start with https://" });
    }
    if (totalMinor !== null && subtotalMinor !== null && subtotalMinor + taxMinor !== totalMinor) {
      // Rounding in Swipe ("round off") can make these differ slightly; allow up to ₹1.
      if (Math.abs(subtotalMinor + taxMinor - totalMinor) > 100) {
        rowIssues.push({ rowNumber, field: "total", message: "Subtotal + tax does not equal total" });
      }
    }
    if (totalMinor !== null && paidMinor !== null && paidMinor > totalMinor) {
      rowIssues.push({ rowNumber, field: "paid", message: "Paid amount is more than the invoice total" });
    }

    if (rowIssues.length > 0 || !invoiceDate || totalMinor === null) {
      issues.push(...rowIssues);
      return;
    }

    const record: InvoiceRecord = {
      rowNumber,
      invoiceNumber,
      externalId: get("externalId") || null,
      customerName,
      customerGstin: get("customerGstin").toUpperCase() || null,
      invoiceDate,
      dueDate,
      billingPeriodStart,
      billingPeriodEnd,
      currency,
      subtotalMinor,
      taxMinor,
      totalMinor,
      pdfUrl,
      sourceStatus: statusText && CANCELLED.test(statusText) ? "cancelled" : "issued",
      sourceReportedStatus: statusText,
      sourceReportedPaidMinor: paidMinor,
    };

    const prior = seen.get(invoiceNumber);
    if (prior) {
      const same = JSON.stringify({ ...prior, rowNumber: 0 }) === JSON.stringify({ ...record, rowNumber: 0 });
      if (!same) {
        issues.push({
          rowNumber,
          field: "invoiceNumber",
          message: `Invoice ${invoiceNumber} appears again (row ${prior.rowNumber}) with different values`,
        });
      }
      return; // exact repeats are dropped silently
    }
    seen.set(invoiceNumber, record);
    records.push(record);
  });

  return { records, issues };
}
