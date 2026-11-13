"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser, setActiveOrg } from "@/lib/auth";
import { getGroupContext } from "@/lib/workspace";
import { isDevelopment } from "@/lib/env";
import { seedDemoGroup } from "@/lib/demo";
import {
  BUSINESS_MODELS, COMPANY_TEMPLATES, CONSOLIDATION, LIFECYCLE, MODULE_KEYS, OWNERSHIP_TYPES, isValidSlug, type CompanyTemplate,
} from "@/domain/registry";

export type GroupFormState = { error?: string; ok?: string; fields?: Record<string, string[] | undefined> };

async function requireGroupOwner() {
  const g = await getGroupContext();
  if (g.group.role !== "group_owner") throw new Error("Only a group owner can change the business registry.");
  return g;
}

function templatePayload(t: CompanyTemplate, overrides: Partial<CompanyTemplate> = {}) {
  const x = { ...t, ...overrides };
  return {
    name: x.name, slug: x.slug, short_name: x.short_name, ownership_type: x.ownership_type, owner_label: x.owner_label,
    consolidation: x.consolidation, business_model: x.business_model, lifecycle_status: x.lifecycle_status,
    enabled_modules: x.enabled_modules, sidebar_color: x.sidebar_color, accent_color: x.accent_color, logo_key: x.logo_key, stages: x.stages,
  };
}

export async function createGroupAction(_prev: GroupFormState, fd: FormData): Promise<GroupFormState> {
  const { supabase } = await getUser();
  const name = z.string().trim().min(2, "Enter the group's name").max(120).safeParse(fd.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const { error } = await supabase.rpc("create_family_group", { p_name: name.data });
  if (error) return { error: error.message };
  redirect("/group/settings");
}

export async function createFromTemplatesAction(_prev: GroupFormState, fd: FormData): Promise<GroupFormState> {
  const g = await requireGroupOwner();
  const chosen = new Set(fd.getAll("template").map(String));
  const existing = new Set(g.registry.map((c) => c.slug));
  const todo = COMPANY_TEMPLATES.filter((t) => chosen.has(t.slug) && !existing.has(t.slug));
  if (todo.length === 0) return { error: "Choose at least one business that is not set up yet." };
  const failed: string[] = [];
  for (const t of todo) {
    const { error } = await g.supabase.rpc("create_company", { p_group: g.group.id, p_company: templatePayload(t) });
    if (error) failed.push(`${t.name}: ${error.message.includes("organizations_slug_key") ? `the address "${t.slug}" is taken` : error.message}`);
  }
  revalidatePath("/", "layout");
  return failed.length
    ? { error: `Created ${todo.length - failed.length} of ${todo.length}. ${failed.join("; ")}` }
    : { ok: `Created ${todo.length} workspace${todo.length === 1 ? "" : "s"}. You are the owner of each; add people from each company's Team page.` };
}

const customSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  slug: z.string().trim().toLowerCase().refine(isValidSlug, "Lowercase letters, numbers and dashes (2–48)"),
  ownership_type: z.enum(Object.keys(OWNERSHIP_TYPES) as [keyof typeof OWNERSHIP_TYPES]),
  consolidation: z.enum(Object.keys(CONSOLIDATION) as [keyof typeof CONSOLIDATION]),
  business_model: z.enum(Object.keys(BUSINESS_MODELS) as [keyof typeof BUSINESS_MODELS]),
  lifecycle_status: z.enum(Object.keys(LIFECYCLE) as [keyof typeof LIFECYCLE]),
  owner_label: z.string().trim().max(120).optional(),
});

export async function addCompanyAction(_prev: GroupFormState, fd: FormData): Promise<GroupFormState> {
  const g = await requireGroupOwner();
  const parsed = customSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { fields: z.flattenError(parsed.error).fieldErrors };
  const modules = fd.getAll("modules").map(String).filter((m) => (MODULE_KEYS as string[]).includes(m));
  const { error } = await g.supabase.rpc("create_company", {
    p_group: g.group.id,
    p_company: {
      ...parsed.data,
      enabled_modules: Array.from(new Set(["home", "team", "settings", ...modules])),
      stages: [
        { name: "Lead", kind: "open", probability_pct: 0 }, { name: "Qualified", kind: "open", probability_pct: 0 },
        { name: "Proposal", kind: "proposal", probability_pct: 0 }, { name: "Won", kind: "won", probability_pct: 100 }, { name: "Lost", kind: "lost", probability_pct: 0 },
      ],
    },
  });
  if (error) return { error: error.message.includes("organizations_slug_key") ? "That address is already taken. Choose another." : error.message };
  revalidatePath("/", "layout");
  return { ok: `${parsed.data.name} added. You are its owner.` };
}

