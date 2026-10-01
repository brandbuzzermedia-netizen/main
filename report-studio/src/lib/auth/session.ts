// Studio sign-in without an external service: one shared studio password
// (STUDIO_PASSWORD) and an HMAC-signed session cookie (SESSION_SECRET).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "gbs_session";
const MAX_AGE_S = 60 * 60 * 24 * 14;

export interface Session {
  name: string;
  /** True when no STUDIO_PASSWORD is set (development only). */
  open: boolean;
}

const g = globalThis as unknown as { __gbsDevSecret?: string };

function secret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("Set SESSION_SECRET to sign studio sessions.");
  // Development: a per-process secret; sessions end when the server restarts.
  return (g.__gbsDevSecret ??= randomBytes(32).toString("hex"));
}

/** Sign-in is open (any password) only in development with no password configured. */
export const signInOpen = () => !process.env.STUDIO_PASSWORD && process.env.NODE_ENV !== "production";
export const signInConfigured = () => !!process.env.STUDIO_PASSWORD || signInOpen();

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function checkPassword(password: string): boolean {
  const expected = process.env.STUDIO_PASSWORD;
  if (!expected) return signInOpen();
  return same(password, expected);
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function createSessionToken(name: string): { value: string; maxAge: number } {
  const payload = Buffer.from(JSON.stringify({ n: name, e: Math.floor(Date.now() / 1000) + MAX_AGE_S })).toString("base64url");
  return { value: `${payload}.${sign(payload)}`, maxAge: MAX_AGE_S };
}

export function readSessionToken(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac || !same(mac, sign(payload))) return null;
  try {
    const { n, e } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof e !== "number" || e < Date.now() / 1000) return null;
    return { name: typeof n === "string" && n ? n : "GBS team", open: signInOpen() };
  } catch {
    return null;
  }
}
