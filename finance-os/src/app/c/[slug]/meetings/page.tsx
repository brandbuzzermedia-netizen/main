import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext, ROLE_LABELS } from "@/lib/workspace";
import { loadMembers } from "@/lib/people";
import { designFor } from "@/domain/design";
import { addDays, formatDate, formatDayShort, formatTime, todayInBusinessTz } from "@/domain/dates";
import { Cta, PageHead } from "@/components/dp/shell";
import { Modal } from "@/components/dp/modal";
import { Card } from "@/components/dp/ui";
import { C } from "@/components/dp/theme";
import { ListView, NOTES } from "@/views/list";
import { MeetingForm, TaskForm } from "../forms";
import { setMeetingStatusAction, setTaskStatusAction } from "../actions";

export const metadata: Metadata = { title: "Meetings" };
const sm = { border: `1px solid ${C.btnLine}`, borderRadius: 7, padding: "4px 8px", fontSize: 12.5, background: "#fff", cursor: "pointer" } as const;

export default async function MeetingsPage({ params, searchParams }: PageProps<"/c/[slug]/meetings">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  const crm = ctx.can("crm.read_all") || ctx.can("crm.read_assigned");
  if (!crm && !ctx.can("tasks.write")) notFound();
  const d = designFor(slug);
  const base = `/c/${slug}/meetings`;
  const today = todayInBusinessTz();
  const all = ctx.can("tasks.read_all");
  const [meetings, tasks, deals, members] = await Promise.all([
    crm ? ctx.supabase.from("meetings").select("id, title, starts_at, status, owner_id, deal:deals(title)").eq("organization_id", ctx.company.id).gte("starts_at", `${addDays(today, -14)}T00:00:00+05:30`).order("starts_at").limit(200) : Promise.resolve({ data: [] }),
    ctx.supabase.from("tasks").select("id, title, due_on, status, assignee_id, priority").eq("organization_id", ctx.company.id).in("status", ["open", "in_progress"]).order("due_on", { ascending: true, nullsFirst: false }).limit(100),
    ctx.supabase.from("deals").select("id, title").eq("organization_id", ctx.company.id).is("closed_at", null).limit(300),
    loadMembers(ctx.supabase, ctx.company.id),
  ]);
  const names = new Map(members.map((m) => [m.user_id, m.name]));
  const people = members.filter((m) => m.user_id !== ctx.userId && !["partner", "accountant", "viewer"].includes(m.role)).map((m) => ({ id: m.user_id, label: `${m.name} · ${ROLE_LABELS[m.role] ?? m.role}` }));
  const [title, lines] = NOTES.meetings;
  const ms = (meetings.data ?? []) as unknown as { id: string; title: string; starts_at: string; status: string; owner_id: string | null; deal: { title: string } | null }[];
  const ts = (tasks.data ?? []) as { id: string; title: string; due_on: string | null; assignee_id: string | null; priority: string }[];
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title={d.ren.meetings ?? "Meetings"} right={ctx.can("crm.write") || ctx.can("tasks.write") ? <Cta href={`${base}?add=${ctx.can("crm.write") ? "1" : "task"}`}>+ Add</Cta> : undefined} />
      <ListView vm={{
        head: ["MEETING", "WHEN", "OUTCOME", "OWNER"],
        rows: ms.map((m) => ({
          a: <>{m.title}{m.deal && <span style={{ fontWeight: 400, color: C.muted }}> · {m.deal.title}</span>}</>,
          b: `${formatDayShort(m.starts_at)} ${formatTime(m.starts_at)}`,
          c: m.status === "scheduled" && ctx.can("crm.write") ? (
            <form action={setMeetingStatusAction.bind(null, slug)} style={{ display: "flex", gap: 4 }}>
              <input type="hidden" name="meeting_id" value={m.id} />
              <select name="status" aria-label="Outcome" style={sm}><option value="completed">Done</option><option value="no_show">No-show</option><option value="cancelled">Cancelled</option></select>
              <button style={sm}>Save</button>
            </form>) : m.status === "scheduled" ? "Pending" : m.status.replace("_", " "),
          d: m.owner_id ? names.get(m.owner_id) ?? "—" : "—",
        })),
        empty: crm ? "No meetings yet. Calendar sync needs a connection; add meetings with + Add." : "Meetings are not part of your role.",
        noteTitle: title, noteLines: lines,
        more: (
          <Card title="Follow-ups" aside={all ? "Everyone's open tasks" : "Your tasks"}>
            {ts.length === 0 && <div style={{ padding: "10px 0", fontSize: 14, color: C.muted }}>No open follow-ups.</div>}
            {ts.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 }}>
                <span style={{ flex: 1 }}>{t.title}{t.priority === "urgent" || t.priority === "high" ? <span style={{ color: C.red, fontSize: 12 }}> · {t.priority}</span> : null}</span>
                <span style={{ color: t.due_on && t.due_on < today ? C.red : C.muted, fontSize: 13 }}>{formatDate(t.due_on)}</span>
                <span style={{ color: C.muted, fontSize: 13, width: 110, textAlign: "right" }}>{t.assignee_id ? names.get(t.assignee_id) ?? "—" : "Unassigned"}</span>
                {(all || t.assignee_id === ctx.userId) && <form action={setTaskStatusAction.bind(null, slug)}><input type="hidden" name="task_id" value={t.id} /><input type="hidden" name="status" value="done" /><button style={sm}>Done</button></form>}
              </div>
            ))}
            {ctx.can("tasks.write") && <a href={`${base}?add=task`} style={{ display: "inline-block", marginTop: 10, fontSize: 13.5, color: "var(--co-side)", fontWeight: 600 }}>+ Add a follow-up</a>}
          </Card>
        ),
      }} />
      {sp.add === "1" && ctx.can("crm.write") && <Modal title="New meeting" closeHref={base}><MeetingForm slug={slug} today={today} canAssign={ctx.can("crm.read_all")} deals={(deals.data ?? []).map((x) => ({ id: x.id as string, label: x.title as string }))} people={people} /></Modal>}
      {sp.add === "task" && ctx.can("tasks.write") && <Modal title="New follow-up" closeHref={base}><TaskForm slug={slug} canAssign={all} people={people} /></Modal>}
    </>
  );
}
