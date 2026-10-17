import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Organization, Role } from "@/lib/db-types";

export const ACTIVE_ORG_COOKIE = "gbs_org";

export type AppContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string | null;
  org: Organization;
  role: Role;
  canWrite: boolean;
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
 * Data access layer entry point for every page and server action.
 * Resolves the active organization from the user's memberships. RLS enforces the same
 * rules in the database, so this is a convenience check, not the only one.
 */
export const getContext = cache(async (): Promise<AppContext> => {
  const { supabase, userId, email } = await getUser();
  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("role, organization:organizations(id, name, is_demo, timezone, base_currency)")
    .eq("user_id", userId)
    .order("created_at");
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
    canWrite: active.role === "owner" || active.role === "finance",
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

export async function requireWriter(): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx.canWrite) throw new Error("Your role cannot change finance records.");
  return ctx;
}
