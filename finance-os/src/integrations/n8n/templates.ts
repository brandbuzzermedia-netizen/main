/**
 * The 15 starter workflows from the brief. Each ships disabled: credentials, mappings and owner
 * approval come first. Financial or outbound ones always require approval; restaurant and
 * e-commerce sync only appear once a supported integration is confirmed.
 */
export type AutomationTemplate = {
  key: string; name: string; trigger: "schedule" | "record_change" | "manual" | "webhook"; detail: string;
  requiresApproval: boolean; isFinancial: boolean; idempotent: boolean; needs?: string;
};

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  { key: "lead_enrich_qualify", name: "New lead → enrich → qualify → follow-up task", trigger: "record_change", detail: "Contact created", requiresApproval: false, isFinancial: false, idempotent: true, needs: "Approved enrichment provider" },
  { key: "qualified_meeting_slots", name: "Qualified lead → propose slots → approval → invite", trigger: "record_change", detail: "Lead status = qualified", requiresApproval: true, isFinancial: false, idempotent: true, needs: "Calendar connection" },
  { key: "no_response_follow_up", name: "Missed call / no response → compliant follow-up", trigger: "schedule", detail: "Daily", requiresApproval: true, isFinancial: false, idempotent: true, needs: "Email or WhatsApp provider" },
  { key: "meeting_completed_next_step", name: "Meeting completed → notes, task and next step", trigger: "record_change", detail: "Meeting status = completed", requiresApproval: false, isFinancial: false, idempotent: true },
  { key: "proposal_reminders", name: "Proposal sent → schedule reminders", trigger: "record_change", detail: "Stage kind = proposal", requiresApproval: true, isFinancial: false, idempotent: true },
  { key: "invoice_overdue_reminder", name: "Invoice overdue → reminder draft → approval → send", trigger: "schedule", detail: "Daily 9:30 IST", requiresApproval: true, isFinancial: false, idempotent: true, needs: "Email provider" },
  { key: "bill_ocr_review", name: "New bill uploaded → OCR → review queue", trigger: "record_change", detail: "Document uploaded", requiresApproval: false, isFinancial: false, idempotent: true },
  { key: "rent_due_reminder", name: "Rent due → reminder draft → approval/send", trigger: "schedule", detail: "3 days before due", requiresApproval: true, isFinancial: false, idempotent: true },
  { key: "rent_overdue_escalation", name: "Rent overdue → escalation task", trigger: "schedule", detail: "Daily", requiresApproval: false, isFinancial: false, idempotent: true },
  { key: "daily_summary", name: "Daily business summary → owner notification", trigger: "schedule", detail: "Daily 8:00 IST", requiresApproval: false, isFinancial: false, idempotent: true },
  { key: "failed_workflow_alert", name: "Failed workflow → alert the assigned admin", trigger: "webhook", detail: "Run failed", requiresApproval: false, isFinancial: false, idempotent: true },
  { key: "month_end_close", name: "Month-end finance close checklist", trigger: "schedule", detail: "Last working day", requiresApproval: false, isFinancial: false, idempotent: true },
  { key: "tax_document_missing", name: "Tax document missing → accountant task", trigger: "schedule", detail: "Weekly", requiresApproval: false, isFinancial: false, idempotent: true },
  { key: "restaurant_order_sync", name: "Restaurant order status sync", trigger: "webhook", detail: "POS event", requiresApproval: false, isFinancial: false, idempotent: true, needs: "Confirmed Petpooja (or other POS) API access" },
  { key: "ecommerce_order_sync", name: "E-commerce order sync", trigger: "webhook", detail: "Shopify order", requiresApproval: false, isFinancial: false, idempotent: true, needs: "Shopify app credentials" },
];

/** Templates the OS queues on a schedule (see enqueue_scheduled_runs) with workflow files in n8n/workflows. */
export const SCHEDULED_TEMPLATES = AUTOMATION_TEMPLATES.filter((t) => ["daily_summary", "bill_ocr_review", "rent_overdue_escalation"].includes(t.key));
