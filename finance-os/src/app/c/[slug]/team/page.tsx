import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext, ROLE_LABELS } from "@/lib/workspace";
import { loadMembers } from "@/lib/people";
import { designFor } from "@/domain/design";
import { Cta, PageHead } from "@/components/dp/shell";
import { Modal } from "@/components/dp/modal";
import { C } from "@/components/dp/theme";
import { ListView, NOTES } from "@/views/list";
import { formatDate } from "@/domain/dates";
import { Card } from "@/components/dp/ui";
import { DeactivateForm, MemberForm } from "../forms";
import { changeRoleAction, reactivateMemberAction, revokeInvitationAction } from "../actions";

export const metadata: Metadata = { title: "Team" };
const ASSIGNABLE = ["company_admin", "finance", "viewer", "sales_manager", "sales_rep", "account_manager", "operations_manager", "marketing_manager", "staff", "accountant", "partner"];
const SCOPE: Record<string, string> = { partner: "Shared records only", accountant: "Granted periods only", finance: "Finance module", viewer: "Finance, read only", sales_rep: "Own records", staff: "Own records", account_manager: "Own clients" };
const sm = { border: `1px solid ${C.btnLine}`, borderRadius: 7, padding: "4px 8px", fontSize: 12.5, background: "#fff", cursor: "pointer" } as const;

export default async function TeamPage({ params, searchParams }: PageProps<"/c/[slug]/team">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("members.manage") && !ctx.can("dashboard.owner")) notFound();
  const d = designFor(slug);
  const base = `/c/${slug}/team`;
  const members = await loadMembers(ctx.supabase, ctx.company.id);
  const manage = ctx.can("members.manage");
  const [inv, hist] = manage ? await Promise.all([
    ctx.supabase.from("invitations").select("id, email, role, expires_at").eq("organization_id", ctx.company.id).is("accepted_at", null).is("revoked_at", null).order("created_at"),
    ctx.supabase.from("membership_history").select("id, role, reason, deactivated_at, reactivated_at, user:users!membership_history_user_id_fkey(full_name, email)").eq("organization_id", ctx.company.id).is("reactivated_at", null).order("deactivated_at", { ascending: false }).limit(20),
  ]) : [{ data: [] }, { data: [] }];
  const invites = (inv.data ?? []) as { id: string; email: string; role: string; expires_at: string }[];
  const former = (hist.data ?? []) as unknown as { id: string; role: string; reason: string; deactivated_at: string; user: { full_name: string | null; email: string | null } | null }[];
  const leaving = typeof sp.deactivate === "string" ? members.find((m) => m.id === sp.deactivate) : undefined;
  const roles = ctx.can("members.grant_owner") ? ["owner", ...ASSIGNABLE] : ASSIGNABLE;
  const [title, lines] = NOTES.team;
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title={d.ren.team ?? "Team"} right={manage ? <Cta href={`${base}?add=1`}>+ Add</Cta> : undefined} />
      <ListView vm={{
        head: ["PERSON", "ROLE", "SCOPE", "TARGET"],
        rows: members.map((m) => {
          const editable = manage && m.user_id !== ctx.userId && (m.role !== "owner" || ctx.can("members.grant_owner"));
          return {
            a: <>{m.name}<div style={{ fontWeight: 400, fontSize: 12.5, color: C.muted }}>{m.email}</div></>,
            b: editable ? (
              <form action={changeRoleAction.bind(null, slug)} style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <input type="hidden" name="membership_id" value={m.id} />
                <select name="role" defaultValue={m.role} aria-label={`Role for ${m.name}`} style={sm}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}</select>
                <button style={sm}>Save</button>
              </form>
            ) : ROLE_LABELS[m.role] ?? m.role,
            c: SCOPE[m.role] ?? "This company only",
            d: editable ? <a href={`${base}?deactivate=${m.id}`} style={{ ...sm, color: C.red, textDecoration: "none" }}>Deactivate</a> : "—",
          };
        }),
        empty: "No members yet.", noteTitle: title, noteLines: lines,
      }} />
      {manage && (invites.length > 0 || former.length > 0) && (
        <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 20, marginTop: 20 }}>
          <Card title="Invited, not signed in yet">
            {invites.length === 0 && <div style={{ fontSize: 14, color: C.muted, paddingTop: 8 }}>No open invitations.</div>}
            {invites.map((i) => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 }}>
                <span style={{ flex: 1 }}>{i.email}<div style={{ fontSize: 12.5, color: C.muted }}>{ROLE_LABELS[i.role] ?? i.role} · until {formatDate(i.expires_at.slice(0, 10))}</div></span>
                <form action={revokeInvitationAction.bind(null, slug)}><input type="hidden" name="invitation_id" value={i.id} /><button style={{ ...sm, color: C.red }}>Revoke</button></form>
              </div>
            ))}
          </Card>
          <Card title="Former members">
            {former.length === 0 && <div style={{ fontSize: 14, color: C.muted, paddingTop: 8 }}>Nobody has been deactivated.</div>}
            {former.map((h) => (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 }}>
                <span style={{ flex: 1 }}>{h.user?.full_name || h.user?.email || "Unknown"}<div style={{ fontSize: 12.5, color: C.muted }}>{ROLE_LABELS[h.role] ?? h.role} · {formatDate(h.deactivated_at.slice(0, 10))} · {h.reason}</div></span>
                <form action={reactivateMemberAction.bind(null, slug)}><input type="hidden" name="history_id" value={h.id} /><button style={sm}>Restore</button></form>
              </div>
            ))}
          </Card>
        </div>
      )}
      {leaving && manage && (
        <Modal title={`Deactivate ${leaving.name}`} closeHref={base}>
          <p style={{ fontSize: 13.5, color: C.body, marginTop: 0, lineHeight: 1.5 }}>Their access to {ctx.company.name} ends now. Records they created stay, and the reason is kept in the audit log. You can restore them later.</p>
          <DeactivateForm slug={slug} membershipId={leaving.id} name={leaving.name} />
        </Modal>
      )}
      {sp.add && manage && (
        <Modal title="Add a member" closeHref={base}>
          <p style={{ fontSize: 13.5, color: C.body, marginTop: 0, lineHeight: 1.5 }}>Add someone by email with a scoped role. If they have never signed in, they are invited and get the role the first time they sign in with that email. Membership here grants nothing in other companies or the group.</p>
          <MemberForm slug={slug} roles={roles.map((r) => ({ id: r, label: ROLE_LABELS[r] ?? r }))} />
        </Modal>
      )}
    </>
  );
}
