import { headers } from "next/headers";
import { z } from "zod";
import { requireClientAccess, requireUser, clientIp } from "@/lib/auth/session";
import type { ClientAccess, SessionUser } from "@/lib/auth/types";
import { withSystem, withUser, type Db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export interface ClientCtx {
  db: Db;
  user: SessionUser;
  access: ClientAccess;
  ip: string | null;
}

/** Runs fn in a user-scoped (RLS) transaction after checking the user can access the client. */
export async function inClient<T>(clientId: string, fn: (ctx: ClientCtx) => Promise<T>): Promise<T> {
  const { user, access } = await requireClientAccess(z.string().uuid().parse(clientId));
  const ip = clientIp(await headers());
  return withUser(user.id, (db) => fn({ db, user, access, ip }));
}

export async function asUser<T>(fn: (ctx: { db: Db; user: SessionUser; ip: string | null }) => Promise<T>): Promise<T> {
  const user = await requireUser();
  const ip = clientIp(await headers());
  return withUser(user.id, (db) => fn({ db, user, ip }));
}

export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  await withSystem((db) => enforceRateLimit(db, key, limit, windowSeconds));
}

/** "a, b\nc" → ["a","b","c"] (trimmed, de-duplicated, capped). */
export function parseList(v: FormDataEntryValue | null, max = 100): string[] {
  if (typeof v !== "string") return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v.split(/[\n,]/)) {
    const s = raw.trim().slice(0, 120);
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out.slice(0, max);
}

export const str = (v: FormDataEntryValue | null, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const optStr = (v: FormDataEntryValue | null, max = 2000) => str(v, max) || null;

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "WorkflowError";
  }
}
