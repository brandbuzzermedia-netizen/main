import { describe, expect, it } from "vitest";
import { formatMoney, minorToInput, parseMoneyToMinor } from "@/domain/money";

describe("parseMoneyToMinor", () => {
  it.each([
    ["1180", 118000],
    ["1180.5", 118050],
    ["1180.05", 118005],
    ["₹1,23,456.78", 12345678],
    ["Rs. 1,234", 123400],
    ["INR 59,000.00", 5900000],
    [" 0.10 ", 10],
    ["0", 0],
  ])("parses %s", (input, expected) => {
    expect(parseMoneyToMinor(input)).toBe(expected);
  });

  it("avoids float drift on spreadsheet numbers", () => {
    expect(parseMoneyToMinor(0.1 + 0.2)).toBe(30);
    expect(parseMoneyToMinor(1180.55)).toBe(118055);
  });

  it.each(["", "abc", "12.345", "1.2.3", "12a", "--5"])("rejects %j", (input) => {
    expect(() => parseMoneyToMinor(input)).toThrow();
  });

  it("rejects negatives unless allowed", () => {
    expect(() => parseMoneyToMinor("-50")).toThrow(/negative/);
    expect(parseMoneyToMinor("-50", { allowNegative: true })).toBe(-5000);
    expect(parseMoneyToMinor("(1,000.00)", { allowNegative: true })).toBe(-100000);
  });
});

describe("formatMoney", () => {
  it("uses Indian digit grouping", () => {
    expect(formatMoney(12345678)).toBe("₹1,23,456.78");
    expect(formatMoney(1000000000)).toBe("₹1,00,00,000.00");
    expect(formatMoney(12345678, "INR", { compact: true })).toBe("₹1,23,457");
  });
});

describe("minorToInput", () => {
  it("round-trips", () => {
    for (const v of [0, 5, 99, 100, 118055, 12345678]) {
      expect(parseMoneyToMinor(minorToInput(v))).toBe(v);
    }
    expect(minorToInput(null)).toBe("");
  });
});