/** Brings a pre-group workspace (the original GBS Finance OS) into the group, keeping its data. */
export async function attachLegacyAction(_prev: GroupFormState, fd: FormData): Promise<GroupFormState> {
  const g = await requireGroupOwner();
  const orgId = z.uuid().safeParse(fd.get("org_id"));
  const t = COMPANY_TEMPLATES.find((x) => x.slug === fd.get("template"));
  if (!orgId.success || !t) return { error: "Choose the workspace and what it is." };
  const slugFree = !g.registry.some((c) => c.slug === t.slug);
  const { error } = await g.supabase.rpc("attach_company_to_group", {
    p_org: orgId.data, p_group: g.group.id,
    p_registry: { ...templatePayload(t), slug: slugFree ? t.slug : undefined },
  });
  if (error) return { error: error.message.includes("organizations_slug_key") ? `The address "${t.slug}" is taken elsewhere; attach again after renaming.` : error.message };
  // A pre-group workspace has no pipeline yet: give it the template's stages.
  const { count } = await g.supabase.from("pipeline_stages").select("id", { count: "exact", head: true }).eq("organization_id", orgId.data);
  if (!count) {
    const { error: stageError } = await g.supabase.from("pipeline_stages")
      .insert(t.stages.map((s, i) => ({ ...s, position: i, organization_id: orgId.data })));
    if (stageError) return { error: `Attached, but stages could not be created: ${stageError.message}` };
  }
  const { error: renameError } = await g.supabase.from("organizations").update({ enabled_modules: t.enabled_modules, name: t.name }).eq("id", orgId.data);
  revalidatePath("/", "layout");
  if (renameError) return { error: `Attached, but the name and modules were not updated: ${renameError.message}` };
  return { ok: `Attached as ${t.name}. Its existing finance records are unchanged.` };
}

export async function setRegistryAction(fd: FormData) {
  const g = await requireGroupOwner();
  const parsed = z.object({
    org_id: z.uuid(),
    ownership_type: z.enum(Object.keys(OWNERSHIP_TYPES) as [keyof typeof OWNERSHIP_TYPES]),
    consolidation: z.enum(Object.keys(CONSOLIDATION) as [keyof typeof CONSOLIDATION]),
    owner_label: z.string().trim().max(120).optional(),
  }).parse(Object.fromEntries(fd.entries()));
  const { error } = await g.supabase.rpc("set_company_registry", {
    p_org: parsed.org_id, p_ownership_type: parsed.ownership_type, p_consolidation: parsed.consolidation, p_owner_label: parsed.owner_label ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function addGroupMemberAction(_prev: GroupFormState, fd: FormData): Promise<GroupFormState> {
  const g = await requireGroupOwner();
  const parsed = z.object({ email: z.email("Enter an email address"), role: z.enum(["group_owner", "family_owner", "group_viewer"]) })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { fields: z.flattenError(parsed.error).fieldErrors };
  const { error } = await g.supabase.rpc("add_group_member_by_email", { p_group: g.group.id, p_email: parsed.data.email, p_role: parsed.data.role });
  if (error) return { error: error.message.includes("group_memberships_family_group_id_user_id_key") ? "That person already has group access." : error.message };
  revalidatePath("/group/people");
  return { ok: `${parsed.data.email} added. Group access shows the registry; company figures still need company membership.` };
}

export async function createDemoGroupAction(): Promise<GroupFormState> {
  if (!isDevelopment) return { error: "Demo data can only be created in development." };
  const { supabase } = await getUser();
  const { data: groupId, error } = await supabase.rpc("create_family_group", { p_name: "[DEMO] Diwani Parivaar", p_is_demo: true });
  if (error) return { error: error.message };
  const firstOrg = await seedDemoGroup(supabase, groupId as string, (t) => templatePayload(t, { name: `[DEMO] ${t.name}`, slug: `demo-${t.slug}` }));
  if (firstOrg) await setActiveOrg(firstOrg);
  redirect("/group");
}

const GROUP_TOGGLES = ["pipeline", "meetings", "automation", "finance", "rental", "expenses", "tax", "team", "reports", "vault"] as const;

/** Shows or hides a Command Centre module. Hiding changes navigation only; no data is removed. */
export async function toggleGroupModuleAction(fd: FormData) {
  const g = await requireGroupOwner();
  const key = z.enum(GROUP_TOGGLES).parse(fd.get("module"));
  const on = fd.get("on") === "true";
  const { data, error: readError } = await g.supabase.from("family_groups").select("disabled_modules").eq("id", g.group.id).single();
  if (readError) throw new Error(readError.message);
  const cur = (data.disabled_modules as string[]) ?? [];
  const next = on ? cur.filter((k) => k !== key) : Array.from(new Set([...cur, key]));
  const { error } = await g.supabase.from("family_groups").update({ disabled_modules: next }).eq("id", g.group.id);
  if (error) throw new Error(error.message);
  revalidatePath("/group", "layout");
}
