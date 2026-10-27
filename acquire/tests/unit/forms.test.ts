import { describe, expect, it } from "vitest";
import { coversAutomatedCalls, hashIp, parseSubmission, propertyLinkToken, readPropertyLinkToken } from "@/domain/forms";
import { unsubscribeToken } from "@/domain/outreach";

const form = { consent_email: "Email me listings.", consent_sms: "Text me. Reply STOP to opt out.", consent_call: "Call me, including automated calls.", ask_budget: true, ask_location: true };
const opts = { market: "US", currency: "USD" };

describe("form submissions", () => {
  it("normalises fields and records only ticked consent with the configured wording", () => {
    const r = parseSubmission({ full_name: "  Ana  Lopez ", email: "Ana@Example.com", phone: "(212) 736-5000", budget: "500k", consent_email: "on", consent_call: "on" }, form, opts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ full_name: "Ana Lopez", email: "ana@example.com", phone_e164: "+12127365000", budget_max_minor: 50_000_000, country: "US" });
    expect(r.data.consent.map((c) => c.channel)).toEqual(["email", "phone_call", "ai_voice_call"]);
    expect(r.data.consent[0].text).toBe("Email me listings.");
  });
  it("needs a way to reach the person and rejects bad values", () => {
    const r = parseSubmission({ full_name: "X" }, form, opts);
    expect(r).toMatchObject({ ok: false, spam: false, errors: { email: expect.any(String) } });
    expect(parseSubmission({ full_name: "X", phone: "123" }, form, opts)).toMatchObject({ ok: false, errors: { phone: expect.any(String) } });
  });
  it("treats a filled honeypot as spam", () => {
    expect(parseSubmission({ full_name: "Bot", email: "b@example.com", website: "http://spam" }, form, opts)).toEqual({ ok: false, spam: true, errors: {} });
  });
  it("ignores consent for a channel the form does not offer or the person did not give", () => {
    const r = parseSubmission({ full_name: "A", email: "a@example.com", consent_sms: "on" }, form, opts);
    expect(r.ok && r.data.consent).toEqual([]);
    const noSms = parseSubmission({ full_name: "A", phone: "+12127365000", consent_sms: "on" }, { ...form, consent_sms: null }, opts);
    expect(noSms.ok && noSms.data.consent).toEqual([]);
  });
  it("counts call consent as AI-call consent only when the wording says so", () => {
    expect(coversAutomatedCalls("We may call you using an AI assistant")).toBe(true);
    expect(coversAutomatedCalls("An agent may call you")).toBe(false);
  });
});

describe("signed links", () => {
  const org = "11111111-1111-1111-1111-111111111111", lead = "22222222-2222-2222-2222-222222222222", prop = "33333333-3333-3333-3333-333333333333";
  it("round-trips property links and rejects tampering or other purposes", () => {
    const t = propertyLinkToken("s", org, lead, prop);
    expect(readPropertyLinkToken("s", t)).toEqual({ orgId: org, leadId: lead, propertyId: prop });
    expect(readPropertyLinkToken("other", t)).toBeNull();
    expect(readPropertyLinkToken("s", unsubscribeToken("s", org, lead))).toBeNull();
  });
  it("hashes IPs per day", () => {
    expect(hashIp("k", "1.2.3.4", "2026-10-27")).toBe(hashIp("k", "1.2.3.4", "2026-10-27"));
    expect(hashIp("k", "1.2.3.4", "2026-10-27")).not.toBe(hashIp("k", "1.2.3.4", "2026-10-28"));
  });
});
