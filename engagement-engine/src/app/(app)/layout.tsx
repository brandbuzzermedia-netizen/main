import { cookies } from "next/headers";
import { AppShell } from "@/components/client/shell";
import { requireUser } from "@/lib/auth/session";
import { isStaff, isSuperAdmin } from "@/lib/auth/types";
import { withUser } from "@/lib/db";

const ROLE_LABEL = { super_admin: "GBS Super Admin", account_manager: "GBS Account Manager", client_user: "Client user" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { clients, unread, brandName } = await withUser(user.id, async (db) => {
    // RLS limits this list to clients the user may access. Client users only ever see their own.
    const clients = await db.query<{ id: string; name: string; status: string; pending: number }>(
      `select c.id, c.name, c.status,
              (select count(*)::int from comments m where m.client_id = c.id and m.status = 'pending_approval') as pending
       from clients c order by c.name`,
    );
    const unread = (await db.one<{ n: number }>("select count(*)::int as n from notifications where user_id = $1 and read_at is null", [user.id]))!.n;
    const org = await db.one<{ branding: { brand_name?: string } }>("select branding from organizations where id = $1", [user.organizationId]);
    return { clients, unread, brandName: org?.branding?.brand_name || "Get Bee Seen" };
  });
  const cookieClient = (await cookies()).get("gbs_client")?.value ?? null;
  const initial = clients.some((c) => c.id === cookieClient) ? cookieClient : null;
  const role = user.platformRole;
  return (
    <AppShell
      user={{ name: user.fullName, email: user.email, role: ROLE_LABEL[role] }}
      isStaff={isStaff(user)}
      isSuperAdmin={isSuperAdmin(user)}
      clients={clients}
      initialClientId={initial}
      brandName={brandName}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
