import { describe, expect, it } from "vitest";
import { evaluateEligibility, nextAllowed, intersect, MARKET_RULES, type EligibilityInput } from "@/domain/eligibility";

// 2026-10-27 is a Tuesday. 15:00 UTC = 11:00 New York, 15:00 London, 19:00 Dubai.
const TUE_1500Z = new Date("2026-10-27T15:00:00Z");

function base(over: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    channel: "email",
    country: "US",
    timezone: "America/New_York",
    hasContactValue: true,
    suppressed: false,
    optedOutStage: false,
    consent: undefined,
    now: TUE_1500Z,
    orgWindow: { start: "09:00", end: "20:00" },
    impliedInquiryDays: 180,
    ...over,
  };
}

const granted = (basis: "express_written" | "express" | "implied_existing_relationship" | "implied_inquiry" | "legitimate_interest", capturedAt = new Date("2026-10-01T00:00:00Z"), expiresAt: Date | null = null) =>
  ({ status: "granted" as const, basis, capturedAt, expiresAt });

describe("hard blocks", () => {
  it("blocks suppressed contacts even with consent", () => {
    const r = evaluateEligibility(base({ suppressed: true, consent: granted("express_written") }));
    expect(r.decision).toBe("block");
    expect(r.reasons.map((x) => x.code)).toContain("suppressed");
  });
  it("blocks opted-out leads and missing contact values", () => {
    expect(evaluateEligibility(base({ optedOutStage: true, consent: granted("express") })).decision).toBe("block");
    expect(evaluateEligibility(base({ hasContactValue: false, consent: granted("express") })).decision).toBe("block");
  });
  it("blocks after consent is withdrawn", () => {
    const r = evaluateEligibility(base({ consent: { status: "withdrawn", basis: "none_recorded", capturedAt: TUE_1500Z, expiresAt: null } }));
    expect(r.decision).toBe("block");
    expect(r.reasons[0].code).toBe("consent_withdrawn");
  });
});

describe("United States", () => {
  it("never allows an AI voice call without express written consent", () => {
    for (const b of ["express", "implied_inquiry", "implied_existing_relationship", "legitimate_interest"] as const) {
      expect(evaluateEligibility(base({ channel: "ai_voice_call", consent: granted(b) })).decision).toBe("block");
    }
    expect(evaluateEligibility(base({ channel: "ai_voice_call", consent: granted("express_written") })).decision).toBe("allow");
  });
  it("blocks marketing SMS without express written consent", () => {
    expect(evaluateEligibility(base({ channel: "sms" })).decision).toBe("block");
    expect(evaluateEligibility(base({ channel: "sms", consent: granted("express_written") })).decision).toBe("allow");
  });
  it("sends a live call with no consent to review for a DNC registry check", () => {
    const r = evaluateEligibility(base({ channel: "phone_call" }));
    expect(r.decision).toBe("review");
    expect(r.reasons[0].message).toMatch(/National Do Not Call Registry/);
  });
  it("lets a recent enquiry cover a live call but not after 90 days", () => {
    const recent = granted("implied_inquiry", new Date("2026-09-01T00:00:00Z"));
    expect(evaluateEligibility(base({ channel: "phone_call", consent: recent })).decision).toBe("allow");
    const old = granted("implied_inquiry", new Date("2026-06-01T00:00:00Z"));
    const r = evaluateEligibility(base({ channel: "phone_call", consent: old }));
    expect(r.decision).toBe("review");
    expect(r.reasons.map((x) => x.code)).toContain("inquiry_stale");
  });
  it("asks for review, not block, for email with no recorded basis", () => {
    expect(evaluateEligibility(base()).decision).toBe("review");
    expect(evaluateEligibility(base({ consent: granted("legitimate_interest") })).decision).toBe("allow");
  });
  it("treats expired consent as no consent", () => {
    const r = evaluateEligibility(base({ channel: "sms", consent: granted("express_written", new Date("2025-01-01"), new Date("2026-01-01")) }));
    expect(r.decision).toBe("block");
    expect(r.reasons.map((x) => x.code)).toContain("consent_expired");
  });
});

