/**
 * The normalized shape every invoice source produces, whether it is the Swipe API,
 * a Swipe CSV/Excel export, or manual entry. The database import RPC
 * (public.import_invoices) accepts exactly this, so switching sources needs no schema change.
 */
export type InvoiceRecord = {
  rowNumber: number;
  invoiceNumber: string;
  externalId: string | null;
  customerName: string | null;
  customerGstin: string | null;
  invoiceDate: string; // ISO date
  dueDate: string | null; // ISO date; null = derive from client payment terms
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  currency: string;
  subtotalMinor: number | null;
  taxMinor: number;
  totalMinor: number;
  pdfUrl: string | null;
  sourceStatus: "issued" | "cancelled";
  sourceReportedStatus: string | null;
  sourceReportedPaidMinor: number | null;
};

export type RowIssue = { rowNumber: number; field?: string; message: string };

export type InvoiceSourceKind = "api" | "csv" | "manual";

/** Common interface for invoice sources. Implementations must not invent data. */
export interface InvoiceSource {
  readonly kind: InvoiceSourceKind;
  /** True only when the source is configured and its last connection test passed. */
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
}
