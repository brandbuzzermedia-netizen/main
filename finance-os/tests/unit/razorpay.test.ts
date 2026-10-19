import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { buildReferenceId, isGatewaySettlement, normalizeRazorpayEvent, verifyRazorpaySignature } from "@/integrations/razorpay/webhook";

const secret = "whsec_test_123";
const body = JSON.stringify({
  entity: "event",
  event: "payment_link.paid",
  contains: ["payment_link", "order", "payment"],
  payload: {
    payment_link: { entity: { id: "plink_ABC", status: "paid", amount: 118000, amount_paid: 118000, reference_id: "INV-1-x" } },
    order: { entity: { id: "order_1", amount_paid: 118000, status: "paid" } },
    payment: { entity: { id: "pay_123", amount: 118000, status: "captured", method: "upi", created_at: 1792400000 } },
  },
  created_at: 1792400001,
});
const sign = (b: string, s = secret) => createHmac("sha256", s).update(b).digest("hex");

describe("verifyRazorpaySignature", () => {
  it("accepts a correct signature over the raw body", () => {
    expect(verifyRazorpaySignature(body, sign(body), secret)).toBe(true);
    expect(verifyRazorpaySignature(body, sign(body).toUpperCase(), secret)).toBe(true);
  });
  it("rejects tampering, wrong secrets and missing headers", () => {
    expect(verifyRazorpaySignature(body.replace("118000", "1"), sign(body), secret)).toBe(false);
    expect(verifyRazorpaySignature(body, sign(body, "other"), secret)).toBe(false);
    expect(verifyRazorpaySignature(body, null, secret)).toBe(false);
    expect(verifyRazorpaySignature(body, "zz", secret)).toBe(false);
    expect(verifyRazorpaySignature(body, sign(body), "")).toBe(false);
  });
  it("is sensitive to re-serialisation (must verify the raw body)", () => {
    const reserialised = JSON.stringify(JSON.parse(body), null, 1);
    expect(verifyRazorpaySignature(reserialised, sign(body), secret)).toBe(false);
  });
});

describe("normalizeRazorpayEvent", () => {
  it("extracts link and payment fields", () => {
    expect(normalizeRazorpayEvent(JSON.parse(body))).toEqual({
      eventType: "payment_link.paid", linkId: "plink_ABC", linkStatus: "paid", linkAmountPaid: 118000,
      paymentId: "pay_123", paymentAmount: 118000, paymentStatus: "captured", paymentMethod: "upi",
      paidAt: new Date(1792400000 * 1000).toISOString(),
    });
  });
  it("tolerates missing entities", () => {
    expect(normalizeRazorpayEvent({ event: "payment_link.expired", payload: { payment_link: { entity: { id: "plink_X", status: "expired" } } } }))
      .toMatchObject({ linkId: "plink_X", paymentId: null, paymentAmount: null });
    expect(normalizeRazorpayEvent(null).eventType).toBe("unknown");
  });
});

describe("helpers", () => {
  it("builds unique reference ids within 40 characters", () => {
    const id = buildReferenceId("GBS/26-27/0412-SPECIAL-RETAINER-OCTOBER-2026", 1792400000000);
    expect(id.length).toBeLessThanOrEqual(40);
    expect(id).toMatch(/-[0-9a-z]+$/);
    expect(buildReferenceId("A", 1)).not.toBe(buildReferenceId("A", 2));
  });
  it("detects Razorpay settlement credits in bank narrations", () => {
    expect(isGatewaySettlement("NEFT-UTIB0000001-RAZORPAY SOFTWARE PVT LTD-setl_ABC")).toBe(true);
    expect(isGatewaySettlement("UPI/629812345678/Payment from LYKES")).toBe(false);
  });
});
