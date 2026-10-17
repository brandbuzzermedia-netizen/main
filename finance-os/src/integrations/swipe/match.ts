import { addDays } from "@/domain/dates";
import type { InvoiceRecord, RowIssue } from "./types";

export type MatchableClient = {
  id: string;
  client_code: string;
  legal_name: string;
  trading_name: string | null;
  gstin: string | null;
  source_aliases: string[];
  payment_terms_days: number;
};

/** Row payload accepted by public.import_invoices (see migration 3). */
export type ImportRow = {
  row_number: number;
  invoice_number: string;
  external_id: string | null;
  client_id: string;
  invoice_date: string;
  due_date: string;
  due_date_derived: boolean;
  billing_period_start: string | null;
  billing_period_end: string | null;
  currency: string;
  subtotal_minor: number | null;
  tax_minor: number;
  total_minor: number;
  pdf_url: string | null;
  source_status: "issued" | "cancelled";
  source_reported_status: string | null;
  source_reported_paid_minor: number | null;
};

const SUFFIXES = /\b(private limited|pvt\.? ?ltd\.?|pvt|limited|ltd\.?|llp|opc|inc\.?|co\.?|company)\b/g;

/** Comparable form of a business name: "Shobha Décor & Furniture Pvt. Ltd." → "shobha decor and furniture". */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type MatchResult = {
  rows: ImportRow[];
  issues: RowIssue[];
  /** Customer names that matched no client, with how many rows each affects. */
  unmatchedCustomers: { name: string; rows: number }[];
};

/**
 * Attach each record to a client: GSTIN first (exact), then normalized name against the
 * legal name, trading name and saved Swipe aliases. Ambiguous or missing matches are
 * reported, never guessed.
 */
export function matchClients(records: InvoiceRecord[], clients: MatchableClient[]): MatchResult {
  const byGstin = new Map<string, MatchableClient>();
  const byName = new Map<string, MatchableClient[]>();
  for (const c of clients) {
    if (c.gstin) byGstin.set(c.gstin.toUpperCase(), c);
    const names = new Set([c.legal_name, c.trading_name ?? "", c.client_code, ...c.source_aliases].map(normalizeName));
    for (const n of names) {
      if (!n) continue;
      byName.set(n, [...(byName.get(n) ?? []), c]);
    }
  }

  const rows: ImportRow[] = [];
  const issues: RowIssue[] = [];
  const unmatched = new Map<string, number>();

  for (const r of records) {
    let client: MatchableClient | undefined;
    if (r.customerGstin) client = byGstin.get(r.customerGstin);
    if (!client && r.customerName) {
      const candidates = byName.get(normalizeName(r.customerName)) ?? [];
      const unique = [...new Map(candidates.map((c) => [c.id, c])).values()];
      if (unique.length > 1) {
        issues.push({
          rowNumber: r.rowNumber,
          field: "customerName",
          message: `"${r.customerName}" matches ${unique.length} clients (${unique.map((c) => c.client_code).join(", ")}). Add the customer's GSTIN to the export or a Swipe alias to one client.`,
        });
        continue;
      }
      client = unique[0];
    }
    if (!client) {
      const name = r.customerName ?? "(blank)";
      unmatched.set(name, (unmatched.get(name) ?? 0) + 1);
      issues.push({
        rowNumber: r.rowNumber,
        field: "customerName",
        message: `No client matches "${name}". Create the client or add this name as a Swipe alias.`,
      });
      continue;
    }

    const dueDerived = r.dueDate === null;
    rows.push({
      row_number: r.rowNumber,
      invoice_number: r.invoiceNumber,
      external_id: r.externalId,
      client_id: client.id,
      invoice_date: r.invoiceDate,
      due_date: r.dueDate ?? addDays(r.invoiceDate, client.payment_terms_days),
      due_date_derived: dueDerived,
      billing_period_start: r.billingPeriodStart,
      billing_period_end: r.billingPeriodEnd,
      currency: r.currency,
      subtotal_minor: r.subtotalMinor,
      tax_minor: r.taxMinor,
      total_minor: r.totalMinor,
      pdf_url: r.pdfUrl,
      source_status: r.sourceStatus,
      source_reported_status: r.sourceReportedStatus,
      source_reported_paid_minor: r.sourceReportedPaidMinor,
    });
  }

  return {
    rows,
    issues,
    unmatchedCustomers: [...unmatched.entries()].map(([name, n]) => ({ name, rows: n })),
  };
}
