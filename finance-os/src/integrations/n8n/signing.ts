import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Request signing between the OS and n8n, both directions.
 * Signature = hex HMAC-SHA256(secret, `${timestamp}.${nonce}.${body}`), sent as
 *   x-dp-timestamp (unix seconds), x-dp-nonce (random, single use), x-dp-signature.
 * Requests older than the tolerance, or reusing a nonce, are rejected.
 */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function sign(secret: string, timestamp: number, nonce: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex");
}

export type VerifyResult = { ok: true } | { ok: false; reason: "missing_headers" | "stale" | "bad_signature" };

export function verify(secret: string, headers: { timestamp: string | null; nonce: string | null; signature: string | null }, body: string, nowSeconds = Math.floor(Date.now() / 1000)): VerifyResult {
  const { timestamp, nonce, signature } = headers;
  if (!secret || !timestamp || !nonce || !signature || !/^\d{9,11}$/.test(timestamp) || nonce.length < 16 || nonce.length > 128) {
    return { ok: false, reason: "missing_headers" };
  }
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: "stale" };
  const expected = Buffer.from(sign(secret, Number(timestamp), nonce, body), "hex");
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}
