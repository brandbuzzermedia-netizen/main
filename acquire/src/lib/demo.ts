import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Development-only demo data: made-up people with reserved fictional numbers (555-01xx,
 * 07700 900xxx) and example.com addresses. Never called in production builds.
 */
export async function seedDemoWorkspace(supabase: Supabase, orgId: string): Promise<{ error?: string }> {
  const { data: src } = await supabase.from("lead_sources").select("id, name").eq("organization_id", orgId);
  const csv = src?.find((s) => s.name === "CSV import")?.id ?? null;
  const rows = [
    ["Avery Collins", "avery.collins@example.com", "+13125550101", "US", "America/Chicago", "buyer", "Lincoln Park", 45_000_000, 60_000_000, "within_3_months", ["first-time-buyer"]],
    ["Jordan Patel", "jordan.patel@example.com", "+13125550102", "US", "America/Chicago", "seller", "Wicker Park", null, 85_000_000, "within_6_months", ["expired-listing"]],
    ["Morgan Reyes", "morgan.reyes@example.com", "+13125550103", "US", "America/Chicago", "investor", "West Loop", 100_000_000, 250_000_000, "immediate", ["luxury", "cash"]],
    ["Sam Whitfield", "sam.whitfield@example.com", "+447700900104", "GB", "Europe/London", "buyer", "Dubai Marina", 150_000_000, 300_000_000, "within_12_months", ["overseas"]],
    ["Riley Chen", "riley.chen@example.com", null, "CA", "America/Toronto", "landlord", "Midtown Toronto", null, null, "unknown", []],
  ] as const;
  const leads = rows.map(([full_name, email, phone_e164, country, timezone, segment, preferred_location, min, max, timeline, tags], i) => ({
    row_number: i + 2, full_name, email, phone_e164, country, timezone, segment, preferred_location,
    budget_min_minor: min, budget_max_minor: max, currency: min || max ? (country === "GB" ? "GBP" : "USD") : null,
    timeline, tags, consent: i === 0 ? [{ channel: "email", basis: "express", source: "[DEMO] Website enquiry form" }] : [],
  }));
  const { error } = await supabase.rpc("import_leads", { p_org: orgId, p_rows: leads, p_source: csv, p_file_name: "demo-seed" });
  return error ? { error: error.message } : {};
}
