import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import type { BusinessModel, Consolidation, Lifecycle, LogoKey, ModuleKey, OwnershipType } from "@/domain/registry";

/**
 * Workspace resolution for the group and company shells.
 *
 * Every query here runs as the signed-in user, so RLS decides what comes back. The
 * permission set loaded from the database drives what the UI offers; the database enforces
 * the same rules again on every read and write.
 */

export const COMPANY_COLUMNS =
  "id, name, slug, short_name, family_group_id, ownership_type, owner_label, consolidation, business_model, lifecycle_status, " +
  "enabled_modules, sidebar_color, accent_color, logo_key, is_demo, base_currency, timezone, fy_start_month, " +
  "emergency_stop, emergency_stop_at, emergency_stop_reason, require_mfa";

export type Company = {
  id: string;
  name: string;
  slug: string;
  short_name: string | null;
  family_group_id: string | null;
  ownership_type: OwnershipType;
  owner_label: string | null;
  consolidation: Consolidation;
  business_model: BusinessModel;
  lifecycle_status: Lifecycle;
  enabled_modules: ModuleKey[];
  sidebar_color: string | null;
  accent_color: string | null;
  logo_key: LogoKey | null;
  is_demo: boolean;
  base_currency: string;
  timezone: string;
  fy_start_month: number;
  emergency_stop: boolean;
  emergency_stop_at: string | null;
  emergency_stop_reason: string | null;
  require_mfa: boolean;
};

export type Permission =
  | "company.view" | "company.settings" | "company.emergency_stop" | "members.manage" | "members.grant_owner"
  | "dashboard.owner" | "finance.read" | "finance.write" | "crm.read_all" | "crm.read_assigned" | "crm.read_shared"
  | "crm.write" | "crm.manage" | "tasks.read_all" | "tasks.write" | "audit.read"
  | "finance.approve" | "finance.sensitive" | "rental.read" | "rental.write" | "documents.read" | "documents.write"
  | "automation.manage" | "automation.approve" | "operations.read" | "operations.write" | "compliance.verify";

export type GroupRole = "group_owner" | "family_owner" | "group_viewer";
export type GroupRef = { id: string; name: string; role: GroupRole; is_demo: boolean; fy_start_month: number; base_currency: string };
export type MembershipRef = { role: string; company: Company };

export const ROLE_LABELS: Record<string, string> = {
  owner: "Company owner", company_admin: "Company admin", finance: "Finance manager", viewer: "Finance viewer",
  account_manager: "Account manager", sales_manager: "Sales manager", sales_rep: "Sales rep / setter",
  operations_manager: "Operations manager", marketing_manager: "Marketing manager", staff: "Staff",
  accountant: "External accountant", partner: "External partner",
  group_owner: "Group owner", family_owner: "Family owner", group_viewer: "Group viewer",
};

/** The signed-in user's profile, company memberships and group memberships. */
export const getWorkspaceUser = cache(async () => {
  const { supabase, userId, email } = await getUser();
  const [profile, memberships, groups] = await Promise.all([
    supabase.from("users").select("full_name, email").eq("id", userId).maybeSingle(),
    supabase.from("memberships").select(`role, company:organizations(${COMPANY_COLUMNS})`).eq("user_id", userId).order("created_at"),
    supabase.from("group_memberships").select("role, group:family_groups(id, name, is_demo, fy_start_month, base_currency)").eq("user_id", userId).order("created_at"),
  ]);
  if (memberships.error) throw new Error(`Could not load memberships: ${memberships.error.message}`);
  if (groups.error) throw new Error(`Could not load group memberships: ${groups.error.message}`);
  // A company that requires two-step sign-in releases nothing sensitive until it is used (the
  // database enforces this); send the person to set it up or enter a code first.
  const { data: mfa } = await supabase.rpc("my_mfa_requirements");
  if (((mfa ?? []) as { satisfied: boolean }[]).some((r) => !r.satisfied)) redirect("/mfa");
  const name = (profile.data?.full_name as string | null) || email || "You";
  return {
    supabase,
    userId,
    email,
    displayName: name,
    initials: initialsOf(name),
    memberships: (memberships.data ?? []) as unknown as MembershipRef[],
    groups: ((groups.data ?? []) as unknown as { role: GroupRole; group: Omit<GroupRef, "role"> }[]).map((g) => ({ ...g.group, role: g.role })),
  };
});

export function initialsOf(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Where "/" should land: the Command Centre for group members, else the first company. */
export async function homePath(): Promise<string> {
  const u = await getWorkspaceUser();
  if (u.groups.length) return "/group";
  if (u.memberships.length) return `/c/${u.memberships[0].company.slug}`;
  return "/onboarding";
}

export type CompanyContext = Awaited<ReturnType<typeof getWorkspaceUser>> & {
  company: Company;
  role: string;
  permissions: Set<Permission>;
  can: (p: Permission) => boolean;
  group: GroupRef | null;
};

/**
 * Opens a company workspace by slug. Requires explicit company membership: being a group
 * member who can see the registry row is not enough to enter the workspace.
 */
export const getCompanyContext = cache(async (slug: string): Promise<CompanyContext> => {
  const u = await getWorkspaceUser();
  const m = u.memberships.find((x) => x.company.slug === slug);
  if (!m) notFound();
  const { data, error } = await u.supabase.rpc("my_permissions", { p_org: m.company.id });
  if (error) throw new Error(`Could not load permissions: ${error.message}`);
  const permissions = new Set((data ?? []) as Permission[]);
  if (!permissions.has("company.view")) notFound();
  return {
    ...u,
    company: m.company,
    role: m.role,
    permissions,
    can: (p) => permissions.has(p),
    group: u.groups.find((g) => g.id === m.company.family_group_id) ?? null,
  };
});

export type GroupContext = Awaited<ReturnType<typeof getWorkspaceUser>> & {
  group: GroupRef;
  /** Every company in the group registry the user can see (name, ownership, status). */
  registry: Company[];
  /** The user's own role and permissions per company, where they are a member. */
  access: Map<string, { role: string; permissions: Set<Permission> }>;
};

export const getGroupContext = cache(async (): Promise<GroupContext> => {
  const u = await getWorkspaceUser();
  const group = u.groups[0];
  if (!group) redirect(await homePath());
  const { data, error } = await u.supabase
    .from("organizations").select(COMPANY_COLUMNS).eq("family_group_id", group.id).order("created_at");
  if (error) throw new Error(`Could not load the company registry: ${error.message}`);
  const registry = (data ?? []) as unknown as Company[];
  const mine = u.memberships.filter((m) => m.company.family_group_id === group.id);
  const perms = await Promise.all(mine.map((m) => u.supabase.rpc("my_permissions", { p_org: m.company.id })));
  const access = new Map<string, { role: string; permissions: Set<Permission> }>();
  mine.forEach((m, i) => {
    if (perms[i].error) throw new Error(`Could not load permissions: ${perms[i].error!.message}`);
    access.set(m.company.id, { role: m.role, permissions: new Set((perms[i].data ?? []) as Permission[]) });
  });
  return { ...u, group, registry, access };
});
