import { describe, expect, it } from "vitest";
import { assessmentYearLabel, financialYear, parsePeriodKey, periodRange, weekRange } from "@/domain/periods";
import {
  closerDesk, financeMetrics, groupTotals, includedInGroupTotals, summarizePipeline, weightedMinor,
  type DealRow, type StageRow, type CompanyFigures, type FinanceMetrics,
} from "@/domain/dashboard";
import { formatShort } from "@/domain/money";
import { COMPANY_TEMPLATES, MODULE_KEYS, isValidSlug } from "@/domain/registry";

describe("periods", () => {
  it("uses the Indian financial year (April to March)", () => {
    expect(financialYear("2026-11-12")).toMatchObject({ start: "2026-04-01", end: "2027-04-01", label: "FY 2026-27" });
    expect(financialYear("2027-03-31")).toMatchObject({ start: "2026-04-01", label: "FY 2026-27" });
    expect(financialYear("2027-04-01")).toMatchObject({ start: "2027-04-01", label: "FY 2027-28" });
    expect(assessmentYearLabel(2026)).toBe("AY 2027-28");
  });

  it("does not confuse the calendar year with the FY", () => {
    expect(periodRange("fy", "2027-02-10")).toMatchObject({ start: "2026-04-01", end: "2027-04-01" });
    expect(financialYear("2026-06-01", 1)).toMatchObject({ start: "2026-01-01", end: "2027-01-01", label: "FY 2026" });
  });

  it("computes FY quarters", () => {
    expect(periodRange("quarter", "2026-11-12")).toMatchObject({ start: "2026-10-01", end: "2027-01-01", label: "Q3 FY 2026-27" });
    expect(periodRange("quarter", "2027-01-05")).toMatchObject({ start: "2027-01-01", end: "2027-04-01", label: "Q4 FY 2026-27" });
    expect(periodRange("quarter", "2026-04-01")).toMatchObject({ start: "2026-04-01", label: "Q1 FY 2026-27" });
  });

  it("computes month ranges across a year boundary", () => {
    expect(periodRange("month", "2026-12-31")).toMatchObject({ start: "2026-12-01", end: "2027-01-01" });
    expect(periodRange("last_month", "2027-01-15")).toMatchObject({ start: "2026-12-01", end: "2027-01-01" });
  });

  it("parses unknown period keys to this month", () => {
    expect(parsePeriodKey("fy")).toBe("fy");
    expect(parsePeriodKey("'; drop")).toBe("month");
    expect(parsePeriodKey(undefined)).toBe("month");
  });

  it("weeks start on Monday", () => {
    expect(weekRange("2026-11-12")).toEqual({ start: "2026-11-09", end: "2026-11-16" }); // Thursday
    expect(weekRange("2026-11-15")).toEqual({ start: "2026-11-09", end: "2026-11-16" }); // Sunday
  });
});

const stages: StageRow[] = [
  { id: "s1", organization_id: "o", name: "Lead", position: 0, kind: "open", probability_pct: 10 },
  { id: "s2", organization_id: "o", name: "Proposal", position: 1, kind: "proposal", probability_pct: 50 },
  { id: "s3", organization_id: "o", name: "Won", position: 2, kind: "won", probability_pct: 100 },
  { id: "s4", organization_id: "o", name: "Lost", position: 3, kind: "lost", probability_pct: 0 },
];
const deal = (over: Partial<DealRow>): DealRow => ({
  id: Math.random().toString(36), organization_id: "o", title: "Deal", account_name: null, stage_id: "s1", value_minor: 0,
  currency: "INR", owner_id: null, is_hot: false, expected_close_on: null, next_action: null, next_action_on: null,
  last_activity_at: "2026-11-11T10:00:00Z", closed_at: null, ...over,
});
const nov = { start: "2026-11-01", end: "2026-12-01" };

describe("summarizePipeline", () => {
  it("separates open, won-in-period and lost, and weights by stage probability", () => {
    const s = summarizePipeline(stages, [
      deal({ value_minor: 100_000_00, stage_id: "s1" }),
      deal({ value_minor: 50_000_33, stage_id: "s2" }),
      deal({ value_minor: 75_000_00, stage_id: "s3", closed_at: "2026-11-03T05:00:00Z" }),
      deal({ value_minor: 99_000_00, stage_id: "s3", closed_at: "2026-10-30T05:00:00Z" }), // won last month
      deal({ value_minor: 10_000_00, stage_id: "s4", closed_at: "2026-11-02T05:00:00Z" }),
    ], nov);
    expect(s.openCount).toBe(2);
    expect(s.openValueMinor).toBe(150_000_33);
    expect(s.weightedMinor).toBe(10_000_00 + 25_000_17); // 50,000.33 × 50% rounds to whole paise
    expect(s.won).toEqual({ count: 1, valueMinor: 75_000_00 });
    expect(s.lost.count).toBe(1);
    expect(s.byStage.map((b) => b.count)).toEqual([1, 1, 1, 1]);
    expect(s.probabilitiesSet).toBe(true);
  });

  it("never adds a foreign-currency deal into INR totals", () => {
    const s = summarizePipeline(stages, [deal({ value_minor: 5_000_00, currency: "USD" }), deal({ value_minor: 1_00 })], nov);
    expect(s.openValueMinor).toBe(1_00);
    expect(s.otherCurrencyOpen).toBe(1);
    expect(s.byStage[0].count).toBe(2);
  });

  it("flags an unconfigured weighted forecast", () => {
    const s = summarizePipeline(stages.map((x) => (x.kind === "won" ? x : { ...x, probability_pct: 0 })), [deal({ value_minor: 100 })], nov);
    expect(s.probabilitiesSet).toBe(false);
    expect(s.weightedMinor).toBe(0);
  });

  it("is exact on large values", () => {
    expect(weightedMinor(9_007_199_254_740, 33)).toBe(2_972_375_754_064);
    expect(weightedMinor(1, 50)).toBe(1);
  });
});

