/**
 * Origin check for mutating route handlers. (Server actions get the same check from Next.js.)
 * Returns true when the request's Origin (or Referer) matches the host it was sent to.
 */
export function isSameOrigin(req: Request): boolean {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!host || !origin) return false;
  try {
    const allowed = new Set([host, ...(process.env.APP_ALLOWED_ORIGINS?.split(",").filter(Boolean) ?? [])]);
    return allowed.has(new URL(origin).host);
  } catch {
    return false;
  }
}
