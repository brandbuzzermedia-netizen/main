import { describe, expect, it } from "vitest";
import { isOptIn, isOptOut, waLink } from "@/lib/whatsapp-optin";

describe("WhatsApp opt-in", () => {
  it("builds a wa.me link with the START message", () => {
    expect(waLink("+91 98000 00001", "GBS")).toBe("https://wa.me/919800000001?text=START%20-%20please%20send%20me%20updates%20from%20GBS%20on%20WhatsApp");
  });
  it("recognises START and STOP replies", () => {
    expect(isOptIn("START - please send me updates")).toBe(true);
    expect(isOptIn("can you start tomorrow")).toBe(false);
    for (const t of ["STOP", " stop please", "Unsubscribe", "band karo"]) expect(isOptOut(t)).toBe(true);
    expect(isOptOut("don't stop")).toBe(false);
  });
});
