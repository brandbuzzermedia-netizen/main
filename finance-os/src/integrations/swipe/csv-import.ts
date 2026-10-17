import { parseCsv } from "./csv";
import { mapHeaders, normalizeRows, type FieldKey } from "./normalize";
import { matchClients, type ImportRow, type MatchableClient } from "./match";
import type { RowIssue } from "./types";

export const MAX_IMPORT_BYTES = 1_000_000;

export type ImportPlan = {
  totalRows: number;
  rows: ImportRow[];
  issues: RowIssue[];
  mapped: Partial<Record<FieldKey, string>>;
  missingColumns: FieldKey[];
  unmappedColumns: string[];
  unmatchedCustomers: { name: string; rows: number }[];
};

/** Pure: CSV text + the org's clients → rows ready for public.import_invoices, plus every problem found. */
export function planCsvImport(text: string, clients: MatchableClient[]): ImportPlan {
  const table = parseCsv(text);
  if (table.length === 0) throw new Error("The file is empty.");
  const mapping = mapHeaders(table[0]);
  const mapped = Object.fromEntries(
    Object.entries(mapping.columns).map(([k, i]) => [k, table[0][i as number]]),
  ) as Partial<Record<FieldKey, string>>;
  if (mapping.missing.length > 0) {
    return {
      totalRows: table.length - 1,
      rows: [],
      issues: [],
      mapped,
      missingColumns: mapping.missing,
      unmappedColumns: mapping.unmapped,
      unmatchedCustomers: [],
    };
  }
  const normalized = normalizeRows(table, mapping);
  const matched = matchClients(normalized.records, clients);
  return {
    totalRows: table.length - 1,
    rows: matched.rows,
    issues: [...normalized.issues, ...matched.issues].sort((a, b) => a.rowNumber - b.rowNumber),
    mapped,
    missingColumns: [],
    unmappedColumns: mapping.unmapped,
    unmatchedCustomers: matched.unmatchedCustomers,
  };
}

export const TEMPLATE_HEADERS = [
  "invoice_number", "invoice_date", "due_date", "customer", "customer_gstin", "billing_period_start",
  "billing_period_end", "subtotal", "tax", "total", "status", "paid", "pdf_url", "swipe_id",
];
