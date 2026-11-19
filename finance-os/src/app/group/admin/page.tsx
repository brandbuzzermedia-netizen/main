import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGroupContext } from "@/lib/workspace";
import { GroupHead } from "@/lib/group-head";
import { C } from "@/components/dp/theme";
import { Card, Field, inputStyle, label } from "@/components/dp/ui";
import { formatDateTime } from "@/domain/dates";
import { RoleCell } from "./role-cell";
import { bulkInviteAction } from "./actions";

export const metadata: Metadata = { title: "Admin console" };
const TABLE: Record<string, string> = { deals: "Deal", contacts: "Lead", invoices: "Invoice", payments: "Payment", memberships: "Access", tasks: "Task", proposals: "Proposal", organizations: "Company settings", meetings: "Meeting", clients: "Client" };

/** Super admin console: who has access to which company, with what role; invites; and recent changes everywhere. */
export default async function AdminConsole({ searchParams }: PageProps<"/group/admin">) {
  const g = await getGroupContext();
  if (g.group.role !== "group_owner") notFound();
  const sp = await searchParams;
  const cos = g.registry;
  const ids = cos.map((c) => c.id);
  const [{ data: ms }, { data: inv }, { data: audit }] = await Promise.all([
    g.supabase.from("memberships").select("id, user_id, role, organization_id, user:users(full_name, email)").in("organization_id", ids),
    g.supabase.from("invitations").select("email, role, organization_id").in("organization_id", ids).is("accepted_at", null).is("revoked_at", null),
    g.supabase.from("audit_logs").select("id, organization_id, actor_id, table_name, action, created_at").in("organization_id", ids).order("created_at", { ascending: false }).limit(40),
  ]);
  type M = { id: string; user_id: string; role: string; organization_id: string; user: { full_name: string | null; email: string | null } | null };
  const people = new Map<string, { name: string; email: string; cells: Map<string, M> }>();
  for (const m of (ms ?? []) as unknown as M[]) {
    const p = people.get(m.user_id) ?? { name: m.user?.full_name || m.user?.email || "—", email: m.user?.email ?? "", cells: new Map() };
    p.cells.set(m.organization_id, m); people.set(m.user_id, p);
  }
  const rows = [...people.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  const admins = (ms ?? []).filter((m) => m.role === "owner" || m.role === "company_admin").length;
  const nameOf = new Map(rows.map(([id, p]) => [id, p.name]));
  const coName = new Map(cos.map((c) => [c.id, c.short_name ?? c.name]));
  const tile = (l: string, v: number | string, s: string) => (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: "16px 18px" }}>
      <div style={label}>{l}</div><div style={{ fontFamily: "var(--font-tight)", fontWeight: 800, fontSize: 32, letterSpacing: "-.03em", marginTop: 8 }}>{v}</div><div style={{ fontSize: 12, color: C.faint }}>{s}</div>
    </div>
  );
  const th = { padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: C.muted, fontWeight: 500, textAlign: "left", whiteSpace: "nowrap" } as const;
  return (
    <>
      <GroupHead title="Admin console" intro="Super admin: everyone's access to every company in one table. Change a role, give access or remove it; each company's own rules and history still apply." />
      {typeof sp.note === "string" && <div role="status" style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: "3px solid var(--co-btn)", borderRadius: 4, padding: "10px 14px", marginBottom: 16, fontSize: 14 }}>{sp.note}</div>}
      <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 14, marginBottom: 20 }}>
        {tile("People", rows.length, "With access to at least one company")}{tile("Companies", cos.length, "In Diwani Parivaar")}{tile("Admins", admins, "Owner or admin roles")}{tile("Invitations", (inv ?? []).length, "Not signed in yet")}
      </div>
      <Card title="Access by company" aside="Super admin · Admin · Employee">
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th style={th}>Person</th>{cos.map((c) => <th key={c.id} style={th}>{c.short_name ?? c.name}</th>)}</tr></thead>
            <tbody>
              {rows.map(([uid, p]) => (
                <tr key={uid}>
                  <td style={{ padding: "8px 10px", borderTop: `1px solid ${C.line2}`, fontSize: 13.5, whiteSpace: "nowrap" }}><b>{p.name}</b><div style={{ fontSize: 11.5, color: C.faint }}>{p.email}</div></td>
                  {cos.map((c) => {
                    const m = p.cells.get(c.id);
                    return <td key={c.id} style={{ padding: "6px 8px", borderTop: `1px solid ${C.line2}` }}><RoleCell orgId={c.id} membershipId={m?.id ?? null} email={p.email} role={m?.role ?? null} company={c.name} person={p.name} /></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 20, marginTop: 20 }}>
        <Card title="Give access to many companies">
          <form action={bulkInviteAction} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
            <Field label="Email *"><input name="email" type="email" required placeholder="name@company.com" style={inputStyle} /></Field>
            <Field label="Role"><select name="role" defaultValue="sales_rep" style={inputStyle}>
              <option value="company_admin">Admin</option><option value="sales_manager">Sales manager</option><option value="sales_rep">Sales rep</option><option value="finance">Finance</option>
              <option value="operations_manager">Operations</option><option value="marketing_manager">Marketing</option><option value="staff">Staff</option><option value="viewer">Viewer</option><option value="accountant">Accountant</option>
            </select></Field>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 14 }}>{cos.map((c) => <label key={c.id} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="org" value={c.id} />{c.short_name ?? c.name}</label>)}</div>
            <div><button style={{ background: "var(--co-btn)", color: "#fff", border: 0, borderRadius: 3, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>Give access</button></div>
          </form>
          {(inv ?? []).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={label}>Waiting to sign in</div>
              {((inv ?? []) as { email: string; role: string; organization_id: string }[]).slice(0, 20).map((i) => <div key={i.email + i.organization_id} style={{ fontSize: 13.5, padding: "6px 0", borderTop: `1px solid ${C.line2}` }}>{i.email} · {coName.get(i.organization_id)} · {i.role.replace(/_/g, " ")}</div>)}
            </div>
          )}
        </Card>
        <Card title="Recent changes, every company">
          {(audit ?? []).length === 0 && <div style={{ fontSize: 13.5, color: C.muted, marginTop: 8 }}>No changes yet.</div>}
          {((audit ?? []) as { id: string; organization_id: string; actor_id: string | null; table_name: string; action: string; created_at: string }[]).map((a) => (
            <div key={a.id} style={{ fontSize: 13.5, padding: "8px 0", borderTop: `1px solid ${C.line2}` }}>
              <b>{a.actor_id ? nameOf.get(a.actor_id) ?? "Someone" : "System"}</b> {a.action === "INSERT" ? "added" : a.action === "UPDATE" ? "changed" : "removed"} a {(TABLE[a.table_name] ?? a.table_name.replace(/_/g, " ")).toLowerCase()}
              <div style={{ fontSize: 11.5, color: C.faint }}>{coName.get(a.organization_id)} · {formatDateTime(a.created_at)}</div>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
