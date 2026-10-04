"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireSuperAdmin } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { ForbiddenError, inClient, optStr, str } from "@/lib/server-action";
import { hashPassword } from "@/lib/security/crypto";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "client";

export async function createClient(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const user = await requireSuperAdmin();
    const name = z.string().min(2).max(120).parse(str(fd.get("name")));
    const industry = optStr(fd.get("industry"), 120);
    const amId = optStr(fd.get("account_manager_id"), 40);
    id = await withUser(user.id, async (db) => {
      const row = await db.one<{ id: string }>(
        `insert into clients (organization_id, name, slug, industry, created_by) values ($1, $2, $3, $4, $5) returning id`,
        [user.organizationId, name, `${slugify(name)}-${Date.now().toString(36).slice(-4)}`, industry, user.id],
      );
      await db.query(`insert into brand_profiles (organization_id, client_id, company_name, industry) values ($1, $2, $3, $4)`, [
        user.organizationId,
        row!.id,
        name,
        industry,
      ]);
      await db.query(`insert into usage_limits (organization_id, client_id, platform) values ($1, $2, 'all')`, [user.organizationId, row!.id]);
      if (amId) {
        await db.query(`insert into account_managers (organization_id, client_id, user_id, is_primary) values ($1, $2, $3, true)`, [
          user.organizationId,
          row!.id,
          z.string().uuid().parse(amId),
        ]);
      }
      await audit(db, {
        organizationId: user.organizationId,
        clientId: row!.id,
        actorId: user.id,
        actorName: user.fullName,
        action: "client.created",
        entityType: "client",
        entityId: row!.id,
        details: { name },
      });
      return row!.id;
    });
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/clients/${id}/onboarding`);
}

export async function setClientStatus(clientId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const status = z.enum(["active", "paused", "archived"]).parse(fd.get("status"));
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.isGbsManager) throw new ForbiddenError();
      if (status === "archived" && user.platformRole !== "super_admin") throw new ForbiddenError("Only super admins can archive clients.");
      await db.query(`update clients set status = $2, archived_at = case when $2 = 'archived' then now() else null end where id = $1`, [clientId, status]);
      if (status !== "active") await db.query(`update campaigns set status = 'paused' where client_id = $1 and status = 'active'`, [clientId]);
      await audit(db, {
        organizationId: user.organizationId,
        clientId,
        actorId: user.id,
        actorName: user.fullName,
        action: status === "archived" ? "client.archived" : status === "active" ? "client.restored" : "client.updated",
        entityType: "client",
        entityId: clientId,
        details: { status },
      });
    });
    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`, "layout");
    return { ok: true, message: `Client ${status === "archived" ? "archived" : status === "active" ? "activated" : "paused"}.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteClient(clientId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireSuperAdmin();
    await inClient(clientId, async ({ db }) => {
      const c = await db.one<{ name: string; status: string }>("select name, status from clients where id = $1", [clientId]);
      if (!c) throw new ForbiddenError("Client not found.");
      if (c.status !== "archived") throw new ForbiddenError("Archive the client before deleting it.");
      if (str(fd.get("confirm_name")) !== c.name) throw new ForbiddenError("Type the client's name exactly to confirm deletion.");
      await audit(db, {
        organizationId: user.organizationId,
        clientId,
        actorId: user.id,
        actorName: user.fullName,
        action: "client.deleted",
        entityType: "client",
        entityId: clientId,
        details: { name: c.name },
      });
      await db.query("delete from clients where id = $1", [clientId]);
    });
  } catch (e) {
    return toActionError(e);
  }
  redirect("/clients");
}

export async function saveClientSettings(clientId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const mode = z.enum(["manual", "gbs", "dual"]).parse(fd.get("approval_mode"));
    const publishOnApproval = fd.get("publish_on_approval") === "on";
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.isGbsManager) throw new ForbiddenError("Only GBS can change approval settings.");
      await db.query(`update clients set approval_mode = $2, publish_on_approval = $3, name = coalesce(nullif($4, ''), name), industry = $5 where id = $1`, [
        clientId,
        mode,
        publishOnApproval,
        str(fd.get("name"), 120),
        optStr(fd.get("industry"), 120),
      ]);
      await audit(db, {
        organizationId: user.organizationId,
        clientId,
        actorId: user.id,
        actorName: user.fullName,
        action: "settings.updated",
        entityType: "client",
        entityId: clientId,
        details: { approval_mode: mode, publish_on_approval: publishOnApproval },
      });
    });
    revalidatePath(`/clients/${clientId}`, "layout");
    return { ok: true, message: "Settings saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveLimits(clientId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const platform = z.enum(["all", "instagram", "facebook", "linkedin", "youtube"]).parse(fd.get("platform"));
    const n = (k: string, max: number) => z.coerce.number().int().min(0).max(max).parse(fd.get(k));
    const vals = [n("daily_opportunity_limit", 500), n("daily_publish_limit", 100), n("min_minutes_between_comments", 1440), n("monthly_ai_generation_limit", 100000)];
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.isGbsManager) throw new ForbiddenError("Limits are managed by GBS.");
      await db.query(
        `insert into usage_limits (organization_id, client_id, platform, daily_opportunity_limit, daily_publish_limit, min_minutes_between_comments, monthly_ai_generation_limit)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (client_id, platform) do update set daily_opportunity_limit = excluded.daily_opportunity_limit,
           daily_publish_limit = excluded.daily_publish_limit, min_minutes_between_comments = excluded.min_minutes_between_comments,
           monthly_ai_generation_limit = excluded.monthly_ai_generation_limit, updated_at = now()`,
        [user.organizationId, clientId, platform, ...vals],
      );
      await audit(db, {
        organizationId: user.organizationId,
        clientId,
        actorId: user.id,
        actorName: user.fullName,
        action: "limits.updated",
        entityType: "client",
        entityId: clientId,
        details: { platform, values: vals },
      });
    });
    revalidatePath(`/clients/${clientId}/settings`);
    return { ok: true, message: `Limits saved for ${platform === "all" ? "all platforms" : platform}.` };
  } catch (e) {
    return toActionError(e);
  }
}

/** Adds a client portal user (creating the login if needed). */
export async function addClientUser(clientId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const email = z.string().trim().toLowerCase().email().parse(fd.get("email"));
    const name = z.string().trim().min(1).max(120).parse(fd.get("full_name"));
    const role = z.enum(["owner", "member"]).parse(fd.get("role"));
    const canApprove = role === "owner" || fd.get("can_approve") === "on";
    const canEdit = role === "owner" || fd.get("can_edit") === "on";
    const password = str(fd.get("password"), 200);
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.isGbsManager) throw new ForbiddenError("Client users are managed by GBS.");
      const existing = await db.one<{ id: string; platform_role: string }>("select id, platform_role from users where lower(email) = $1", [email]);
      let userId = existing?.id;
      if (existing && existing.platform_role !== "client_user") throw new ForbiddenError("That email belongs to a GBS team member.");
      if (!userId) {
        if (user.platformRole !== "super_admin") throw new ForbiddenError("Only super admins can create new logins. Ask an admin to add this person.");
        if (password.length < 10) throw new ForbiddenError("Set an initial password of at least 10 characters.");
        userId = (await db.one<{ id: string }>(
          `insert into users (organization_id, email, full_name, password_hash, platform_role) values ($1, $2, $3, $4, 'client_user') returning id`,
          [user.organizationId, email, name, await hashPassword(password)],
        ))!.id;
      }
      await db.query(
        `insert into client_users (organization_id, client_id, user_id, role, can_approve, can_edit) values ($1, $2, $3, $4, $5, $6)
         on conflict (client_id, user_id) do update set role = excluded.role, can_approve = excluded.can_approve, can_edit = excluded.can_edit`,
        [user.organizationId, clientId, userId, role, canApprove, canEdit],
      );
      await audit(db, {
        organizationId: user.organizationId,
        clientId,
        actorId: user.id,
        actorName: user.fullName,
        action: "user.created",
        entityType: "user",
        entityId: userId,
        details: { email, role, can_approve: canApprove },
      });
    });
    revalidatePath(`/clients/${clientId}`, "layout");
    return { ok: true, message: `${name} can now sign in to this client's portal.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateClientUser(clientId: string, userId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const op = z.enum(["save", "remove"]).parse(fd.get("op"));
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.isGbsManager) throw new ForbiddenError();
      if (op === "remove") {
        await db.query("delete from client_users where client_id = $1 and user_id = $2", [clientId, userId]);
      } else {
        const role = z.enum(["owner", "member"]).parse(fd.get("role"));
        await db.query(`update client_users set role = $3, can_approve = $4, can_edit = $5, receives_approval_requests = $6 where client_id = $1 and user_id = $2`, [
          clientId,
          userId,
          role,
          role === "owner" || fd.get("can_approve") === "on",
          role === "owner" || fd.get("can_edit") === "on",
          fd.get("receives_approval_requests") === "on",
        ]);
      }
      await audit(db, {
        organizationId: user.organizationId,
        clientId,
        actorId: user.id,
        actorName: user.fullName,
        action: "user.updated",
        entityType: "user",
        entityId: userId,
        details: { op },
      });
    });
    revalidatePath(`/clients/${clientId}/settings`);
    return { ok: true, message: op === "remove" ? "Removed from client." : "Permissions saved." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function assignAccountManager(clientId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const amId = z.string().uuid().parse(fd.get("user_id"));
    const op = z.enum(["add", "remove"]).parse(fd.get("op"));
    await requireSuperAdmin();
    await inClient(clientId, async ({ db, user }) => {
      if (op === "add") {
        await db.query(
          `insert into account_managers (organization_id, client_id, user_id, is_primary)
           values ($1, $2, $3, not exists (select 1 from account_managers where client_id = $2)) on conflict do nothing`,
          [user.organizationId, clientId, amId],
        );
      } else {
        await db.query("delete from account_managers where client_id = $1 and user_id = $2", [clientId, amId]);
      }
      await audit(db, {
        organizationId: user.organizationId,
        clientId,
        actorId: user.id,
        actorName: user.fullName,
        action: "settings.updated",
        entityType: "client",
        entityId: clientId,
        details: { account_manager: amId, op },
      });
    });
    revalidatePath(`/clients/${clientId}`, "layout");
    revalidatePath("/team");
    return { ok: true, message: op === "add" ? "Account manager assigned." : "Account manager removed." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setOnboardingStep(clientId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  let next = 1;
  try {
    const step = z.coerce.number().int().min(1).max(12).parse(fd.get("step"));
    const dir = z.enum(["next", "back", "skip"]).parse(fd.get("dir"));
    await inClient(clientId, async ({ db, access }) => {
      if (!access.canManage) throw new ForbiddenError();
      next = dir === "back" ? Math.max(1, step - 1) : Math.min(12, step + 1);
      await db.query(
        `update clients set onboarding_step = $2,
           onboarding_completed_steps = case when $3 and not ($4 = any(onboarding_completed_steps)) then array_append(onboarding_completed_steps, $4) else onboarding_completed_steps end
         where id = $1`,
        [clientId, next, dir === "next", step],
      );
      if (step === 12 && dir === "next") {
        await db.query(`update clients set status = 'active' where id = $1 and status = 'onboarding' and app.is_gbs_manager($1)`, [clientId]);
      }
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/clients/${clientId}`, "layout");
  redirect(`/clients/${clientId}/onboarding?step=${next}`);
}
