import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Organization } from "@/lib/db-types";
import type { Role } from "@/domain/labels";
import { permissionsFor, type Permissions } from "@/lib/permissions";

export const ACTIVE_ORG_COOKIE = "acq_org";

export type AppContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string | null;
  org: Organization;
  role: Role;
  can: Permissions;
  isPlatformAdmin: boolean;
  organizations: { id: string; name: string; role: Role }[];
};

/** The signed-in user. Redirects to /login if there is no valid session. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) redirect("/login");
  return { supabase, userId: sub, email: (data.claims.email as string | undefined) ?? null };
});

/**
 * Data access entry point for every page and server action. Resolves the active organization
 * from the user's memberships. RLS enforces the same rules in the database, so this is a
 * convenience check, not the only one.
 */
export const getContext = cache(async (): Promise<AppContext> => {
  const { supabase, userId, email } = await getUser();
  const [{ data: memberships, error }, { data: admin }] = await Promise.all([
    supabase
      .from("memberships")
      .select("role, organization:organizations(id, name, primary_market, timezone, default_currency, status, is_demo)")
      .eq("user_id", userId)
      .order("created_at"),
    supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (error) throw new Error(`Could not load memberships: ${error.message}`);
  const rows = (memberships ?? []) as unknown as { role: Role; organization: Organization }[];
  if (rows.length === 0) redirect("/onboarding");

  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const active = rows.find((m) => m.organization.id === preferred) ?? rows[0];
  return {
    supabase,
    userId,
    email,
    org: active.organization,
    role: active.role,
    can: permissionsFor(active.role),
    isPlatformAdmin: Boolean(admin),
    organizations: rows.map((m) => ({ id: m.organization.id, name: m.organization.name, role: m.role })),
  };
});

export async function setActiveOrg(orgId: string) {
  (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

/** Throws unless the active role has the permission. Use at the top of server actions. */
export async function requirePermission(permission: keyof Permissions): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx.can[permission]) throw new Error("Your role does not allow this action.");
  if (ctx.org.status !== "active") throw new Error("This organization is suspended. Contact support.");
  return ctx;
}
