import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayInBusinessTz } from "@/domain/dates";
import { COMPANY_TEMPLATES, type CompanyTemplate } from "@/domain/registry";

/**
 * Development-only demo data. Every name is prefixed "[DEMO]" and the organization is
 * flagged is_demo, so the UI shows a banner on every page. Inserted through the normal
 * RLS-guarded paths (including the import RPC), so it exercises real code.
 */
export async function seedDemoWorkspace(supabase: SupabaseClient, orgId: string) {
  const today = todayInBusinessTz();
  const clients = [
    { client_code: "DEMO-HONEY", legal_name: "[DEMO] Honeycomb Interiors Pvt Ltd", trading_name: "Honeycomb", monthly_retainer_minor: 4500000, payment_terms_days: 7 },
    { client_code: "DEMO-PETAL", legal_name: "[DEMO] Petal & Pine Florists LLP", trading_name: "Petal & Pine", monthly_retainer_minor: 2500000, payment_terms_days: 15 },
    { client_code: "DEMO-ORBIT", legal_name: "[DEMO] Orbit Dental Clinics", trading_name: null, monthly_retainer_minor: 6000000, payment_terms_days: 7 },
  ];
  const { data: inserted, error } = await supabase
    .from("clients")
    .insert(clients.map((c) => ({ ...c, organization_id: orgId, billing_frequency: "monthly", invoice_day: 1 })))
    .select("id, client_code");
  if (error) throw new Error(`Demo seed failed: ${error.message}`);
  const id = (code: string) => inserted!.find((c) => c.client_code === code)!.id;

  await supabase.from("billing_contacts").insert([
    { organization_id: orgId, client_id: id("DEMO-HONEY"), name: "Demo Accounts Team", email: "accounts@honeycomb.example", is_primary: true },
    { organization_id: orgId, client_id: id("DEMO-PETAL"), name: "Demo Owner", email: "owner@petalpine.example", whatsapp_e164: "+919800000001", is_primary: true },
    { organization_id: orgId, client_id: id("DEMO-ORBIT"), name: "Demo Practice Manager", email: "billing@orbit.example", is_primary: true },
  ], { defaultToNull: false });
  await supabase.from("contracts").insert(
    clients.map((c) => ({
      organization_id: orgId,
      client_id: id(c.client_code),
      start_date: addDays(today, -200),
      monthly_retainer_minor: c.monthly_retainer_minor,
      payment_terms_days: c.payment_terms_days,
    })),
  );

  const inv = (n: string, code: string, issuedDaysAgo: number, terms: number, base: number) => ({
    row_number: 0,
    invoice_number: `DEMO/26-27/${n}`,
    external_id: null,
    client_id: id(code),
    invoice_date: addDays(today, -issuedDaysAgo),
    due_date: addDays(today, -issuedDaysAgo + terms),
    due_date_derived: false,
    billing_period_start: null,
    billing_period_end: null,
    currency: "INR",
    subtotal_minor: base,
    tax_minor: Math.round(base * 0.18),
    total_minor: base + Math.round(base * 0.18),
    pdf_url: null,
    source_status: "issued",
    source_reported_status: null,
    source_reported_paid_minor: null,
  });
  const { error: importError } = await supabase.rpc("import_invoices", {
    p_org: orgId,
    p_channel: "manual",
    p_rows: [
      inv("001", "DEMO-HONEY", 40, 7, 4500000),
      inv("002", "DEMO-HONEY", 10, 7, 4500000),
      inv("003", "DEMO-PETAL", 20, 15, 2500000),
      inv("004", "DEMO-ORBIT", 2, 7, 6000000),
    ],
  });
  if (importError) throw new Error(`Demo invoices failed: ${importError.message}`);
}

/**
 * Development-only demo group. Companies come from the registry templates, renamed
 * "[DEMO] …" with "demo-" slugs, inside a group flagged is_demo (every page shows a banner).
 * Deals, meetings and tasks are inserted through the normal RLS-guarded paths.
 * Returns the demo GBS workspace id.
 */
