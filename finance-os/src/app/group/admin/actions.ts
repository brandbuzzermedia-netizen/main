"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getGroupContext } from "@/lib/workspace";

const ROLES = ["owner", "company_admin", "finance", "viewer", "sales_manager", "sales_rep", "account_manager", "operations_manager", "marketing_manager", "staff", "accountant", "partner"] as const;

async function superAdmin() {
  const g = await getGroupContext();
  if (g.group.role !== "group_owner") throw new Error("Only the super admin (group owner) can do this.");
  return g;
}

/** One cell of the access table: give access, change the role, or remove access, in one company. */
export async function setAccessAction(input: { orgId: string; membershipId?: string | null; email: string; role: string }) {
  const g = await superAdmin();
  const orgId = z.uuid().parse(input.orgId);
  if (!g.registry.some((c) => c.id === orgId)) return { error: "Not a company in this group." };
  const role = input.role === "" ? "" : z.enum(ROLES).parse(input.role);
  let error: { message: string } | null = null;
  if (input.membershipId) {
    const id = z.uuid().parse(input.membershipId);
    error = role === ""
      ? (await g.supabase.rpc("deactivate_member", { p_membership: id, p_reason: "Access removed by the super admin" })).error
      : (await g.supabase.from("memberships").update({ role }).eq("id", id).eq("organization_id", orgId)).error;
  } else if (role) {
    error = (await g.supabase.rpc("invite_member", { p_org: orgId, p_email: z.email().parse(input.email), p_role: role })).error;
  }
  revalidatePath("/group/admin");
  return error ? { error: error.message } : { ok: true };
}

/** Invite one person to several companies at once, with the same role. */
export async function bulkInviteAction(fd: FormData) {
  const g = await superAdmin();
  const email = z.email().safeParse(String(fd.get("email") ?? "").trim().toLowerCase());
  const role = z.enum(ROLES).safeParse(fd.get("role"));
  const orgs = fd.getAll("org").map(String).filter((x) => g.registry.some((c) => c.id === x));
  const back = (m: string) => redirect(`/group/admin?note=${encodeURIComponent(m)}`);
  if (!email.success || !role.success || !orgs.length) back("Enter an email, a role and at least one company.");
  const failed: string[] = [];
  for (const o of orgs) {
    const { error } = await g.supabase.rpc("invite_member", { p_org: o, p_email: email.data!, p_role: role.data! });
    if (error) failed.push(`${g.registry.find((c) => c.id === o)?.name}: ${error.message}`);
  }
  revalidatePath("/group/admin");
  back(failed.length ? `Done with problems — ${failed.join("; ")}` : `${email.data} now has access to ${orgs.length} compan${orgs.length === 1 ? "y" : "ies"}. People who have not signed in yet get an invitation.`);
}
