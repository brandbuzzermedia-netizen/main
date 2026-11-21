import "server-only";
import type { CompanyContext, GroupContext } from "@/lib/workspace";
import type { WsOption } from "@/components/dp/topbar";

export function wsOptions(groupName: string | null, memberships: { company: { slug: string; name: string } }[]): WsOption[] {
  return [...(groupName ? [{ value: "group", label: groupName }] : []), ...memberships.map((m) => ({ value: m.company.slug, label: m.company.name }))];
}

/** Items waiting for this person in a company: automation approvals and ledger approvals they may decide. */
export async function companyApprovals(ctx: CompanyContext) {
  const [auto, ledger] = await Promise.all([
    ctx.can("automation.approve") ? ctx.supabase.from("automation_runs").select("id", { count: "exact", head: true }).eq("organization_id", ctx.company.id).eq("status", "pending_approval") : Promise.resolve({ count: 0 }),
    ctx.can("finance.approve") ? ctx.supabase.from("ledger_entries").select("id", { count: "exact", head: true }).eq("organization_id", ctx.company.id).eq("status", "pending_approval").neq("created_by", ctx.userId) : Promise.resolve({ count: 0 }),
  ]);
  return { automation: auto.count ?? 0, ledger: ledger.count ?? 0 };
}

export async function groupApprovals(g: GroupContext) {
  const ids = g.registry.filter((c) => g.access.get(c.id)?.permissions.has("automation.approve")).map((c) => c.id);
  if (!ids.length) return 0;
  const { count } = await g.supabase.from("automation_runs").select("id", { count: "exact", head: true }).in("organization_id", ids).eq("status", "pending_approval");
  return count ?? 0;
}
