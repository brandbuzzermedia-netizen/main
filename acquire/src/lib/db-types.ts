/**
 * Row types for the tables this app reads. Hand-maintained to match supabase/migrations.
 * Once a Supabase project exists, `npm run db:types` can generate a full Database type.
 */
import type { Basis, Channel } from "@/domain/eligibility";
import type { AppointmentKind, AppointmentStatus, DealCategory, DealType, Role, Segment, SourceKind, StageCategory, TaskPriority, TaskStatus, Timeline } from "@/domain/labels";

export type Organization = {
  id: string;
  name: string;
  primary_market: string;
  timezone: string;
  default_currency: string;
  status: "active" | "suspended";
  is_demo: boolean;
};

export type OrgSettings = {
  organization_id: string;
  contact_window_start: string;
  contact_window_end: string;
  require_review_when_unsure: boolean;
  implied_inquiry_days: number;
  email_from_name: string | null;
  email_from_address: string | null;
  postal_address: string | null;
  sms_from_number: string | null;
};

export type Stage = { id: string; key: string; name: string; category: StageCategory; position: number; is_system: boolean };
export type Source = { id: string; name: string; kind: SourceKind; provenance_note: string | null; is_active: boolean };
export type Member = { user_id: string; role: Role; user: { id: string; email: string | null; full_name: string | null } | null };

export type Lead = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string | null;
  phone_e164: string | null;
  country: string | null;
  timezone: string | null;
  segment: Segment;
  property_interest: string | null;
  property_type: string | null;
  preferred_location: string | null;
  budget_min_minor: number | null;
  budget_max_minor: number | null;
  currency: string | null;
  timeline: Timeline;
  stage_id: string;
  owner_id: string | null;
  source_id: string | null;
  tags: string[];
  custom_fields: Record<string, string>;
  score: number | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Activity = {
  id: string;
  kind: string;
  summary: string;
  data: Record<string, unknown>;
  actor_id: string | null;
  occurred_at: string;
};

export type ConsentRecord = {
  id: string;
  channel: Channel;
  status: "granted" | "withdrawn";
  basis: Basis | "none_recorded";
  source: string;
  evidence_url: string | null;
  captured_at: string;
  expires_at: string | null;
  recorded_by: string | null;
};

export type Suppression = {
  id: string;
  value_type: "email" | "phone";
  value: string;
  channel: Channel | null;
  reason: string;
  source: string | null;
  created_at: string;
};


export type DealStage = { id: string; name: string; category: DealCategory; probability: number; position: number };

export type Deal = {
  id: string;
  organization_id: string;
  lead_id: string;
  title: string;
  deal_type: DealType;
  value_minor: number | null;
  commission_minor: number | null;
  currency: string;
  stage_id: string;
  owner_id: string | null;
  expected_close_date: string | null;
  closed_at: string | null;
  lost_reason: string | null;
  property_ref: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  lead_id: string | null;
  deal_id: string | null;
  title: string;
  notes: string | null;
  due_at: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  assignee_id: string | null;
  completed_at: string | null;
  created_at: string;
};

export type Appointment = {
  id: string;
  lead_id: string;
  deal_id: string | null;
  kind: AppointmentKind;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  status: AppointmentStatus;
  assigned_to: string | null;
  source: "manual" | "calendar";
  notes: string | null;
};
