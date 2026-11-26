import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getGroupContext, type Permission } from "@/lib/workspace";
import { GroupHead } from "@/lib/group-head";
import { C } from "@/components/dp/theme";
import { font } from "@/components/dp/ui";
import { addDays, todayInBusinessTz } from "@/domain/dates";
import { groupCampaignAction, groupCopyAction, groupPauseAllAction } from "./actions";

export const metadata: Metadata = { title: "Outreach" };

const card = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px", marginBottom: 20 } as const;
const th = { textAlign: "right", padding: "8px 10px", fontSize: 12, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" } as const;
const td = { textAlign: "right", padding: "9px 10px", borderTop: `1px solid ${C.line2}`, fontSize: 14, whiteSpace: "nowrap" } as const;
const btn = { border: `1px solid ${C.btnLine}`, background: "#fff", borderRadius: 8, padding: "5px 11px", fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" } as const;
const H = ({ t, aside }: { t: string; aside?: ReactNode }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
    <div style={{ fontFamily: font, fontSize: 22, fontWeight: 500 }}>{t}</div>{aside}
  </div>
);

type Seq = { id: string; name: string; status: string; approved_at: string | null; organization_id: string; steps: { channel: string }[] };
type Acc = { id: string; channel: string; daily_limit: number; status: string; warmup_started: string | null; organization_id: string | null };

/** One screen for bulk outreach across every company: capacity, campaigns, approvals, launch everywhere, pause everything. */
export default async function GroupOutreach({ searchParams }: PageProps<"/group/outreach">) {
  const g = await getGroupContext();
  const note = (await searchParams).note;
  const cos = g.registry.filter((c) => g.access.get(c.id)?.permissions.has("crm.write"));
  const ids = cos.map((c) => c.id);
  const today = todayInBusinessTz();
  const week = `${addDays(today, -7)}T00:00:00+05:30`;
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [seqs, ens, accs, sent, replies, meets] = await Promise.all([
    g.supabase.from("outreach_sequences").select("id, name, status, approved_at, organization_id, steps").in("organization_id", ids.length ? ids : none).neq("status", "archived").order("created_at"),
    g.supabase.from("outreach_enrollments").select("organization_id").in("organization_id", ids.length ? ids : none).eq("status", "active").limit(50000),
    g.supabase.from("sender_accounts").select("id, channel, daily_limit, status, warmup_started, organization_id").or(`organization_id.in.(${(ids.length ? ids : none).join(",")}),family_group_id.eq.${g.group.id}`),
    g.supabase.from("outreach_send_log").select("organization_id, sender_account_id").in("organization_id", ids.length ? ids : none).eq("sent_on", today).limit(50000),
    g.supabase.from("outreach_events").select("organization_id").in("organization_id", ids.length ? ids : none).eq("kind", "reply").gte("occurred_at", week).limit(50000),
    g.supabase.from("meetings").select("organization_id").in("organization_id", ids.length ? ids : none).gte("created_at", week).limit(50000),
  ]);
  const S = (seqs.data ?? []) as Seq[];
  const A = ((accs.data ?? []) as Acc[]).filter((a) => a.status === "active");
  const by = <T extends { organization_id: string | null }>(rows: T[] | null, org: string) => (rows ?? []).filter((r) => r.organization_id === org).length;
  const cap = (a: Acc) => (a.channel === "email" && a.warmup_started ? Math.min(a.daily_limit, 10 + 5 * Math.max(0, Math.round((Date.parse(today) - Date.parse(a.warmup_started)) / 86_400_000))) : a.daily_limit);
  const emailCap = (org: string | null) => A.filter((a) => a.channel === "email" && a.organization_id === org).reduce((s, a) => s + cap(a), 0);
  const sharedEmail = emailCap(null);
  const name = new Map(cos.map((c) => [c.id, c.name]));
  const slug = new Map(cos.map((c) => [c.id, c.slug]));
  const can = (org: string, p: Permission) => g.access.get(org)?.permissions.has(p) ?? false;
  const totals = {
    running: S.filter((q) => q.status === "active").length,
    waiting: S.filter((q) => q.status === "active" && !q.approved_at).length,
    inCampaigns: (ens.data ?? []).length,
    capacity: cos.reduce((s, c) => s + emailCap(c.id), 0) + sharedEmail,
    sent: (sent.data ?? []).length,
    replies: (replies.data ?? []).length,
    meetings: (meets.data ?? []).length,
  };
  const groupOwner = g.group.role === "group_owner";
  return (
    <>
      <GroupHead title="Outreach" intro="Bulk outreach for every company from one place. Each company keeps its own leads, accounts and limits; the platform rules and weekly cap still apply everywhere." />
      {typeof note === "string" && <div role="status" style={{ background: "#fff", border: `1px solid ${C.line}`, borderLeft: `4px solid ${C.ink}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 14 }}>{note}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginBottom: 20 }}>
        {[["Campaigns running", totals.running, totals.waiting ? `${totals.waiting} waiting for approval` : "all approved"], ["Leads in campaigns", totals.inCampaigns, "active right now"],
          ["Email capacity today", totals.capacity, `${totals.sent} sent so far`], ["Replies (7 days)", totals.replies, ""], ["Meetings (7 days)", totals.meetings, ""]].map(([l, v, s]) => (
          <div key={String(l)} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ fontSize: 13, color: C.muted }}>{l}</div>
            <div style={{ fontFamily: font, fontSize: 28, marginTop: 6 }}>{v}</div>
            {s && <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{s}</div>}
          </div>
        ))}
      </div>

      <div style={card}>
        <H t="Companies" aside={groupOwner ? (
          <div style={{ display: "flex", gap: 8 }}>
            <form action={groupPauseAllAction}><input type="hidden" name="paused" value="true" /><button style={{ ...btn, color: "#8C2F39" }}>Pause everything</button></form>
            <form action={groupPauseAllAction}><input type="hidden" name="paused" value="false" /><button style={btn}>Resume everything</button></form>
          </div>) : undefined} />
        {cos.length === 0 ? <div style={{ color: C.muted, fontSize: 14 }}>You are not in the sales team of any company yet.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={{ ...th, textAlign: "left" }}>COMPANY</th><th style={th}>CAMPAIGNS</th><th style={th}>IN CAMPAIGNS</th><th style={th}>ACCOUNTS</th><th style={th}>EMAIL TODAY</th><th style={th}>REPLIES 7D</th><th style={th}>MEETINGS 7D</th><th style={th} /></tr></thead>
              <tbody>
                {cos.map((c) => {
                  const mine = S.filter((q) => q.organization_id === c.id);
                  const running = mine.filter((q) => q.status === "active").length;
                  const accounts = A.filter((a) => a.organization_id === c.id).length;
                  const capacity = emailCap(c.id);
                  return (
                    <tr key={c.id}>
                      <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{c.name}</td>
                      <td style={td}>{running} running{mine.length - running ? <span style={{ color: C.faint }}> · {mine.length - running} paused</span> : null}</td>
                      <td style={td}>{by(ens.data, c.id)}</td>
                      <td style={{ ...td, color: accounts ? undefined : "#8C2F39" }}>{accounts || "none yet"}</td>
                      <td style={td}>{by(sent.data, c.id)} / {capacity}{sharedEmail ? <span style={{ color: C.faint }}> + shared</span> : null}</td>
                      <td style={td}>{by(replies.data, c.id)}</td>
                      <td style={td}>{by(meets.data, c.id)}</td>
                      <td style={td}><a href={`/c/${c.slug}/outreach`} style={{ color: C.ink, fontWeight: 600 }}>Open →</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {sharedEmail > 0 && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10 }}>Shared group mailboxes add {sharedEmail} emails a day, used by whichever company needs them.</div>}
      </div>

      <div style={card}>
        <H t="All campaigns" />
        {S.length === 0 && <div style={{ color: C.muted, fontSize: 14 }}>No campaigns yet. Create one in any company (Outreach → a channel tab), then launch it everywhere below.</div>}
        {S.map((q) => {
          const channels = [...new Set(q.steps.map((s) => s.channel))].join(" · ");
          return (
            <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <a href={`/c/${slug.get(q.organization_id)}/outreach?campaign=${q.id}`} style={{ fontWeight: 600, color: C.ink }}>{q.name}</a>
                <div style={{ fontSize: 12.5, color: C.muted }}>{name.get(q.organization_id)} · {channels} · {q.steps.length} steps</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: q.status === "active" ? "#2F5D4C" : "#7a5b00" }}>{q.status === "active" ? "Running" : q.status === "paused" ? "Paused" : "Draft"}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: q.approved_at ? "#2F5D4C" : "#7a5b00" }}>{q.approved_at ? "✓ Approved" : "Needs approval"}</span>
              <form action={groupCampaignAction} style={{ display: "flex", gap: 6 }}>
                <input type="hidden" name="sequence_id" value={q.id} />
                {can(q.organization_id, "crm.manage") && (q.status === "active"
                  ? <button name="op" value="pause" style={btn}>Pause</button>
                  : <button name="op" value="resume" style={btn}>{q.status === "paused" ? "Resume" : "Start"}</button>)}
                {can(q.organization_id, "dashboard.owner") && (q.approved_at
                  ? <button name="op" value="withdraw" style={{ ...btn, color: C.muted }}>Withdraw approval</button>
                  : <button name="op" value="approve" style={{ ...btn, color: "#2F5D4C" }}>Approve once</button>)}
              </form>
            </div>
          );
        })}
      </div>

      {S.length > 0 && cos.length > 1 && (
        <div style={card}>
          <H t="Launch a campaign in many companies" />
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>Copies the steps and wording. Each copy starts paused and unapproved, so you can adjust it to that company, approve it and start it above.</div>
          <form action={groupCopyAction} style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
            <select name="sequence_id" aria-label="Campaign to copy" style={{ border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, maxWidth: 480 }}>
              {S.map((q) => <option key={q.id} value={q.id}>{q.name} ({name.get(q.organization_id)})</option>)}
            </select>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              {cos.filter((c) => can(c.id, "crm.write")).map((c) => <label key={c.id} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="org" value={c.id} />{c.name}</label>)}
            </div>
            <div><button style={{ ...btn, padding: "8px 16px", fontSize: 13.5, background: C.ink, color: "#fff", border: 0 }}>Copy to the ticked companies</button></div>
          </form>
        </div>
      )}
    </>
  );
}