describe("closerDesk", () => {
  const base = { today: "2026-11-12", now: "2026-11-12T06:00:00Z", stages, tasks: [], meetings: [] };

  it("is empty when there is nothing to decide", () => {
    expect(closerDesk({ ...base, deals: [] })).toEqual([]);
  });

  it("ranks by money at stake and counts each deal once", () => {
    const hot = deal({ id: "hot", title: "Big hot", value_minor: 1_20_000_00, is_hot: true, stage_id: "s2" });
    const proposal = deal({ id: "p", value_minor: 60_000_00, stage_id: "s2" });
    const stalled = deal({ id: "st", value_minor: 2_00_000_00, last_activity_at: "2026-10-01T00:00:00Z" });
    const won = deal({ id: "w", value_minor: 9_00_000_00, stage_id: "s3", is_hot: true });
    const items = closerDesk({ ...base, deals: [hot, proposal, stalled, won], overdue: { count: 2, minor: 1_30_000_00 } });
    expect(items.map((i) => i.key)).toEqual(["stalled", "collections", "hot", "proposals"]);
    expect(items.find((i) => i.key === "hot")).toMatchObject({ count: 1, atStakeMinor: 1_20_000_00 });
    expect(items.find((i) => i.key === "proposals")).toMatchObject({ count: 1, atStakeMinor: 60_000_00 }); // hot proposal not double counted
    expect(items.some((i) => i.atStakeMinor === 9_00_000_00)).toBe(false); // won deals are not on the desk
  });

  it("puts upcoming meetings first in precedence and includes overdue tasks", () => {
    const d = deal({ id: "m", value_minor: 10_00, is_hot: true });
    const items = closerDesk({
      ...base, deals: [d],
      meetings: [
        { id: "1", organization_id: "o", title: "Call", starts_at: "2026-11-13T05:00:00Z", status: "scheduled", deal_id: "m", owner_id: null },
        { id: "2", organization_id: "o", title: "Old", starts_at: "2026-11-01T05:00:00Z", status: "scheduled", deal_id: null, owner_id: null },
      ],
      tasks: [{ id: "t", organization_id: "o", title: "x", due_on: "2026-11-10", status: "open", priority: "normal", assignee_id: null, deal_id: null }],
    });
    expect(items.find((i) => i.key === "meetings")).toMatchObject({ count: 1, atStakeMinor: 10_00 });
    expect(items.find((i) => i.key === "hot")).toBeUndefined();
    expect(items.find((i) => i.key === "overdue_followups")).toMatchObject({ count: 1, atStakeMinor: 0 });
  });

  it("omits collections when the viewer has no finance access", () => {
    expect(closerDesk({ ...base, deals: [] }).some((i) => i.key === "collections")).toBe(false);
  });
});

describe("financeMetrics", () => {
  const m = financeMetrics({
    invoices: [
      { invoice_date: "2026-11-02", status: "issued", total_minor: 1_18_000_00, outstanding_minor: 1_18_000_00, effective_due_date: "2026-11-09", currency: "INR" },
      { invoice_date: "2026-10-02", status: "issued", total_minor: 59_000_00, outstanding_minor: 0, effective_due_date: "2026-10-09", currency: "INR" },
      { invoice_date: "2026-11-05", status: "cancelled", total_minor: 10_000_00, outstanding_minor: 0, effective_due_date: "2026-11-10", currency: "INR" },
      { invoice_date: "2026-11-05", status: "issued", total_minor: 1_000_00, outstanding_minor: 1_000_00, effective_due_date: "2026-12-10", currency: "USD" },
    ],
    payments: [
      { payment_date: "2026-11-03", amount_minor: 59_000_00, kind: "receipt", verification_status: "verified", currency: "INR" },
      { payment_date: "2026-11-04", amount_minor: 5_000_00, kind: "refund", verification_status: "verified", currency: "INR" },
      { payment_date: "2026-11-04", amount_minor: 99_000_00, kind: "receipt", verification_status: "pending_verification", currency: "INR" },
    ],
    expenses: [
      { status: "planned", amount_minor: 20_000_00, due_date: "2026-11-20", paid_on: null, paid_amount_minor: null, currency: "INR" },
      { status: "paid", amount_minor: 8_000_00, due_date: "2026-11-01", paid_on: "2026-11-01", paid_amount_minor: 8_000_00, currency: "INR" },
    ],
  }, nov, "2026-11-12");

  it("keeps booked income and cash received apart", () => {
    expect(m.invoicedMinor).toBe(1_18_000_00);
    expect(m.cashReceivedMinor).toBe(54_000_00); // verified only, refunds subtracted
    expect(m.receivablesMinor).toBe(1_18_000_00);
    expect(m.overdueMinor).toBe(1_18_000_00);
  });

  it("keeps unpaid and paid expenses apart, and skips other currencies", () => {
    expect(m.payablesMinor).toBe(20_000_00);
    expect(m.expensesPaidMinor).toBe(8_000_00);
    expect(m.otherCurrencyRows).toBe(1);
  });
});

