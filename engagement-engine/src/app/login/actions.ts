"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withSystem } from "@/lib/db";
import { createSession, clientIp } from "@/lib/auth/session";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/security/crypto";
import { hitRateLimit } from "@/lib/security/rate-limit";
import type { ActionResult } from "@/lib/action-result";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
  next: z.string().max(300).optional(),
});

export async function login(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = LoginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter your email and password." };
  const { email, password, next } = parsed.data;
  const ip = clientIp(await headers()) ?? "unknown";

  const user = await withSystem(async (db) => {
    const byIp = await hitRateLimit(db, `login:ip:${ip}`, 30, 900);
    const byEmail = await hitRateLimit(db, `login:email:${email}`, 8, 900);
    if (!byIp.allowed || !byEmail.allowed) return "limited" as const;
    return db.one<{ id: string; password_hash: string; status: string }>(
      "select id, password_hash, status from users where lower(email) = $1",
      [email],
    );
  });
  if (user === "limited") return { ok: false, message: "Too many sign-in attempts. Try again in 15 minutes.", data: { email } };

  const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!user || !valid || user.status !== "active") return { ok: false, message: "Email or password is incorrect.", data: { email } };

  await createSession(user.id);
  const safeNext = next && /^\/(?![\/\\])/.test(next) && !/[\r\n]/.test(next) ? next : "/";
  redirect(safeNext);
}
