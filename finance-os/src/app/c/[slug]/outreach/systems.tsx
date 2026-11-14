import type { ReactNode } from "react";
import type { CompanyContext } from "@/lib/workspace";
import { formatDate, formatDateTime, todayInBusinessTz } from "@/domain/dates";
import { C } from "@/components/dp/theme";
import { copyCampaignAction } from "../actions";
import { campaignStatusAction, enrollmentStatusAction, enrollAction, keywordAction, postDecisionAction, presetSequenceAction, queueCallAction, signalAction, taskOutcomeAction, createPostAction } from "./actions";

const card = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px" } as const;
const field = { border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "9px 10px", fontSize: 14, background: "#fff", color: C.ink } as const;
const btn = { border: `1px solid ${C.btnLine}`, background: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: C.ink } as const;
const primary = { background: "var(--co-side)", color: "#fff", border: 0, borderRadius: 9, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" } as const;
const row = { padding: "12px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 } as const;
export const Head = ({ t, aside }: { t: string; aside?: ReactNode }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
    <div style={{ fontFamily: "var(--co-font)", fontSize: 22, fontWeight: 500 }}>{t}</div>{aside}
  </div>
);
export const Note = ({ text }: { text?: string }) => text ? <div role="status" style={{ background: C.soft, color: "var(--co-side)", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, marginBottom: 16 }}>{text}</div> : null;
const STEP: Record<string, string> = { follow: "Follow", comment: "Comment", connect: "Connect", message: "Message", follow_up: "Follow up", reply: "Reply", call: "Call" };

/** Today's assisted steps for a channel: open, copy the draft, send it yourself, mark the result. */
export async function TasksCard({ ctx, channel }: { ctx: CompanyContext; channel: string }) {
  const slug = ctx.company.slug;
  const { data } = await ctx.supabase.from("outreach_tasks").select("id, step, due_on, target_url, draft, contact:contacts(full_name, company_name)")
    .eq("organization_id", ctx.company.id).eq("channel", channel).eq("status", "open").lte("due_on", todayInBusinessTz()).order("due_on").limit(40);
  const ts = (data ?? []) as unknown as { id: string; step: string; due_on: string; target_url: string | null; draft: string | null; contact: { full_name: string; company_name: string | null } | null }[];
  return (
    <div style={card}>
      <Head t="Today's tasks" aside={<span style={{ fontSize: 13, color: C.muted }}>{ts.length} to do</span>} />
      {ts.length === 0 && <div style={{ ...row, color: C.muted }}>Nothing due. Enrol leads in a sequence below; their steps appear here on the right day.</div>}
      {ts.map((t) => (
        <div key={t.id} style={row}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span><b style={{ fontWeight: 600 }}>{STEP[t.step] ?? t.step}</b> · {t.contact?.full_name ?? "Lead"}{t.contact?.company_name ? ` · ${t.contact.company_name}` : ""}</span>
            {t.target_url ? <a href={t.target_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "var(--co-side)" }}>Open profile ↗</a> : <span style={{ fontSize: 12.5, color: C.red }}>Add their profile link on the lead</span>}
          </div>
          {t.draft && <textarea readOnly defaultValue={t.draft} aria-label="Draft to copy" rows={2} style={{ ...field, width: "100%", marginTop: 8, fontSize: 13.5, resize: "vertical" }} />}
          <form action={taskOutcomeAction.bind(null, slug)} style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input type="hidden" name="task_id" value={t.id} /><input type="hidden" name="ch" value={channel} />
            <button name="status" value="done" style={btn}>Done</button>
            <button name="status" value="replied" style={{ ...btn, color: "#2F5D4C" }}>They replied</button>
            <button name="status" value="skipped" style={{ ...btn, color: C.muted }}>Skip</button>
          </form>
        </div>
      ))}
    </div>
  );
}

/** Content calendar: drafts need approval; approved posts publish through n8n on the day. */
export async function PostsCard({ ctx, channel, ch }: { ctx: CompanyContext; channel: "linkedin" | "facebook" | "instagram" | "twitter"; ch: string }) {
  const slug = ctx.company.slug;
  const { data } = await ctx.supabase.from("content_posts").select("id, body, media_url, scheduled_at, status, external_url, error").eq("organization_id", ctx.company.id).eq("channel", channel)
    .neq("status", "cancelled").order("scheduled_at", { ascending: false }).limit(20);
  const ps = (data ?? []) as { id: string; body: string; media_url: string | null; scheduled_at: string; status: string; external_url: string | null; error: string | null }[];
  const approve = ctx.can("automation.approve");
  const { data: accs } = await ctx.supabase.from("sender_accounts").select("id, label").eq("channel", channel).eq("status", "active").neq("kind", "personal_profile");
  const postAccounts = (accs ?? []) as { id: string; label: string }[];
  const colour: Record<string, string> = { draft: C.warnFg2, approved: "var(--co-side)", published: "#2F5D4C", failed: C.red };
  return (
    <div style={card}>
      <Head t="Posts" aside={<span style={{ fontSize: 13, color: C.muted }}>Publish after approval</span>} />
      <form action={createPostAction.bind(null, slug)} style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 14 }}>
        <input type="hidden" name="channel" value={channel} />
        {postAccounts.length > 0 && <select name="sender_account_id" aria-label="Post from" style={field}>{postAccounts.map((a) => <option key={a.id} value={a.id}>Post from {a.label}</option>)}</select>}
        <textarea name="body" required maxLength={channel === "twitter" ? 280 : 3000} rows={3} placeholder={`Write the ${channel === "linkedin" ? "LinkedIn" : channel === "facebook" ? "Facebook" : channel === "twitter" ? "X (max 280 characters)" : "Instagram"} post`} aria-label="Post text" style={{ ...field, resize: "vertical" }} />
        <input name="media_url" placeholder={channel === "instagram" ? "Image link (https://…), required for Instagram" : "Image link (optional, https://…)"} aria-label="Image link" style={field} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="date" name="date" required defaultValue={todayInBusinessTz()} aria-label="Date" style={field} />
          <input type="time" name="time" required defaultValue="10:00" aria-label="Time (IST)" style={field} />
          <button style={primary}>Save draft</button>
        </div>
      </form>
      {ps.length === 0 && <div style={{ ...row, color: C.muted }}>No posts yet.</div>}
      {ps.map((p) => (
        <div key={p.id} style={row}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ color: C.muted, fontSize: 13 }}>{formatDateTime(p.scheduled_at)}</span>
            <span style={{ fontWeight: 600, fontSize: 13, color: colour[p.status] ?? C.muted }}>{p.status === "approved" ? "Approved, waiting to publish" : p.status[0].toUpperCase() + p.status.slice(1)}</span>
          </div>
          <div style={{ marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{p.body.length > 280 ? `${p.body.slice(0, 280)}…` : p.body}</div>
          {p.error && <div style={{ color: C.red, fontSize: 13, marginTop: 4 }}>{p.error}</div>}
          {p.external_url && <a href={p.external_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--co-side)", fontWeight: 600 }}>View post ↗</a>}
          {(p.status === "draft" || p.status === "approved") && (
            <form action={postDecisionAction.bind(null, slug)} style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input type="hidden" name="post_id" value={p.id} /><input type="hidden" name="ch" value={ch} />
              {p.status === "draft" && approve && <button name="decision" value="approve" style={{ ...btn, color: "#2F5D4C" }}>Approve</button>}
              <button name="decision" value="cancel" style={{ ...btn, color: C.red }}>Cancel</button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

/** Ready-made sequences for this channel, and enrolling leads. */
export async function SequencesCard({ ctx, ch, presets }: { ctx: CompanyContext; ch: string; presets: [string, string][] }) {
  const slug = ctx.company.slug;
  const [seqs, leads] = await Promise.all([
    ctx.supabase.from("outreach_sequences").select("id, name, steps").eq("organization_id", ctx.company.id).eq("status", "active").order("created_at"),
    ctx.supabase.from("contacts").select("id, full_name, company_name, consent_basis").eq("organization_id", ctx.company.id).eq("do_not_contact", false).order("created_at", { ascending: false }).limit(200),
  ]);
  const ss = (seqs.data ?? []) as { id: string; name: string; steps: { channel: string; delay_days?: number }[] }[];
  const ls = (leads.data ?? []) as { id: string; full_name: string; company_name: string | null; consent_basis: string }[];
  return (
    <div style={card}>
      <Head t="Campaigns" aside={<a href={`/c/${slug}/r/sequences`} style={{ fontSize: 13, fontWeight: 600, color: "var(--co-side)" }}>Edit wording →</a>} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: 12 }}>
        {presets.map(([k, l]) => (
          <form key={k} action={presetSequenceAction.bind(null, slug)}><input type="hidden" name="preset" value={k} /><input type="hidden" name="ch" value={ch} /><button style={btn}>+ {l}</button></form>
        ))}
      </div>
      <CampaignList ctx={ctx} ret={`/c/${slug}/outreach?ch=${ch}`} />
      {ss.length === 0 ? <div style={{ ...row, color: C.muted }}>Start a campaign above to enrol leads.</div> : (
        <form action={enrollAction.bind(null, slug)} style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${C.line2}`, paddingTop: 12 }}>
          <input type="hidden" name="ch" value={ch} />
          <select name="sequence_id" aria-label="Sequence" style={field}>{ss.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.steps.length} steps</option>)}</select>
          <select name="contact_id" multiple size={Math.min(6, Math.max(3, ls.length))} aria-label="Leads to enrol" style={field}>
            {ls.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.company_name ? ` · ${c.company_name}` : ""}{c.consent_basis === "none" ? " · no lawful basis (email/WhatsApp steps skipped)" : ""}</option>)}
          </select>
          <div style={{ fontSize: 12.5, color: C.muted }}>Hold Ctrl (Cmd on Mac) to pick several. Sends wait for approval; LinkedIn, Facebook and Instagram steps become your daily tasks.</div>
          <div><button style={primary}>Enrol leads</button></div>
        </form>
      )}
    </div>
  );
}

/** Reddit: watched keywords and the conversations found, with a draft reply posted by a person. */
export async function RedditPanel({ ctx }: { ctx: CompanyContext }) {
  const slug = ctx.company.slug;
  const [kw, sig] = await Promise.all([
    ctx.supabase.from("listen_keywords").select("id, keyword, subreddit").eq("organization_id", ctx.company.id).order("created_at"),
    ctx.supabase.from("social_signals").select("id, source_url, author, title, snippet, matched_keyword, status, draft_reply, created_at").eq("organization_id", ctx.company.id).eq("channel", "reddit")
      .in("status", ["new", "drafted"]).order("created_at", { ascending: false }).limit(30),
  ]);
  const ks = (kw.data ?? []) as { id: string; keyword: string; subreddit: string | null }[];
  const ss = (sig.data ?? []) as { id: string; source_url: string; author: string | null; title: string | null; snippet: string | null; matched_keyword: string | null; status: string; draft_reply: string | null; created_at: string }[];
  return (
    <>
      <div style={card}>
        <Head t="Conversations to answer" aside={<span style={{ fontSize: 13, color: C.muted }}>{ss.length} open</span>} />
        {ss.length === 0 && <div style={{ ...row, color: C.muted }}>Nothing found yet. Add keywords; the daily scan finds posts where people ask for what you sell.</div>}
        {ss.map((s) => (
          <div key={s.id} style={row}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <a href={s.source_url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: C.ink }}>{s.title ?? s.source_url} ↗</a>
              <span style={{ fontSize: 12.5, color: C.muted, whiteSpace: "nowrap" }}>{s.matched_keyword ? `“${s.matched_keyword}”` : ""} · {formatDate(s.created_at.slice(0, 10))}</span>
            </div>
            {s.snippet && <div style={{ color: C.muted, fontSize: 13.5, marginTop: 4, lineHeight: 1.45 }}>{s.snippet.slice(0, 300)}</div>}
            <form action={signalAction.bind(null, slug)} style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              <input type="hidden" name="signal_id" value={s.id} /><input type="hidden" name="ch" value="reddit" />
              <textarea name="draft_reply" defaultValue={s.draft_reply ?? ""} rows={2} placeholder="Helpful reply (answer the question first; mention your business only if relevant)" aria-label="Draft reply" style={{ ...field, fontSize: 13.5 }} />
              <div style={{ display: "flex", gap: 6 }}>
                <button name="status" value="drafted" style={btn}>Save draft</button>
                <button name="status" value="replied" style={{ ...btn, color: "#2F5D4C" }}>I replied</button>
                <button name="status" value="ignored" style={{ ...btn, color: C.muted }}>Ignore</button>
              </div>
            </form>
          </div>
        ))}
      </div>
      <div style={card}>
        <Head t="Watched keywords" />
        <form action={keywordAction.bind(null, slug)} style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: 10 }}>
          <input name="keyword" required placeholder="e.g. digital marketing agency" aria-label="Keyword" style={{ ...field, flex: 2, minWidth: 180 }} />
          <input name="subreddit" placeholder="r/smallbusiness (optional)" aria-label="Subreddit" style={{ ...field, flex: 1, minWidth: 140 }} />
          <button style={primary}>Watch</button>
        </form>
        {ks.map((k) => (
          <form key={k.id} action={keywordAction.bind(null, slug)} style={{ ...row, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{k.keyword}{k.subreddit ? <span style={{ color: C.muted }}> · r/{k.subreddit}</span> : <span style={{ color: C.muted }}> · all of Reddit</span>}</span>
            <button name="remove" value={k.id} style={{ ...btn, color: C.red }}>Remove</button>
          </form>
        ))}
      </div>
    </>
  );
}

/** AI calls: queue a call for a callable lead; results land in the lead's history. */
export async function CallsPanel({ ctx }: { ctx: CompanyContext }) {
  const slug = ctx.company.slug;
  const [calls, leads] = await Promise.all([
    ctx.supabase.from("voice_calls").select("id, purpose, status, outcome, summary, recording_url, scheduled_for, contact:contacts(full_name)").eq("organization_id", ctx.company.id).order("created_at", { ascending: false }).limit(30),
    ctx.supabase.from("contacts").select("id, full_name, company_name").eq("organization_id", ctx.company.id).eq("do_not_contact", false).neq("consent_basis", "none").not("phone_e164", "is", null).order("created_at", { ascending: false }).limit(200),
  ]);
  const cs = (calls.data ?? []) as unknown as { id: string; purpose: string; status: string; outcome: string | null; summary: string | null; recording_url: string | null; scheduled_for: string; contact: { full_name: string } | null }[];
  const ls = (leads.data ?? []) as { id: string; full_name: string; company_name: string | null }[];
  const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());
  return (
    <>
      <div style={card}>
        <Head t="Queue an AI call" />
        {ls.length === 0 ? <div style={{ ...row, color: C.muted }}>No callable leads. A lead needs a phone number, a lawful basis and no do-not-contact flag.</div> : (
          <form action={queueCallAction.bind(null, slug)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <select name="contact_id" aria-label="Lead" style={field}>{ls.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.company_name ? ` · ${c.company_name}` : ""}</option>)}</select>
            <select name="purpose" aria-label="Purpose" style={field}>
              <option value="qualify">Qualify and book a meeting</option><option value="follow_up">Follow up after an enquiry</option>
              <option value="meeting_reminder">Remind about a meeting</option><option value="payment_reminder">Remind about a payment</option>
            </select>
            <div><button style={primary}>Queue call</button></div>
          </form>
        )}
      </div>
      <div style={card}>
        <Head t="Calls" />
        {cs.length === 0 && <div style={{ ...row, color: C.muted }}>No calls yet.</div>}
        {cs.map((c) => (
          <div key={c.id} style={row}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span><b style={{ fontWeight: 600 }}>{c.contact?.full_name ?? "Lead"}</b> · {label(c.purpose)}</span>
              <span style={{ fontWeight: 600, fontSize: 13, color: c.outcome === "meeting_booked" || c.outcome === "interested" ? "#2F5D4C" : c.status === "failed" ? C.red : C.muted }}>{c.outcome ? label(c.outcome) : label(c.status)}</span>
            </div>
            {c.summary && <div style={{ color: C.muted, fontSize: 13.5, marginTop: 4, lineHeight: 1.45 }}>{c.summary}</div>}
            {c.recording_url && <a href={c.recording_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "var(--co-side)" }}>Recording ↗</a>}
            {c.status === "queued" && <form action={queueCallAction.bind(null, slug)} style={{ marginTop: 6 }}><button name="cancel" value={c.id} style={{ ...btn, color: C.red }}>Cancel</button></form>}
          </div>
        ))}
      </div>
    </>
  );
}

const STATUS_STYLE: Record<string, [string, string]> = { active: ["#E3E8DF", "#2F5D4C"], paused: ["#F3E7C4", "#7a5b00"], draft: ["#EFE9D9", "#6d7a70"] };
const CH_LABEL: Record<string, string> = { twitter: "X", email: "Email", whatsapp: "WhatsApp", linkedin: "LinkedIn", linkedin_task: "LinkedIn", facebook: "Facebook", instagram: "Instagram", call_task: "Call", reddit: "Reddit" };

/** Every campaign in this company with live numbers and one-click Start / Pause / Resume. */
export async function CampaignList({ ctx, ret }: { ctx: CompanyContext; ret: string }) {
  const slug = ctx.company.slug;
  const [seqs, ens] = await Promise.all([
    ctx.supabase.from("outreach_sequences").select("id, name, steps, status, requires_approval").eq("organization_id", ctx.company.id).neq("status", "archived").order("created_at"),
    ctx.supabase.from("outreach_enrollments").select("sequence_id, status").eq("organization_id", ctx.company.id).limit(10000),
  ]);
  const ss = (seqs.data ?? []) as { id: string; name: string; steps: { channel: string }[]; status: string; requires_approval: boolean }[];
  const es = (ens.data ?? []) as { sequence_id: string; status: string }[];
  const manage = ctx.can("crm.manage");
  if (ss.length === 0) return <div style={{ ...row, color: C.muted }}>No campaigns yet. Add one from a channel tab (Email, LinkedIn, WhatsApp…).</div>;
  return (
    <>
      {ss.map((q) => {
        const mine = es.filter((e) => e.sequence_id === q.id);
        const n = (f: (s: string) => boolean) => mine.filter((e) => f(e.status)).length;
        const [bg, fg] = STATUS_STYLE[q.status] ?? STATUS_STYLE.draft;
        const channels = [...new Set(q.steps.map((s) => CH_LABEL[s.channel] ?? s.channel))].join(" · ");
        return (
          <div key={q.id} style={{ ...row, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <a href={`/c/${slug}/outreach?campaign=${q.id}`} style={{ fontWeight: 600, color: C.ink }}>{q.name}</a>
              <div style={{ fontSize: 12.5, color: C.muted }}>{channels} · {q.steps.length} steps · {n((s) => s === "active")} running · {n((s) => s === "paused")} paused · {n((s) => s === "stopped_reply")} replied · {n((s) => s === "completed")} finished</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, background: bg, color: fg, borderRadius: 6, padding: "3px 9px" }}>{q.status === "active" ? "Running" : q.status === "paused" ? "Paused" : "Draft"}</span>
            {manage && (
              <form action={campaignStatusAction.bind(null, slug)} style={{ display: "flex", gap: 6 }}>
                <input type="hidden" name="sequence_id" value={q.id} /><input type="hidden" name="ret" value={ret} />
                {q.status === "active"
                  ? <button name="status" value="paused" style={{ ...btn, color: "#7a5b00" }}>Pause</button>
                  : <button name="status" value="active" style={{ ...btn, color: "#2F5D4C" }}>{q.status === "paused" ? "Resume" : "Start"}</button>}
              </form>
            )}
          </div>
        );
      })}
      {!manage && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>A sales manager or owner starts and pauses campaigns.</div>}
    </>
  );
}

/** One campaign: its leads, where each is in the sequence, and per-lead pause / resume / remove. */
export async function CampaignDetail({ ctx, id }: { ctx: CompanyContext; id: string }) {
  const slug = ctx.company.slug;
  const [{ data: seq }, { data: ens }] = await Promise.all([
    ctx.supabase.from("outreach_sequences").select("id, name, steps, status").eq("id", id).eq("organization_id", ctx.company.id).maybeSingle(),
    ctx.supabase.from("outreach_enrollments").select("id, status, current_step, next_step_at, contact:contacts(full_name, company_name)").eq("sequence_id", id).eq("organization_id", ctx.company.id).order("created_at", { ascending: false }).limit(300),
  ]);
  if (!seq) return null;
  const others = ctx.memberships.filter((m) => m.company.id !== ctx.company.id && m.company.family_group_id === ctx.company.family_group_id && ["owner", "company_admin", "sales_manager"].includes(m.role))
    .map((m) => ({ id: m.company.id, name: m.company.name }));
  const steps = seq.steps as { channel: string; action?: string }[];
  const es = (ens ?? []) as unknown as { id: string; status: string; current_step: number; next_step_at: string | null; contact: { full_name: string; company_name: string | null } | null }[];
  const label: Record<string, string> = { active: "Running", paused: "Paused", completed: "Finished", stopped_reply: "Replied", stopped_suppressed: "Opted out", stopped_manual: "Removed" };
  return (
    <div style={{ ...card, marginBottom: 20 }}>
      <Head t={seq.name as string} aside={<a href={`/c/${slug}/outreach`} style={{ fontSize: 13, fontWeight: 600, color: "var(--co-side)" }}>← All campaigns</a>} />
      <CampaignList ctx={ctx} ret={`/c/${slug}/outreach?campaign=${id}`} />
      {others.length > 0 && (
        <form action={copyCampaignAction.bind(null, slug)} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", borderTop: `1px solid ${C.line2}`, marginTop: 10, paddingTop: 12, fontSize: 13.5 }}>
          <input type="hidden" name="sequence_id" value={id} />
          <span style={{ fontWeight: 600 }}>Copy to</span>
          {others.map((o) => <label key={o.id} style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" name="org" value={o.id} /> {o.name}</label>)}
          <button style={btn}>Copy campaign</button>
        </form>
      )}
      <div style={{ fontWeight: 600, fontSize: 14, margin: "14px 0 4px" }}>Leads in this campaign · {es.length}</div>
      {es.length === 0 && <div style={{ ...row, color: C.muted }}>No leads enrolled. Enrol them from a channel tab.</div>}
      {es.map((e) => {
        const st = steps[e.current_step];
        return (
          <div key={e.id} style={{ ...row, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 180 }}><b style={{ fontWeight: 600 }}>{e.contact?.full_name ?? "Lead"}</b>{e.contact?.company_name ? <span style={{ color: C.muted }}> · {e.contact.company_name}</span> : null}</span>
            <span style={{ fontSize: 13, color: C.muted }}>{st && (e.status === "active" || e.status === "paused") ? `Step ${e.current_step + 1} of ${steps.length}: ${CH_LABEL[st.channel] ?? st.channel}${st.action ? ` ${st.action.replace("_", " ")}` : ""}${e.next_step_at && e.status === "active" ? ` · ${formatDate(e.next_step_at.slice(0, 10))}` : ""}` : label[e.status] ?? e.status}</span>
            {(e.status === "active" || e.status === "paused") && (
              <form action={enrollmentStatusAction.bind(null, slug)} style={{ display: "flex", gap: 6 }}>
                <input type="hidden" name="enrollment_id" value={e.id} /><input type="hidden" name="sequence_id" value={id} />
                {e.status === "active" ? <button name="status" value="paused" style={btn}>Pause</button> : <button name="status" value="active" style={{ ...btn, color: "#2F5D4C" }}>Resume</button>}
                <button name="status" value="stopped_manual" style={{ ...btn, color: C.red }}>Remove</button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Each account's pace today on this channel, so bulk sending stays inside platform limits. */
export async function AccountsToday({ ctx, channel }: { ctx: CompanyContext; channel: string }) {
  const today = todayInBusinessTz();
  const [{ data: accs }, { data: log }, { data: tasks }] = await Promise.all([
    ctx.supabase.from("sender_accounts").select("id, label, kind, daily_limit, status, warmup_started, organization_id").eq("channel", channel),
    ctx.supabase.from("outreach_send_log").select("sender_account_id").eq("organization_id", ctx.company.id).eq("sent_on", today),
    ctx.supabase.from("outreach_tasks").select("sender_account_id").eq("organization_id", ctx.company.id).eq("due_on", today),
  ]);
  const as = (accs ?? []) as { id: string; label: string; kind: string; daily_limit: number; status: string; warmup_started: string | null; organization_id: string | null }[];
  const used = (id: string) => ((log ?? []) as { sender_account_id: string | null }[]).filter((x) => x.sender_account_id === id).length + ((tasks ?? []) as { sender_account_id: string | null }[]).filter((x) => x.sender_account_id === id).length;
  const cap = (a: (typeof as)[number]) => (channel === "email" && a.warmup_started ? Math.min(a.daily_limit, 10 + 5 * Math.max(0, Math.round((Date.parse(today) - Date.parse(a.warmup_started)) / 86_400_000))) : a.daily_limit);
  return (
    <div style={card}>
      <Head t="Accounts today" aside={ctx.can("crm.manage") ? <a href={`/c/${ctx.company.slug}/settings#accounts`} style={{ fontSize: 13, fontWeight: 600, color: "var(--co-side)" }}>Manage →</a> : undefined} />
      {as.length === 0 && <div style={{ ...row, color: C.muted }}>No accounts for this channel yet. Add mailboxes, numbers, Pages or team profiles in Settings → Sending accounts; bulk sends then spread across them.</div>}
      {as.map((a) => (
        <div key={a.id} style={{ ...row, display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span>{a.label}{a.organization_id === null ? <span style={{ color: C.muted }}> · shared</span> : null}{a.status !== "active" ? <span style={{ color: "#7a5b00" }}> · paused</span> : null}</span>
          <span style={{ color: C.muted, whiteSpace: "nowrap" }}>{used(a.id)} / {cap(a)} today{channel === "email" && a.warmup_started && cap(a) < a.daily_limit ? " · warming up" : ""}</span>
        </div>
      ))}
    </div>
  );
}
