import { describe, expect, it } from "vitest";
import { clientSchema, contactSchema, manualInvoiceSchema, toE164 } from "@/domain/schemas";

const fd = (o: Record<string, string>) => o;

describe("toE164", () => {
  it.each([
    ["98450 12345", "+919845012345"],
    ["098450-12345", "+919845012345"],
    ["+91 98450 12345", "+919845012345"],
    ["919845012345", "+919845012345"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("normalizes %s", (i, o) => expect(toE164(i)).toBe(o));
  it.each(["12345", "abc", "+0123"])("rejects %s", (i) => expect(toE164(i)).toBeNull());
});

describe("clientSchema", () => {
  const base = {
    client_code: "shobha", legal_name: " Shobha Decor ", monthly_retainer_minor: "45,000", billing_frequency: "monthly",
    invoice_day: "1", payment_terms_days: "7", service_status: "active", source_aliases: "SHOBHA DECOR, Shobha D\nShobha",
  };
  it("parses and normalizes", () => {
    const r = clientSchema.parse(fd(base));
    expect(r).toMatchObject({ client_code: "SHOBHA", legal_name: "Shobha Decor", monthly_retainer_minor: 4500000,
      invoice_day: 1, payment_terms_days: 7, communication_paused: false, source_aliases: ["SHOBHA DECOR", "Shobha D", "Shobha"] });
    expect(r.trading_name).toBeUndefined();
  });
  it("rejects a bad GSTIN and terms", () => {
    const r = clientSchema.safeParse(fd({ ...base, gstin: "123", payment_terms_days: "500" }));
    expect(r.success).toBe(false);
  });
});

describe("contactSchema", () => {
  it("requires an email or WhatsApp", () => {
    expect(contactSchema.safeParse({ name: "A" }).success).toBe(false);
    expect(contactSchema.safeParse({ name: "A", whatsapp: "9845012345" }).success).toBe(true);
  });
  it("requires consent evidence when consent is ticked", () => {
    expect(contactSchema.safeParse({ name: "A", whatsapp: "9845012345", whatsapp_consent: "on" }).success).toBe(false);
  });
});

describe("manualInvoiceSchema", () => {
  const base = { client_id: "6f1c1f5e-3a77-4b8e-9b8e-1f2a3b4c5d6e", invoice_number: "GBS/26-27/050", invoice_date: "01-10-2026", total_minor: "59,000" };
  it("accepts minimal input", () => {
    expect(manualInvoiceSchema.parse(base)).toMatchObject({ invoice_date: "2026-10-01", total_minor: 5900000, due_date: null, subtotal_minor: null });
  });
  it("checks totals and dates", () => {
    expect(manualInvoiceSchema.safeParse({ ...base, subtotal_minor: "50000", tax_minor: "8000" }).success).toBe(false);
    expect(manualInvoiceSchema.safeParse({ ...base, due_date: "2026-09-30" }).success).toBe(false);
    expect(manualInvoiceSchema.safeParse({ ...base, pdf_url: "http://insecure.example" }).success).toBe(false);
  });
});
