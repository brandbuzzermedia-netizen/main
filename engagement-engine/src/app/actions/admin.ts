"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { requireSuperAdmin } from "@/lib/auth/session";
import { withSystem, withUser } from "@/lib/db";
import { hashPassword } from "@/lib/security/crypto";
import { str } from "@/lib/server-action";

export async function createStaffUser(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const admin = await requireSuperAdmin();
    const v = {
      email: z.string().trim().toLowerCase().email().parse(fd.get("email")),
      name: z.string().trim().min(1).max(120).parse(fd.get("full_name")),
      role: z.enum(["super_admin", "account_manager"]).parse(fd.get("role")),
      password: z.string().min(10, "Initial password must be at least 10 characters").max(200).parse(fd.get("password")),
    };
    const hash = await hashPassword(v.password);
    await withUser(admin.id, async (db) => {
      const row = await db.one<{ id: string }>(
        `insert into users (organization_id, email, full_name, password_hash, platform_role) values ($1, $2, $3, $4, $5) returning id`,
        [admin.organizationId, v.email, v.name, hash, v.role],
      );
      await audit(db, { organizationId: admin.organizationId, actorId: admin.id, actorName: admin.fullName, action: "user.created", entityType: "user", entityId: row!.id, details: { email: v.email, role: v.role } });
    });
    revalidatePath("/team");
    return { ok: true, message: `${v.name} added. Share the initial password securely.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setUserStatus(userId: string, status: "active" | "disabled"): Promise<ActionResult> {
  try {
    const admin = await requireSuperAdmin();
    if (userId === admin.id) return { ok: false, message: "You can't disable yourself." };
    await withUser(admin.id, async (db) => {
      await db.query("update users set status = $2 where id = $1", [z.string().uuid().parse(userId), status]);
      await audit(db, { organizationId: admin.organizationId, actorId: admin.id, actorName: admin.fullName, action: "user.updated", entityType: "user", entityId: userId, details: { status } });
    });
    if (status === "disabled") await withSystem((db) => db.query("delete from sessions where user_id = $1", [userId]));
    revalidatePath("/team");
    return { ok: true, message: status === "disabled" ? "User disabled and signed out." : "User re-enabled." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveOrgSettings(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const admin = await requireSuperAdmin();
    const color = str(fd.get("primary_color"), 7);
    const logo = str(fd.get("logo_url"), 300);
    const branding = {
      brand_name: z.string().min(1).max(80).parse(str(fd.get("brand_name"), 80)),
      logo_url: logo ? z.string().url().parse(logo) : null,
      primary_color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#196144",
      email_sender: str(fd.get("email_sender"), 200) ? z.string().email().parse(str(fd.get("email_sender"), 200)) : null,
      custom_domain: str(fd.get("custom_domain"), 200) || null,
    };
    const ai = {
      model: z.enum(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"]).parse(fd.get("model")),
      effort: z.enum(["low", "medium", "high"]).parse(fd.get("effort")),
    };
    await withUser(admin.id, async (db) => {
      await db.query("update organizations set branding = $2, ai_settings = $3 where id = $1", [admin.organizationId, JSON.stringify(branding), JSON.stringify(ai)]);
      await audit(db, { organizationId: admin.organizationId, actorId: admin.id, actorName: admin.fullName, action: "settings.updated", entityType: "organization", entityId: admin.organizationId, details: { branding, ai } });
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved." };
  } catch (e) {
    return toActionError(e);
  }
}
