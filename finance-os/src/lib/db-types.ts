/**
 * Row types for the tables and views this app reads. Hand-maintained to match
 * supabase/migrations. Once a Supabase project exists, `npm run db:types` can generate
 * a full Database type to replace these.
 */
export type Role = "owner" | "finance" | "account_manager" | "viewer";
export type BillingFrequency = "monthly" | "quarterly" | "half_yearly" | "yearly" | "one_time";
export type ServiceStatus = "onboarding" | "active" | "paused" | "suspended" | "offboarded";
export type InvoiceStatus = "issued" | "cancelled" | "disputed";
export type SourceChannel = "api" | "csv" | "manual";
export type SyncStatus = "current" | "stale" | "error" | "manual";
export type AgeingBucket =
  | "cancelled" | "settled" | "disputed" | "not_due" | "due_today"
  | "overdue_1_15" | "overdue_16_45" | "overdue_45_plus";
export type PaymentState = "paid" | "partially_paid" | "unpaid";

export type Organization = { id: string; name: string; is_demo: boolean; timezone: string; base_currency: string };

export type Client = {
  id: string;
  organization_id: string;
  client_code: string;
  legal_name: string;
  trading_name: string | null;
  gstin: string | null;
  source_aliases: string[];
  monthly_retainer_minor: number;
  currency: string;
  billing_frequency: BillingFrequency;
  invoice_day: number | null;
  payment_terms_days: number;
  account_owner_id: string | null;
  service_status: ServiceStatus;
  communication_paused: boolean;
  missed_commitments_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingContact = {
  id: string;
  client_id: string;
  name: string;
  email: string | null;
  whatsapp_e164: string | null;
  is_primary: boolean;
  receives_reminders: boolean;
  whatsapp_consent_at: string | null;
  whatsapp_consent_note: string | null;
  email_opt_out: boolean;
};

export type Contract = {
  id: string;
  client_id: string;
  start_date: string;
  end_date: string | null;
  monthly_retainer_minor: number;
  currency: string;
  billing_frequency: BillingFrequency;
  payment_terms_days: number;
  final_deadline_days: number;
  status: "draft" | "active" | "expired" | "terminated";
  document_url: string | null;
  notes: string | null;
};

export type InvoiceBalance = {
  id: string;
  organization_id: string;
  client_id: string;
  client_code: string;
  client_legal_name: string;
  client_trading_name: string | null;
  source_system: string;
  source_channel: SourceChannel;
  external_id: string | null;
  invoice_number: string;
  invoice_date: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  due_date: string;
  due_date_derived: boolean;
  extended_due_date: string | null;
  effective_due_date: string;
  currency: string;
  subtotal_minor: number | null;
  tax_minor: number;
  total_minor: number;
  amount_received_minor: number;
  credited_minor: number;
  outstanding_minor: number;
  status: InvoiceStatus;
  status_reason: string | null;
  pdf_url: string | null;
  source_reported_status: string | null;
  source_reported_paid_minor: number | null;
  last_synced_at: string | null;
  sync_status: SyncStatus;
  last_reminder_stage: string | null;
  next_reminder_date: string | null;
  has_pending_payment: boolean;
  open_commitment_date: string | null;
  payment_state: PaymentState;
  days_overdue: number;
  ageing_bucket: AgeingBucket;
  notes: string | null;
  created_at: string;
};

export type ClientBalance = {
  client_id: string;
  client_code: string;
  legal_name: string;
  trading_name: string | null;
  service_status: ServiceStatus;
  missed_commitments_count: number;
  open_invoice_count: number;
  outstanding_minor: number;
  overdue_minor: number;
  oldest_days_overdue: number;
};

export type SyncRun = {
  id: string;
  integration: string;
  job: string;
  channel: SourceChannel | null;
  trigger: string;
  status: "running" | "succeeded" | "partial" | "failed";
  file_name: string | null;
  stats: Record<string, unknown>;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export type EscalationTask = {
  id: string;
  kind: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved" | "dismissed";
  title: string;
  details: string | null;
  client_id: string | null;
  invoice_id: string | null;
  created_at: string;
};

/** Postgres bigint arrives from PostgREST as a JSON number; values stay below 2^53 paise. */
export function asMinor(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (!Number.isSafeInteger(n)) throw new Error(`Unsafe money value from database: ${String(v)}`);
  return n;
}

export type VerificationStatus = "pending_verification" | "verified" | "rejected";
export type PaymentMethod = "upi" | "neft" | "rtgs" | "imps" | "cheque" | "card" | "cash" | "gateway" | "other";

export type PaymentRow = {
  id: string;
  organization_id: string;
  client_id: string | null;
  client_code: string | null;
  client_legal_name: string | null;
  client_trading_name: string | null;
  source: "gateway" | "bank_import" | "swipe" | "manual";
  transaction_reference: string;
  payment_date: string;
  amount_minor: number;
  currency: string;
  method: PaymentMethod;
  kind: "receipt" | "refund";
  payer_name: string | null;
  verification_status: VerificationStatus;
  verified_by: string | null;
  verified_at: string | null;
  verification_note: string | null;
  bank_narration: string | null;
  allocated_minor: number;
  unallocated_minor: number;
  reconciliation_notes: string | null;
  allocation_count: number;
  created_at: string;
};

export type Commitment = {
  id: string;
  client_id: string;
  invoice_id: string | null;
  promised_amount_minor: number;
  commitment_date: string;
  promised_on: string;
  promised_by: string;
  notes: string | null;
  status: "open" | "fulfilled" | "missed" | "cancelled";
  missed_at: string | null;
  resolved_at: string | null;
  created_at: string;
};
