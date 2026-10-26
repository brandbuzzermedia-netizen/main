import "server-only";
import type { AppContext } from "@/lib/auth";
import type { Lead, Stage, Source, Member } from "@/lib/db-types";
import { SEGMENTS, type Segment } from "@/domain/labels";

export const PAGE_SIZE = 50;

export const SORTS = {
  newest: { column: "created_at", ascending: false, label: "Newest first" },
  oldest: { column: "created_at", ascending: true, label: "Oldest first" },
  name: { column: "full_name", ascending: true, label: "Name A–Z" },
  follow_up: { column: "next_follow_up_at", ascending: true, label: "Next follow-up" },
  updated: { column: "updated_at", ascending: false, label: "Recently updated" },
} as const;

export type LeadFilters = {
  q: string;
  stage: string;
  source: string;
  owner: string; // user id, "me", "none" or ""
  segment: Segment | "";
  country: string;
  tag: string;
  sort: keyof typeof SORTS;
  page: number;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Parses and sanitizes list filters from the URL. Unknown values are dropped, not trusted. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): LeadFilters {
  const sort = one(sp.sort);
  const owner = one(sp.owner);
  const segment = one(sp.segment);
  const page = Number.parseInt(one(sp.page), 10);
  return {
    q: one(sp.q).trim().slice(0, 100),
    stage: isUuid(one(sp.stage)) ? one(sp.stage) : "",
    source: isUuid(one(sp.source)) ? one(sp.source) : "",
    owner: owner === "me" || owner === "none" || isUuid(owner) ? owner : "",
    segment: (SEGMENTS as readonly string[]).includes(segment) ? (segment as Segment) : "",
    country: /^[A-Z]{2}$/.test(one(sp.country)) ? one(sp.country) : "",
    tag: one(sp.tag).trim().toLowerCase().slice(0, 40),
    sort: sort in SORTS ? (sort as keyof typeof SORTS) : "newest",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function filtersToQuery(f: Partial<LeadFilters>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === "" || v === undefined || (k === "sort" && v === "newest") || (k === "page" && v === 1)) continue;
    p.set(k, String(v));
  }
  return p.toString();
}

/** PostgREST `or` filter values need commas, parentheses and quotes escaped. */
function orSafe(s: string): string {
  return s.replace(/[%,()"\\]/g, " ").trim();
}

/** Builds the filtered lead query. RLS still limits rows to what the caller may see. */
export function leadQuery(ctx: AppContext, f: LeadFilters, columns = "*", opts: { count?: boolean } = {}) {
  let q = ctx.supabase
    .from("leads")
    .select(columns, opts.count ? { count: "exact" } : undefined)
    .eq("organization_id", ctx.org.id);
  if (f.q) {
    const term = orSafe(f.q);
    const digits = f.q.replace(/[^\d+]/g, "");
    const parts = [`full_name.ilike.%${term}%`, `email_normalized.ilike.%${term.toLowerCase()}%`, `preferred_location.ilike.%${term}%`];
    if (digits.length >= 4) parts.push(`phone_e164.ilike.%${digits.replace(/^\+/, "")}%`);
    q = q.or(parts.join(","));
  }
  if (f.stage) q = q.eq("stage_id", f.stage);
  if (f.source) q = q.eq("source_id", f.source);
  if (f.owner === "me") q = q.eq("owner_id", ctx.userId);
  else if (f.owner === "none") q = q.is("owner_id", null);
  else if (f.owner) q = q.eq("owner_id", f.owner);
  if (f.segment) q = q.eq("segment", f.segment);
  if (f.country) q = q.eq("country", f.country);
  if (f.tag) q = q.contains("tags", [f.tag]);
  const s = SORTS[f.sort];
  return q.order(s.column, { ascending: s.ascending, nullsFirst: false }).order("id");
}

/** Reference data most lead pages need. */
export async function loadLeadContext(ctx: AppContext) {
  const [stages, sources, members] = await Promise.all([
    ctx.supabase.from("pipeline_stages").select("id, key, name, category, position, is_system").eq("organization_id", ctx.org.id).order("position"),
    ctx.supabase.from("lead_sources").select("id, name, kind, provenance_note, is_active").eq("organization_id", ctx.org.id).order("name"),
    ctx.supabase.from("memberships").select("user_id, role, user:users(id, email, full_name)").eq("organization_id", ctx.org.id),
  ]);
  for (const r of [stages, sources, members]) if (r.error) throw new Error(r.error.message);
  return {
    stages: (stages.data ?? []) as Stage[],
    sources: (sources.data ?? []) as Source[],
    members: (members.data ?? []) as unknown as Member[],
  };
}

export function memberName(m: Member | undefined): string {
  return m?.user?.full_name || m?.user?.email || "Unknown user";
}

export type LeadRow = Pick<Lead, "id" | "full_name" | "email" | "phone_e164" | "country" | "segment" | "stage_id" | "owner_id" | "source_id" | "tags" | "budget_min_minor" | "budget_max_minor" | "currency" | "next_follow_up_at" | "created_at" | "preferred_location">;
export const LEAD_ROW_COLUMNS = "id, full_name, email, phone_e164, country, segment, stage_id, owner_id, source_id, tags, budget_min_minor, budget_max_minor, currency, next_follow_up_at, created_at, preferred_location";
