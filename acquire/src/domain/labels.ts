import type { Basis, Channel } from "./eligibility";

export const SEGMENTS = ["buyer", "seller", "landlord", "tenant", "investor", "other"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const TIMELINES = ["immediate", "within_3_months", "within_6_months", "within_12_months", "over_12_months", "unknown"] as const;
export type Timeline = (typeof TIMELINES)[number];

export const STAGE_CATEGORIES = ["new", "working", "qualified", "won", "lost", "opted_out"] as const;
export type StageCategory = (typeof STAGE_CATEGORIES)[number];

export const SOURCE_KINDS = ["manual", "csv_import", "web_form", "ad_platform", "data_provider", "referral", "crm_sync", "other"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const ROLES = ["agency_admin", "campaign_manager", "sales_rep", "read_only"] as const;
export type Role = (typeof ROLES)[number];

export const SUPPRESSION_REASONS = ["opt_out", "unsubscribe", "do_not_call", "registry_match", "bounce", "complaint", "manual", "erasure"] as const;

export const segmentLabel: Record<Segment, string> = {
  buyer: "Buyer", seller: "Seller", landlord: "Landlord", tenant: "Tenant", investor: "Investor", other: "Other",
};

export const timelineLabel: Record<Timeline, string> = {
  immediate: "Immediately", within_3_months: "Within 3 months", within_6_months: "Within 6 months",
  within_12_months: "Within 12 months", over_12_months: "Over 12 months", unknown: "Unknown",
};

export const channelLabel: Record<Channel, string> = {
  email: "Email", sms: "SMS", phone_call: "Phone call (person)", ai_voice_call: "AI voice call", whatsapp: "WhatsApp",
};

export const basisLabel: Record<Basis, string> = {
  express_written: "Express written consent",
  express: "Express consent",
  implied_existing_relationship: "Implied: existing relationship",
  implied_inquiry: "Implied: recent enquiry",
  legitimate_interest: "Legitimate interest (documented)",
};

export const roleLabel: Record<Role, string> = {
  agency_admin: "Agency admin", campaign_manager: "Campaign manager", sales_rep: "Sales rep", read_only: "Read-only",
};

export const sourceKindLabel: Record<SourceKind, string> = {
  manual: "Manual entry", csv_import: "File import", web_form: "Web form", ad_platform: "Ad platform",
  data_provider: "Licensed data provider", referral: "Referral", crm_sync: "CRM sync", other: "Other",
};

export const suppressionReasonLabel: Record<(typeof SUPPRESSION_REASONS)[number], string> = {
  opt_out: "Opted out", unsubscribe: "Unsubscribed", do_not_call: "Asked not to be called", registry_match: "On a do-not-call registry",
  bounce: "Hard bounce", complaint: "Spam complaint", manual: "Manual", erasure: "Erasure request",
};

export const categoryTone: Record<StageCategory, "neutral" | "info" | "brand" | "ok" | "danger" | "warn"> = {
  new: "neutral", working: "info", qualified: "brand", won: "ok", lost: "warn", opted_out: "danger",
};

const SEGMENT_SYNONYMS: Record<string, Segment> = {
  buyer: "buyer", buy: "buyer", purchaser: "buyer", "home buyer": "buyer",
  seller: "seller", sell: "seller", vendor: "seller", owner: "seller", "home owner": "seller", homeowner: "seller",
  landlord: "landlord", lessor: "landlord",
  tenant: "tenant", renter: "tenant", rent: "tenant", lessee: "tenant",
  investor: "investor", invest: "investor", "property investor": "investor",
  other: "other",
};

export function parseSegment(raw: string | null | undefined): Segment | null {
  const v = (raw ?? "").trim().toLowerCase();
  return v ? (SEGMENT_SYNONYMS[v] ?? null) : null;
}

export function parseTimeline(raw: string | null | undefined): Timeline | null {
  const v = (raw ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!v) return null;
  if ((TIMELINES as readonly string[]).includes(v.replace(/ /g, "_"))) return v.replace(/ /g, "_") as Timeline;
  if (/^(asap|now|immediate(ly)?|urgent|this month)$/.test(v)) return "immediate";
  const months = /(\d+)\s*(?:to\s*)?(\d+)?\s*(m|mo|mos|month|months)\b/.exec(v);
  if (months) {
    const n = Number(months[2] ?? months[1]);
    return n <= 3 ? "within_3_months" : n <= 6 ? "within_6_months" : n <= 12 ? "within_12_months" : "over_12_months";
  }
  if (/(1|one)\s*(y|yr|year)/.test(v)) return "within_12_months";
  if (/(over|more than|\d+\+?)\s*(a\s*)?(y|yr|year)/.test(v)) return "over_12_months";
  if (/^(unknown|not sure|unsure|n\/a)$/.test(v)) return "unknown";
  return null;
}

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export const DEAL_TYPES = ["purchase", "sale", "rental", "lease", "investment", "other"] as const;
export type DealType = (typeof DEAL_TYPES)[number];
export const dealTypeLabel: Record<DealType, string> = {
  purchase: "Purchase", sale: "Sale", rental: "Rental", lease: "Lease", investment: "Investment", other: "Other",
};

export const DEAL_CATEGORIES = ["open", "won", "lost"] as const;
export type DealCategory = (typeof DEAL_CATEGORIES)[number];
export const dealCategoryTone: Record<DealCategory, "info" | "ok" | "warn"> = { open: "info", won: "ok", lost: "warn" };

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const TASK_STATUSES = ["open", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const APPOINTMENT_KINDS = ["viewing", "valuation", "call", "meeting", "other"] as const;
export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number];
export const appointmentKindLabel: Record<AppointmentKind, string> = {
  viewing: "Viewing", valuation: "Valuation", call: "Call", meeting: "Meeting", other: "Other",
};
export const APPOINTMENT_STATUSES = ["scheduled", "completed", "no_show", "cancelled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export const appointmentStatusLabel: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled", completed: "Held", no_show: "No-show", cancelled: "Cancelled",
};
export const appointmentStatusTone: Record<AppointmentStatus, "info" | "ok" | "danger" | "neutral"> = {
  scheduled: "info", completed: "ok", no_show: "danger", cancelled: "neutral",
};

export const INTERACTION_KINDS = ["call", "email", "sms", "whatsapp", "meeting"] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];
export const interactionLabel: Record<InteractionKind, string> = {
  call: "Call", email: "Email", sms: "SMS", whatsapp: "WhatsApp", meeting: "Meeting",
};
/** Suggested outcomes per kind; free text is also accepted. */
export const INTERACTION_OUTCOMES: Record<InteractionKind, string[]> = {
  call: ["connected", "voicemail", "no_answer", "wrong_number", "call_back_requested", "not_interested"],
  email: ["sent", "replied"],
  sms: ["sent", "replied"],
  whatsapp: ["sent", "replied"],
  meeting: ["held", "positive", "needs_follow_up", "not_interested"],
};
