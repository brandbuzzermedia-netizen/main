import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hashPassword, tokenBinding, verifyPassword, sha256, randomToken } from "@/lib/security/crypto";
import { isSameOrigin } from "@/lib/security/csrf";

describe("token encryption", () => {
  it("round-trips under the same client/account binding", () => {
    const b = tokenBinding("client-a", "acct-1");
    const enc = encryptSecret("EAAB-secret", b);
    expect(enc).not.toContain("EAAB");
    expect(decryptSecret(enc, b)).toBe("EAAB-secret");
  });

  it("refuses to decrypt under another client's binding", () => {
    const enc = encryptSecret("EAAB-secret", tokenBinding("client-a", "acct-1"));
    expect(() => decryptSecret(enc, tokenBinding("client-b", "acct-1"))).toThrow();
    expect(() => decryptSecret(enc, tokenBinding("client-a", "acct-2"))).toThrow();
  });

  it("detects tampering", () => {
    const b = tokenBinding("c", "a");
    const enc = encryptSecret("secret", b);
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), b)).toThrow();
  });
});

describe("passwords and tokens", () => {
  it("hashes and verifies with scrypt", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it("generates unguessable session tokens and stores only hashes", () => {
    const t = randomToken();
    expect(t.length).toBeGreaterThanOrEqual(43);
    expect(sha256(t)).toHaveLength(64);
    expect(randomToken()).not.toBe(t);
  });
});

describe("CSRF origin check", () => {
  const req = (h: Record<string, string>) => new Request("https://app.gbs.test/api/x", { method: "POST", headers: h });
  it("accepts same-origin requests", () => {
    expect(isSameOrigin(req({ host: "app.gbs.test", origin: "https://app.gbs.test" }))).toBe(true);
  });
  it("rejects cross-origin and origin-less requests", () => {
    expect(isSameOrigin(req({ host: "app.gbs.test", origin: "https://evil.test" }))).toBe(false);
    expect(isSameOrigin(req({ host: "app.gbs.test" }))).toBe(false);
  });
});