export async function seedDemoGroup(
  supabase: SupabaseClient,
  groupId: string,
  payloadFor: (t: CompanyTemplate) => Record<string, unknown>,
): Promise<string | null> {
  const ids: Record<string, string> = {};
  for (const t of COMPANY_TEMPLATES) {
    const { data, error } = await supabase.rpc("create_company", { p_group: groupId, p_company: payloadFor(t) });
    if (error) throw new Error(`Demo company ${t.name} failed: ${error.message}`);
    ids[t.slug] = data as string;
  }
  const today = todayInBusinessTz();
  const now = Date.now();
  const iso = (days: number, hour = 11) => new Date(Date.parse(`${addDays(today, days)}T${String(hour).padStart(2, "0")}:00:00+05:30`)).toISOString();

  async function deals(slug: string, rows: { title: string; stage: string; value: number; hot?: boolean; next?: [string, number]; idleDays?: number }[]) {
    const org = ids[slug];
    const { data: stages, error } = await supabase.from("pipeline_stages").select("id, name").eq("organization_id", org);
    if (error) throw new Error(error.message);
    const stageId = (n: string) => stages!.find((s) => s.name === n)!.id;
    const { data, error: insError } = await supabase.from("deals").insert(rows.map((r) => ({
      organization_id: org, title: `[DEMO] ${r.title}`, account_name: "[DEMO] Example account", stage_id: stageId(r.stage),
      value_minor: r.value, is_hot: Boolean(r.hot), next_action: r.next?.[0] ?? null, next_action_on: r.next ? addDays(today, r.next[1]) : null,
      last_activity_at: new Date(now - (r.idleDays ?? 1) * 86_400_000).toISOString(), source: "Demo",
    }))).select("id, title");
    if (insError) throw new Error(`Demo deals failed: ${insError.message}`);
    return data!;
  }

  const gbs = await deals("gbs", [
    { title: "Website + Meta ads retainer", stage: "Proposal", value: 1_20_000_00, hot: true, next: ["Call on revised scope", 1] },
    { title: "Clinic lead-gen campaign", stage: "Meeting", value: 75_000_00, next: ["Send case studies", -2] },
    { title: "Furniture brand refresh", stage: "Qualified", value: 60_000_00, idleDays: 12 },
    { title: "48-hour landing page", stage: "Lead", value: 25_000_00 },
    { title: "SEO retainer", stage: "Negotiation", value: 50_000_00, hot: true },
  ]);
  await deals("tan-o-fun", [
    { title: "Corporate gifting order (200 kits)", stage: "Quote sent", value: 3_40_000_00, hot: true },
    { title: "Dealer onboarding · Mysuru", stage: "Enquiry", value: 80_000_00 },
  ]);
  await deals("ashwin-bhai", [{ title: "Office space referral (partner gross value)", stage: "Site visit", value: 2_50_00_000_00 }]);

  const m = await supabase.from("meetings").insert([
    { organization_id: ids.gbs, title: "[DEMO] Proposal review", starts_at: iso(0, 16), deal_id: gbs[0].id },
    { organization_id: ids.gbs, title: "[DEMO] Discovery call", starts_at: iso(2, 11), deal_id: gbs[1].id },
  ]);
  if (m.error) throw new Error(`Demo meetings failed: ${m.error.message}`);
  const tk = await supabase.from("tasks").insert([
    { organization_id: ids.gbs, title: "[DEMO] Collect client ad account access", due_on: addDays(today, -1), priority: "high" },
    { organization_id: ids.gbs, title: "[DEMO] Draft monthly report", due_on: addDays(today, 3) },
  ], { defaultToNull: false });
  if (tk.error) throw new Error(`Demo tasks failed: ${tk.error.message}`);
  const { data: ent } = await supabase.from("legal_entities").select("id").eq("organization_id", ids.gbs).eq("is_default", true).single();
  const le = await supabase.from("ledger_entries").insert([
    { organization_id: ids.gbs, legal_entity_id: ent!.id, entry_type: "expense", category: "Software", description: "[DEMO] Design tool subscription", txn_date: today, amount_minor: 1_180_00, status: "pending_approval" },
    { organization_id: ids.gbs, legal_entity_id: ent!.id, entry_type: "pass_through_in", category: "Client ad budget", description: "[DEMO] Client Meta ad funds (not revenue)", txn_date: today, amount_minor: 50_000_00, status: "draft" },
  ]);
  if (le.error) throw new Error(`Demo ledger failed: ${le.error.message}`);
  await seedDemoWorkspace(supabase, ids.gbs);
  return ids.gbs ?? null;
}
