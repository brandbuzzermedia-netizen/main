import { describe, expect, it } from "vitest";
import { sign, verify } from "@/integrations/n8n/signing";
import { AUTOMATION_TEMPLATES } from "@/integrations/n8n/templates";

const secret = "s3cret-for-tests-only";
const now = 1_794_500_000;
const nonce = "a1b2c3d4e5f60718293a4b5c";
const body = JSON.stringify({ run_id: "x", status: "succeeded" });

describe("n8n request signing", () => {
  it("accepts a correctly signed, fresh request", () => {
    expect(verify(secret, { timestamp: String(now), nonce, signature: sign(secret, now, nonce, body) }, body, now + 10)).toEqual({ ok: true });
  });
  it("rejects an invalid signature", () => {
    expect(verify(secret, { timestamp: String(now), nonce, signature: sign("other", now, nonce, body) }, body, now)).toEqual({ ok: false, reason: "bad_signature" });
  });
  it("rejects a tampered body", () => {
    expect(verify(secret, { timestamp: String(now), nonce, signature: sign(secret, now, nonce, body) }, body + " ", now).ok).toBe(false);
  });
  it("rejects stale timestamps (replay window)", () => {
    expect(verify(secret, { timestamp: String(now), nonce, signature: sign(secret, now, nonce, body) }, body, now + 301)).toEqual({ ok: false, reason: "stale" });
  });
  it("rejects missing headers and an unset secret", () => {
    expect(verify(secret, { timestamp: null, nonce, signature: "ab" }, body).ok).toBe(false);
    expect(verify("", { timestamp: String(now), nonce, signature: sign("", now, nonce, body) }, body, now).ok).toBe(false);
  });
});

describe("automation templates", () => {
  it("has the 15 workflows from the brief, financial ones always gated", () => {
    expect(AUTOMATION_TEMPLATES).toHaveLength(15);
    expect(new Set(AUTOMATION_TEMPLATES.map((t) => t.key)).size).toBe(15);
    for (const t of AUTOMATION_TEMPLATES) if (t.isFinancial) expect(t.requiresApproval).toBe(true);
    for (const k of ["invoice_overdue_reminder", "rent_due_reminder", "qualified_meeting_slots"]) {
      expect(AUTOMATION_TEMPLATES.find((t) => t.key === k)?.requiresApproval).toBe(true);
    }
  });
});
