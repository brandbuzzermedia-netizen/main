import { describe, expect, it } from "vitest";
import { addDays, daysBetween, parseFlexibleDate, todayInBusinessTz } from "@/domain/dates";

describe("parseFlexibleDate", () => {
  it.each([
    ["17-10-2026", "2026-10-17"],
    ["17/10/2026", "2026-10-17"],
    ["7.1.26", "2026-01-07"],
    ["2026-10-17", "2026-10-17"],
    ["2026-10-17T10:00:00Z", "2026-10-17"],
    ["17 Oct 2026", "2026-10-17"],
    ["17-Oct-2026", "2026-10-17"],
    ["1 Sept 2026", "2026-09-01"],
    ["29-02-2028", "2028-02-29"],
  ])("parses %s as day-first", (input, expected) => {
    expect(parseFlexibleDate(input)).toBe(expected);
  });

  it.each(["31-02-2026", "13/13/2026", "", "Oct 17 2026", "17 Foo 2026", "2026/10/17x"])("rejects %j", (input) => {
    expect(() => parseFlexibleDate(input)).toThrow();
  });
});

describe("business timezone", () => {
  it("uses Asia/Kolkata for today", () => {
    // 20:00 UTC on 17 Oct is 01:30 IST on 18 Oct.
    expect(todayInBusinessTz(new Date("2026-10-17T20:00:00Z"))).toBe("2026-10-18");
    expect(todayInBusinessTz(new Date("2026-10-17T18:00:00Z"))).toBe("2026-10-17");
  });

  it("does calendar arithmetic without DST/time drift", () => {
    expect(addDays("2026-10-28", 7)).toBe("2026-11-04");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-01", "2026-10-17")).toBe(16);
  });
});
