import { cookies, headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { cache } from "react";
import { withSystem, withUser } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/security/crypto";
import type { ClientAccess, PlatformRole, SessionUser } from "./types";
import { isStaff, isSuperAdmin } from "./types";

export const SESSION_COOKIE = "gbs_session";
const SESSION_DAYS = 7;

export async function createSession(userId: string): Promise<void> {
  const token = randomToken(32);
  const h = await headers();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await withSystem(async (db) => {
    await db.query(
      `insert into sessions (user_id, token_hash, expires_at, ip, user_agent) values ($1, $2, $3, $4, $5)`,
      [userId, sha256(token), expires, clientIp(h), h.get("user-agent")?.slice(0, 300) ?? null],
    );
    await db.query("update users set last_login_at = now() where id = $1", [userId]);
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await withSystem((db) => db.query("delete from sessions where token_hash = $1", [sha256(token)]));
  }
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const row = await withSystem((db) =>
    db.one<{
      session_id: string;
      id: string;
      organization_id: string;
      email: string;
      full_name: string;
      platform_role: PlatformRole;
    }>(
      `select s.id as session_id, u.id, u.organization_id, u.email, u.full_name, u.platform_role
       from sessions s join users u on u.id = s.user_id
       where s.token_hash = $1 and s.expires_at > now() and u.status = 'active'`,
      [sha256(token)],
    ),
  );
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    fullName: row.full_name,
    platformRole: row.platform_role,
    sessionId: row.session_id,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isStaff(user)) notFound();
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isSuperAdmin(user)) notFound();
  return user;
}

/** Resolves the user's capabilities on a client using the same SQL helpers RLS uses. */
export const getClientAccess = cache(async (userId: string, clientId: string): Promise<ClientAccess | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return null;
  const row = await withUser(userId, (db) =>
    db.one<{
      access: boolean;
      gbs: boolean;
      role: "owner" | "member" | null;
      manage: boolean;
      edit: boolean;
      approve_client: boolean;
    }>(
      `select app.can_access_client($1) as access, app.is_gbs_manager($1) as gbs, app.client_role($1) as role,
              app.can_manage_client($1) as manage, app.can_edit_comments($1) as edit,
              app.can_approve_client($1) as approve_client`,
      [clientId],
    ),
  );
  if (!row?.access) return null;
  return {
    clientId,
    isGbsManager: row.gbs,
    clientRole: row.role,
    canManage: row.manage,
    canEditComments: row.edit,
    canApproveGbs: row.gbs,
    canApproveClient: row.approve_client,
  };
});

/** Use at the top of every /clients/[clientId] page and action. 404s (not 403s) so client names don't leak. */
export async function requireClientAccess(clientId: string): Promise<{ user: SessionUser; access: ClientAccess }> {
  const user = await requireUser();
  const access = await getClientAccess(user.id, clientId);
  if (!access) notFound();
  return { user, access };
}

export function clientIp(h: Headers): string | null {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}
