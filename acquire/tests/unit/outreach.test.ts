import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  decideStep, firstName, isOptOut, nextRunAt, readUnsubscribeToken, renderTemplate, smsSegments, textToHtml,
  twilioSignature, unsubscribeToken, verifySvix, verifyTwilio,
} from "@/domain/outreach";

describe("templates", () => {
  it("fills variables and reports missing ones", () => {
    const r = renderTemplate("Hi {{first_name}}, homes in {{ preferred_location }} from {{agent_name}}.", { first_name: "Ava", preferred_location: "Austin" });
    expect(r.text).toBe("Hi Ava, homes in Austin from .");
    expect(r.missing).toEqual(["agent_name"]);
  });
  it("first names and HTML escaping", () => {
    expect(firstName("  Jordan  Patel ")).toBe("Jordan");
    expect(textToHtml("a <b>\n\nnext")).toBe("<p>a &lt;b&gt;</p>\n<p>next</p>");
  });
  it("counts SMS segments", () => {
    expect(smsSegments("x".repeat(160))).toBe(1);
    expect(smsSegments("x".repeat(161))).toBe(2);
    expect(smsSegments("Hi 😀")).toBe(1);
    expect(smsSegments("😀".repeat(71))).toBe(2);
  });
});

describe("opt-out keywords", () => {
  it("recognises standard keywords only as the whole message", () => {
    expect(["STOP", "stop.", " Unsubscribe ", "Remove me"].every(isOptOut)).toBe(true);
    expect(isOptOut("please don't stop sending")).toBe(false);
  });
});

describe("Twilio signatures", () => {
  // Expected value computed independently with Python's hmac module from Twilio's documented
  // algorithm (URL + params sorted by name, HMAC-SHA1, base64). Not yet checked against a live request.
  const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const params = { To: "+18005551212", From: "+14158675310", Digits: "1234", Caller: "+14158675310", CallSid: "CA1234567890ABCDE" };
  it("signs URL plus sorted params and rejects tampering", () => {
    expect(twilioSignature("12345", url, params)).toBe("GvWf1cFY/Q7PnoempGyD5oXAezc=");
    expect(verifyTwilio("12345", url, params, "GvWf1cFY/Q7PnoempGyD5oXAezc=")).toBe(true);
    expect(verifyTwilio("12345", url, { ...params, Digits: "9" }, "GvWf1cFY/Q7PnoempGyD5oXAezc=")).toBe(false);
    expect(verifyTwilio("12345", url, params, null)).toBe(false);
  });
});

describe("Svix (Resend) signatures", () => {
  const secret = `whsec_${Buffer.from("test-secret-key-0123456789").toString("base64")}`;
  const sign = (id: string, ts: string, body: string) =>
    createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64");
  it("accepts a valid signature and rejects tampering and replays", () => {
    const now = 1_800_000_000_000;
    const ts = String(now / 1000);
    const body = '{"type":"email.bounced"}';
    const sig = sign("msg_1", ts, body);
    expect(verifySvix(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body, now)).toBe(true);
    expect(verifySvix(secret, { id: "msg_1", timestamp: ts, signature: `v1,bad v1,${sig}` }, body, now)).toBe(true);
    expect(verifySvix(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body + " ", now)).toBe(false);
    expect(verifySvix(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body, now + 10 * 60_000)).toBe(false);
  });
});

describe("unsubscribe tokens", () => {
  const org = "11111111-1111-1111-1111-111111111111";
  const lead = "22222222-2222-2222-2222-222222222222";
  it("round-trips and rejects forgeries", () => {
    const t = unsubscribeToken("s3cret", org, lead);
    expect(readUnsubscribeToken("s3cret", t)).toEqual({ orgId: org, leadId: lead });
    expect(readUnsubscribeToken("other", t)).toBeNull();
    const forged = `${Buffer.from(`${org}.33333333-3333-3333-3333-333333333333`).toString("base64url")}.${t.split(".")[1]}`;
    expect(readUnsubscribeToken("s3cret", forged)).toBeNull();
    expect(readUnsubscribeToken("s3cret", "garbage")).toBeNull();
  });
});

describe("sequences", () => {
  const steps = [
    { channel: "email" as const, template_id: "a", delay_days: 0 },
    { channel: "sms" as const, template_id: "b", delay_days: 2 },
  ];
  it("schedules the next step from the previous one", () => {
    const from = new Date("2026-10-27T10:00:00Z");
    expect(nextRunAt(steps, 1, from)?.toISOString()).toBe("2026-10-29T10:00:00.000Z");
    expect(nextRunAt(steps, 2, from)).toBeNull();
  });
  it("maps eligibility to a step outcome", () => {
    expect(decideStep({ decision: "allow", reasons: [] })).toEqual({ kind: "send" });
    const until = new Date("2026-10-28T13:00:00Z");
    expect(decideStep({ decision: "defer", notBefore: until, reasons: [] })).toEqual({ kind: "defer", until });
    expect(decideStep({ decision: "review", reasons: [{ message: "Check TPS" }] })).toEqual({ kind: "hold", reason: "Check TPS" });
    expect(decideStep({ decision: "block", reasons: [{ message: "Suppressed" }] })).toEqual({ kind: "skip", reason: "Suppressed" });
  });
});
