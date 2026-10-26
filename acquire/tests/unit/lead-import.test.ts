import { describe, expect, it } from "vitest";
import { planImport, TEMPLATE_HEADERS } from "@/domain/lead-import";
import { toCsv } from "@/domain/csv";

const opts = { defaultCountry: "US", defaultCurrency: "USD", now: new Date("2026-10-26T12:00:00Z") };

describe("planImport", () => {
  it("maps common header variants and custom columns", () => {
    const csv = toCsv([
      ["First Name", "Surname", "E-mail", "Mobile", "Lead Type", "Area", "Budget", "Timeframe", "MLS #"],
      ["Jane", "Doe", "Jane@Example.com", "(212) 736-5000", "Vendor", "Austin", "$650k", "3 months", "A123"],
    ]);
    const plan = planImport(csv, opts);
    expect(plan.missingColumns).toEqual([]);
    expect(plan.customColumns).toEqual(["MLS #"]);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({
      full_name: "Jane Doe", email: "jane@example.com", phone_e164: "+12127365000", country: "US", segment: "seller",
      preferred_location: "Austin", budget_max_minor: 65_000_000, currency: "USD", timeline: "within_3_months",
      custom_fields: { mls: "A123" },
    });
  });

  it("reports missing required columns", () => {
    expect(planImport("Company,City\nAcme,Austin", opts).missingColumns).toEqual(["Name (or First name)", "Email or Phone"]);
  });

  it("skips invalid rows and in-file duplicates with row numbers", () => {
    const csv = toCsv([
      ["Name", "Email", "Phone"],
      ["A", "a@example.com", ""],
      ["B", "not-an-email", ""],
      ["C", "", ""],
      ["D", "A@example.com", ""],
      ["E", "", "12345"],
    ]);
    const plan = planImport(csv, opts);
    expect(plan.rows.map((r) => r.full_name)).toEqual(["A"]);
    const errors = plan.issues.filter((i) => i.severity === "error").map((i) => `${i.rowNumber}: ${i.message}`);
    expect(errors).toEqual([
      "3: Email “not-an-email” is not valid",
      "4: Needs an email or a phone number",
      "5: Same email as row 2",
      "6: Phone “12345” is not a valid number for US",
    ]);
  });

  it("records consent only when a source is given", () => {
    const csv = toCsv([
      ["Name", "Email", "Email consent", "SMS consent", "Consent source", "Consent basis", "Consent date"],
      ["With source", "w@example.com", "yes", "no", "Open house sign-in sheet 2026-10-12", "express written", "2026-10-12"],
      ["No source", "n@example.com", "yes", "", "", "", ""],
    ]);
    const plan = planImport(csv, opts);
    expect(plan.rows[0].consent).toEqual([
      { channel: "email", basis: "express_written", source: "Open house sign-in sheet 2026-10-12", captured_at: "2026-10-12T00:00:00.000Z" },
    ]);
    expect(plan.rows[1].consent).toEqual([]);
    expect(plan.issues.some((i) => i.rowNumber === 3 && i.severity === "warning" && /consent not recorded/.test(i.message))).toBe(true);
  });

  it("derives country and time zone from the phone number when possible", () => {
    const plan = planImport(toCsv([["Name", "Phone"], ["Dubai lead", "+971 50 123 4567"]]), opts);
    expect(plan.rows[0]).toMatchObject({ country: "AE", timezone: "Asia/Dubai" });
  });

  it("warns, rather than fails, on unrecognised optional values", () => {
    const plan = planImport(toCsv([["Name", "Email", "Segment", "Timeline", "Country"], ["X", "x@example.com", "alien", "someday", "Narnia"]]), opts);
    expect(plan.rows[0]).toMatchObject({ segment: "other", timeline: "unknown", country: null });
    expect(plan.issues.filter((i) => i.severity === "warning")).toHaveLength(3);
  });

  it("accepts its own template", () => {
    expect(planImport(toCsv([TEMPLATE_HEADERS]), opts).missingColumns).toEqual([]);
  });

  it("rejects empty files", () => {
    expect(() => planImport("", opts)).toThrow(/empty/);
  });
});