describe("groupTotals", () => {
  const fin = (n: number): FinanceMetrics => ({ invoicedMinor: n, cashReceivedMinor: n, receivablesMinor: n, overdueMinor: 0, overdueCount: 0, payablesMinor: 0, expensesPaidMinor: 0, otherCurrencyRows: 0 });
  const pipe = (open: number) => summarizePipeline(stages, [deal({ value_minor: open })], nov);
  const companies: CompanyFigures[] = [
    { id: "gbs", consolidation: "consolidated", access: { finance: true, crm: true }, finance: fin(100), pipeline: pipe(1000), meetingsThisWeek: 2, overdueTasks: 1 },
    { id: "tof", consolidation: "consolidated", access: { finance: false, crm: true }, finance: fin(999), pipeline: pipe(500) },
    { id: "ashwin", consolidation: "commission_only", access: { finance: true, crm: true }, finance: fin(50), pipeline: pipe(5_00_00_000_00), meetingsThisWeek: 1 },
    { id: "lapinoz", consolidation: "share_per_agreement", access: { finance: true, crm: true }, finance: fin(70) },
    { id: "vyra", consolidation: "needs_confirmation", access: { finance: false, crm: false } },
  ];
  const t = groupTotals(companies);

  it("adds only consolidated companies the viewer may read", () => {
    expect(t.finance.invoicedMinor).toBe(100);
    expect(t.includedFinance).toEqual(["gbs"]);
    expect(t.openPipelineMinor).toBe(1500);
    expect(t.includedPipeline).toEqual(["gbs", "tof"]);
  });

  it("never counts partner gross deal value as group revenue", () => {
    expect(t.partnerGrossPipelineMinor).toBe(5_00_00_000_00);
    expect(t.openPipelineMinor).toBeLessThan(t.partnerGrossPipelineMinor);
    expect(includedInGroupTotals("commission_only")).toBe(false);
    expect(includedInGroupTotals("share_per_agreement")).toBe(false);
    expect(includedInGroupTotals("needs_confirmation")).toBe(false);
  });

  it("reports what was left out and why", () => {
    expect(t.shownSeparately).toEqual(["ashwin", "lapinoz"]);
    expect(t.noAccess).toEqual(["vyra"]);
    expect(t.meetingsThisWeek).toBe(3);
    expect(t.overdueTasks).toBe(1);
  });
});

describe("formatShort", () => {
  it.each([
    [85_000_00, "₹85,000"],
    [1_50_000_00, "₹1.5 L"],
    [17_90_000_00, "₹17.9 L"],
    [2_40_00_000_00, "₹2.4 Cr"],
    [1_00_000_00, "₹1 L"],
    [0, "₹0"],
    [-1_50_000_00, "−₹1.5 L"],
  ])("formats %i", (minor, expected) => {
    expect(formatShort(minor)).toBe(expected);
  });
});

describe("registry templates", () => {
  it("are valid configuration", () => {
    const slugs = new Set<string>();
    for (const c of COMPANY_TEMPLATES) {
      expect(isValidSlug(c.slug)).toBe(true);
      expect(slugs.has(c.slug)).toBe(false);
      slugs.add(c.slug);
      for (const m of c.enabled_modules) expect(MODULE_KEYS).toContain(m);
      expect(c.enabled_modules).toContain("home");
      expect(c.stages.filter((s) => s.kind === "won")).toHaveLength(1);
      expect(c.sidebar_color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("never treats partner channels as owned or consolidated", () => {
    const partners = COMPANY_TEMPLATES.filter((c) => c.ownership_type === "partner_channel");
    expect(partners.map((p) => p.short_name)).toEqual(["Ashwin Bhai", "Accent Spaces", "Refresh Money"]);
    for (const p of partners) expect(p.consolidation).toBe("commission_only");
    expect(COMPANY_TEMPLATES.find((c) => c.slug === "la-pinoz")?.consolidation).toBe("share_per_agreement");
  });

  it("does not invent the unnamed tenth business", () => {
    expect(COMPANY_TEMPLATES).toHaveLength(11);
  });
});