describe("contact hours", () => {
  it("defers a call outside the recipient's local hours and says when it may resume", () => {
    // 03:00 UTC Tuesday = 23:00 Monday in New York.
    const r = evaluateEligibility(base({ channel: "sms", consent: granted("express_written"), now: new Date("2026-10-27T03:00:00Z") }));
    expect(r.decision).toBe("defer");
    // Next allowed: 09:00 New York (org window is stricter than TCPA's 08:00) = 13:00 UTC.
    expect(r.notBefore?.toISOString()).toBe("2026-10-27T13:00:00.000Z");
  });
  it("needs review when the recipient's time zone is unknown", () => {
    expect(evaluateEligibility(base({ channel: "sms", consent: granted("express_written"), timezone: null })).decision).toBe("review");
  });
  it("does not apply hours to email", () => {
    expect(evaluateEligibility(base({ consent: granted("express"), timezone: null, now: new Date("2026-10-27T03:00:00Z") })).decision).toBe("allow");
  });
  it("applies Australia's no-Sunday rule", () => {
    const sunday = new Date("2026-11-01T01:00:00Z"); // Sunday 12:00 in Sydney
    const r = evaluateEligibility(base({ channel: "phone_call", country: "AU", timezone: "Australia/Sydney", consent: granted("express"), now: sunday }));
    expect(r.decision).toBe("defer");
    expect(r.notBefore && new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short", hour: "2-digit", hourCycle: "h23" }).format(r.notBefore)).toMatch(/^Mon,? 09$/);
  });
  it("applies Canada's weekend hours", () => {
    const sat0930 = new Date("2026-10-31T13:30:00Z"); // Saturday 09:30 Toronto
    const r = evaluateEligibility(base({ channel: "phone_call", country: "CA", timezone: "America/Toronto", consent: granted("express"), now: sat0930 }));
    expect(r.decision).toBe("defer");
  });
  it("uses the stricter of statutory and organization windows", () => {
    const h = intersect(MARKET_RULES.AE.rules.phone_call.hours!, { start: "10:00", end: "20:00" });
    expect(h.weekday).toEqual(["10:00", "18:00"]);
  });
  it("returns undefined when there is no allowed window at all", () => {
    expect(nextAllowed({ weekday: ["00:00", "00:00"], saturday: null, sunday: null }, TUE_1500Z, "UTC")).toBeUndefined();
  });
});

describe("other markets", () => {
  it("UK: legitimate interest is not enough for marketing email, soft opt-in is", () => {
    const uk = { country: "GB", timezone: "Europe/London" };
    expect(evaluateEligibility(base({ ...uk, consent: granted("legitimate_interest") })).decision).toBe("block");
    expect(evaluateEligibility(base({ ...uk, consent: granted("implied_existing_relationship") })).decision).toBe("allow");
  });
  it("UK: live call without consent needs a TPS check", () => {
    const r = evaluateEligibility(base({ channel: "phone_call", country: "GB", timezone: "Europe/London" }));
    expect(r.decision).toBe("review");
    expect(r.reasons[0].message).toMatch(/TPS/);
  });
  it("Canada: an enquiry older than six months no longer counts for email", () => {
    const old = granted("implied_inquiry", new Date("2026-03-01T00:00:00Z"));
    expect(evaluateEligibility(base({ country: "CA", timezone: "America/Toronto", consent: old })).decision).toBe("block");
  });
  it("UAE: a call at 19:00 Dubai time is deferred", () => {
    const r = evaluateEligibility(base({ channel: "phone_call", country: "AE", timezone: "Asia/Dubai", consent: granted("express") }));
    expect(r.decision).toBe("defer");
  });
  it("unknown country: strict defaults and a review flag", () => {
    const r = evaluateEligibility(base({ country: null, consent: granted("express") }));
    expect(r.decision).toBe("review");
    expect(evaluateEligibility(base({ country: "DE", timezone: "Europe/Berlin", consent: granted("implied_existing_relationship") })).decision).toBe("block");
  });
  it("records the ruleset version on every result", () => {
    expect(evaluateEligibility(base()).rulesetVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
});
