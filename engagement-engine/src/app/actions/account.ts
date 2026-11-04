"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth/session";
import { withSystem, withUser } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/security/crypto";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { str } from "@/lib/server-action";

/** Users update only their own profile; done on the service connection, keyed by the session's user id. */
export async function saveProfile(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const name = z.string().trim().min(1, "Name is required").max(120).parse(str(fd.get("full_name"), 120));
    const emails = fd.get("email_notifications") === "on";
    await withSystem((db) => db.query("update users set full_name = $2, email_notifications = $3 where id = $1", [user.id, name, emails]));
    revalidatePath("/", "layout");
    return { ok: true, message: "Profile saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function changePassword(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const current = z.string().min(1, "Enter your current password").parse(fd.get("current_password"));
    const next = z.string().min(10, "New password must be at least 10 characters").max(200).parse(fd.get("new_password"));
    if (next !== fd.get("confirm_password")) return { ok: false, message: "The new passwords don't match." };
    if (next === current) return { ok: false, message: "Choose a password you haven't used here." };
    const ok = await withSystem(async (db) => {
      await enforceRateLimit(db, `password:${user.id}`, 5, 900);
      const row = await db.one<{ password_hash: string }>("select password_hash from users where id = $1", [user.id]);
      return row ? verifyPassword(current, row.password_hash) : false;
    });
    if (!ok) return { ok: false, message: "Your current password is incorrect." };
    const hash = await hashPassword(next);
    await withSystem(async (db) => {
      await db.query("update users set password_hash = $2 where id = $1", [user.id, hash]);
      // Sign out every other session; keep this one.
      await db.query("delete from sessions where user_id = $1 and id <> $2", [user.id, user.sessionId]);
    });
    await withUser(user.id, (db) =>
      audit(db, { organizationId: user.organizationId, actorId: user.id, actorName: user.fullName, action: "user.updated", entityType: "user", entityId: user.id, details: { password_changed: true } }),
    );
    return { ok: true, message: "Password changed. Other devices have been signed out." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function signOutOtherSessions(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const r = await withSystem((db) => db.query("delete from sessions where user_id = $1 and id <> $2 returning id", [user.id, user.sessionId]));
    revalidatePath("/account");
    return { ok: true, message: r.length ? `Signed out ${r.length} other session${r.length === 1 ? "" : "s"}.` : "No other sessions." };
  } catch (e) {
    return toActionError(e);
  }
}
