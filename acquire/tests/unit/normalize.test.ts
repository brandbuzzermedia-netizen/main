import { describe, expect, it } from "vitest";
import { normalizeCountry, normalizeEmail, normalizePhone, normalizeTags, phoneCountry, defaultTimezone } from "@/domain/normalize";
import { formatBudget, parseAmount } from "@/domain/money";
import { parseSegment, parseTimeline } from "@/domain/labels";

describe("normalize", () => {
  it("emails", () => {
    expect(normalizeEmail("  Jane.Doe@Example.COM ")).toBe("jane.doe@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });
  it("phones per market", () => {
    expect(normalizePhone("(212) 736-5000", "US")).toBe("+12127365000");
    expect(normalizePhone("020 7946 0958", "GB")).toBe("+442079460958");
    expect(normalizePhone("050 123 4567", "AE")).toBe("+971501234567");
    expect(normalizePhone("0412 345 678", "AU")).toBe("+61412345678");
    expect(normalizePhone("+44 7911 123456", "US")).toBe("+447911123456");
    expect(normalizePhone("12345", "US")).toBeNull();
  });
  it("phone country and time zones", () => {
    expect(phoneCountry("+971501234567")).toBe("AE");
    expect(defaultTimezone("GB")).toBe("Europe/London");
    expect(defaultTimezone("US")).toBeNull();
  });
  it("countries", () => {
    expect(normalizeCountry("uk")).toBe("GB");
    expect(normalizeCountry("United Arab Emirates")).toBe("AE");
    expect(normalizeCountry("us")).toBe("US");
    expect(normalizeCountry("Narnia")).toBeNull();
  });
  it("tags", () => {
    expect(normalizeTags("Luxury, first time buyer; luxury")).toEqual(["luxury", "first-time-buyer"]);
  });
});

describe("money", () => {
  it("parses amounts with suffixes and symbols", () => {
    expect(parseAmount("450000", "USD")).toBe(45_000_000);
    expect(parseAmount("$450,000", "USD")).toBe(45_000_000);
    expect(parseAmount("450k", "USD")).toBe(45_000_000);
    expect(parseAmount("1.2m", "AED")).toBe(120_000_000);
    expect(parseAmount("AED 2,500,000", "AED")).toBe(250_000_000);
    expect(parseAmount("", "USD")).toBeNull();
    expect(parseAmount("lots", "USD")).toBeNaN();
  });
  it("formats budgets", () => {
    expect(formatBudget(45_000_000, 60_000_000, "USD")).toBe("$450K–$600K");
    expect(formatBudget(null, null, "USD")).toBe("—");
  });
});

describe("labels", () => {
  it("segments", () => {
    expect(parseSegment("Vendor")).toBe("seller");
    expect(parseSegment("renter")).toBe("tenant");
    expect(parseSegment("alien")).toBeNull();
  });
  it("timelines", () => {
    expect(parseTimeline("ASAP")).toBe("immediate");
    expect(parseTimeline("0-3 months")).toBe("within_3_months");
    expect(parseTimeline("6 months")).toBe("within_6_months");
    expect(parseTimeline("within_12_months")).toBe("within_12_months");
    expect(parseTimeline("2+ years")).toBe("over_12_months");
    expect(parseTimeline("whenever")).toBeNull();
  });
});
