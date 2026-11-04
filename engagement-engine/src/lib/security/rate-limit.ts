import type { Db } from "@/lib/db";

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Too many requests. Try again in ${retryAfterSeconds}s.`);
  }
}

/**
 * Fixed-window counter stored in Postgres so limits hold across app instances.
 * Must be called with the service connection (rate_limits is not visible to gbs_app).
 */
export async function hitRateLimit(
  system: Db,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000);
  const row = await system.one<{ count: number }>(
    `insert into rate_limits (key, window_start, count) values ($1, $2, 1)
     on conflict (key, window_start) do update set count = rate_limits.count + 1
     returning count`,
    [key, windowStart],
  );
  const count = row?.count ?? 1;
  const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowSeconds * 1000 - now) / 1000);
  if (Math.random() < 0.01) {
    await system.query("delete from rate_limits where window_start < now() - interval '1 day'");
  }
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds };
}

export async function enforceRateLimit(system: Db, key: string, limit: number, windowSeconds: number) {
  const r = await hitRateLimit(system, key, limit, windowSeconds);
  if (!r.allowed) throw new RateLimitError(r.retryAfterSeconds);
}
