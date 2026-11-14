import type { ReactNode } from "react";
import type { CompanyContext } from "@/lib/workspace";
import { formatDate, formatDateTime, todayInBusinessTz } from "@/domain/dates";
import { C } from "@/components/dp/theme";
import { enrollAction, keywordAction, postDecisionAction, presetSequenceAction, queueCallAction, signalAction, taskOutcomeAction, createPostAction } from "./actions";

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
export async function PostsCard({ ctx, channel, ch }: { ctx: CompanyContext; channel: "linkedin" | "facebook" | "instagram"; ch: string }) {
  const slug = ctx.company.slug;
  const { data } = await ctx.supabase.from("content_posts").select("id, body, media_url, scheduled_at, status, external_url, error").eq("organization_id", ctx.company.id).eq("channel", channel)
    .neq("status", "cancelled").order("scheduled_at", { ascending: false }).limit(20);
  const ps = (data ?? []) as { id: string; body: string; media_url: string | null; scheduled_at: string; status: string; external_url: string | null; error: string | null }[];
  const approve = ctx.can("automation.approve");
  const colour: Record<string, string> = { draft: C.warnFg2, approved: "var(--co-side)", published: "#2F5D4C", failed: C.red };
  return (
    <div style={card}>
      <Head t="Posts" aside={<span style={{ fontSize: 13, color: C.muted }}>Publish after approval</span>} />
      <form action={createPostAction.bind(null, slug)} style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 14 }}>
        <input type="hidden" name="channel" value={channel} />
        <textarea name="body" required maxLength={3000} rows={3} placeholder={`Write the ${channel === "linkedin" ? "LinkedIn" : channel === "facebook" ? "Facebook" : "Instagram"} post`} aria-label="Post text" style={{ ...field, resize: "vertical" }} />
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
      <Head t="Sequences" aside={<a href={`/c/${slug}/r/sequences`} style={{ fontSize: 13, fontWeight: 600, color: "var(--co-side)" }}>Edit wording →</a>} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: 12 }}>
        {presets.map(([k, l]) => (
          <form key={k} action={presetSequenceAction.bind(null, slug)}><input type="hidden" name="preset" value={k} /><input type="hidden" name="ch" value={ch} /><button style={btn}>+ {l}</button></form>
        ))}
      </div>
      {ss.length === 0 ? <div style={{ ...row, color: C.muted }}>No active sequences. Add one above.</div> : (
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
