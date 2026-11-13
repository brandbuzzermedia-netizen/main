import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext, ROLE_LABELS } from "@/lib/workspace";
import { loadMembers } from "@/lib/people";
import { designFor } from "@/domain/design";
import { Cta, PageHead } from "@/components/dp/shell";
import { Modal } from "@/components/dp/modal";
import { C } from "@/components/dp/theme";
import { ListView, NOTES } from "@/views/list";
import { MemberForm } from "../forms";
import { changeRoleAction, removeMemberAction } from "../actions";

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
            d: editable ? <form action={removeMemberAction.bind(null, slug)}><input type="hidden" name="membership_id" value={m.id} /><button style={{ ...sm, color: C.red }}>Remove</button></form> : "—",
          };
        }),
        empty: "No members yet.", noteTitle: title, noteLines: lines,
      }} />
      {sp.add && manage && (
        <Modal title="Add a member" closeHref={base}>
          <p style={{ fontSize: 13.5, color: C.body, marginTop: 0, lineHeight: 1.5 }}>The person signs in once with their approved email, then you add them here with a scoped role. Membership here grants nothing in other companies or the group.</p>
          <MemberForm slug={slug} roles={roles.map((r) => ({ id: r, label: ROLE_LABELS[r] ?? r }))} />
        </Modal>
      )}
    </>
  );
}
