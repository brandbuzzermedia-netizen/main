import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/auth";
import { formatDate } from "@/domain/dates";
import { Badge, PageHeader, Table, Td } from "@/components/ui";

export const metadata: Metadata = { title: "Organizations" };

type OrgRow = { id: string; name: string; primary_market: string; status: string; is_demo: boolean; created_at: string; plan_key: string | null; subscription_status: string | null; members: number; leads: number };

async function setStatus(orgId: string, status: "active" | "suspended") {
  "use server";
  const ctx = await getContext();
  if (!ctx.isPlatformAdmin) throw new Error("Platform admins only");
  const { error } = await ctx.supabase.rpc("admin_set_organization_status", { p_org: orgId, p_status: status });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

/** Platform console: organization-level facts only. It never shows a tenant's leads. */
export default async function AdminPage() {
  const ctx = await getContext();
  if (!ctx.isPlatformAdmin) notFound();
  const { data, error } = await ctx.supabase.rpc("admin_list_organizations");
  if (error) throw new Error(error.message);
  const orgs = (data ?? []) as OrgRow[];
  return (
    <>
      <PageHeader title="Organizations" description="Every tenant on the platform. Lead records stay private to each organization." />
      <Table head={["Organization", "Market", "Plan", "Members", "Leads", "Created", "Status"]}>
        {orgs.map((o) => (
          <tr key={o.id}>
            <Td className="font-medium">{o.name} {o.is_demo && <Badge tone="warn">Demo</Badge>}</Td>
            <Td>{o.primary_market}</Td>
            <Td>{o.plan_key ?? "—"} <span className="text-xs text-muted">{o.subscription_status}</span></Td>
            <Td numeric>{o.members}</Td>
            <Td numeric>{o.leads.toLocaleString()}</Td>
            <Td>{formatDate(o.created_at)}</Td>
            <Td>
              <form action={setStatus.bind(null, o.id, o.status === "active" ? "suspended" : "active")} className="flex items-center gap-2">
                <Badge tone={o.status === "active" ? "ok" : "danger"}>{o.status}</Badge>
                <button className="text-xs text-muted hover:text-ink">{o.status === "active" ? "Suspend" : "Restore"}</button>
              </form>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
