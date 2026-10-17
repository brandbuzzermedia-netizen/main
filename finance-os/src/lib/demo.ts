import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayInBusinessTz } from "@/domain/dates";

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
  ]);
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
