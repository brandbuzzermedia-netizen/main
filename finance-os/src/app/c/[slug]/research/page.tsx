import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { loadMembers } from "@/lib/people";
import { designFor } from "@/domain/design";
import { addDays, formatDate, formatDayShort, formatTime, todayInBusinessTz } from "@/domain/dates";
import { Cta, PageHead } from "@/components/dp/shell";
import { Board, type BoardCard } from "@/components/dp/board";
import { Modal } from "@/components/dp/modal";
import { Btn, Card, Field, inputStyle } from "@/components/dp/ui";
import { C } from "@/components/dp/theme";
import { addResearchAction, moveResearchAction } from "./actions";

export const metadata: Metadata = { title: "Research board" };
const initials = (n: string) => n.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("");

/** Research board (More of Us OS): prepare for every client conversation; next 14 days of meetings on top. */
export default async function ResearchPage({ params, searchParams }: PageProps<"/c/[slug]/research">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  const d = designFor(slug);
  const base = `/c/${slug}/research`;
  const today = todayInBusinessTz();
  const [{ data }, { data: meets }, members] = await Promise.all([
    ctx.supabase.from("research_cards").select("id, title, account, status, priority, due_on, assignee_id").eq("organization_id", ctx.company.id).order("position").order("created_at").limit(300),
    ctx.supabase.from("meetings").select("id, title, starts_at").eq("organization_id", ctx.company.id).gte("starts_at", `${today}T00:00:00+05:30`).lt("starts_at", `${addDays(today, 14)}T00:00:00+05:30`).order("starts_at").limit(12),
    loadMembers(ctx.supabase, ctx.company.id),
  ]);
  const name = new Map(members.map((m) => [m.user_id, m.name]));
  const rows = (data ?? []) as { id: string; title: string; account: string | null; status: string; priority: string; due_on: string | null; assignee_id: string | null }[];
  const cards: BoardCard[] = rows.map((r) => ({ id: r.id, col: r.status, title: r.title, sub: r.account ?? undefined, meta: r.due_on ? `Due ${formatDate(r.due_on)}` : "",
    badge: r.priority === "high" ? { text: "High priority", tone: "red" } : undefined, initials: r.assignee_id ? initials(name.get(r.assignee_id) ?? "?") : undefined }));
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title="Research board" right={<Cta href={`${base}?add=1`}>+ New card</Cta>} intro={<>Prepare for every conversation. Drag cards between columns.</>} />
      {typeof sp.note === "string" && <div role="status" style={{ marginBottom: 14, fontSize: 14, color: C.red }}>{sp.note}</div>}
      <Card title="Client meetings · next 14 days" style={{ marginBottom: 18 }}>
        {(meets ?? []).length === 0 && <div style={{ fontSize: 14, color: C.muted, paddingTop: 6 }}>No meetings in the next 14 days.</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10, marginTop: 8 }}>
          {(meets ?? []).map((m) => (
            <div key={m.id} style={{ display: "flex", gap: 12, alignItems: "center", border: `1px solid ${C.line}`, borderRadius: 4, padding: "8px 10px", background: "#fff" }}>
              <div style={{ background: C.ink, color: "#fff", borderRadius: 3, padding: "4px 8px", textAlign: "center", lineHeight: 1.1, minWidth: 40 }}>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{new Date(m.starts_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric" })}</div>
                <div style={{ fontSize: 9.5, textTransform: "uppercase" }}>{new Date(m.starts_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", month: "short" })}</div>
              </div>
              <div style={{ minWidth: 0 }}><b style={{ fontSize: 13.5 }}>{m.title}</b><div style={{ fontSize: 12, color: C.muted }}>{formatDayShort(m.starts_at)} · {formatTime(m.starts_at)}</div></div>
            </div>
          ))}
        </div>
      </Card>
      <Board columns={[{ key: "to_start", label: "To start" }, { key: "research", label: "Research" }, { key: "in_progress", label: "In progress" }, { key: "done", label: "Done" }]}
        cards={cards} move={moveResearchAction.bind(null, slug)} />
      {sp.add && (
        <Modal title="New research card" closeHref={base}>
          <form action={addResearchAction.bind(null, slug)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="What to research *"><input name="title" required minLength={2} maxLength={200} placeholder="e.g. Research of the Timber Project" style={inputStyle} /></Field>
            <Field label="Client / account"><input name="account" maxLength={200} placeholder="e.g. Timber Association" style={inputStyle} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Due date"><input type="date" name="due_on" style={inputStyle} /></Field>
              <Field label="Priority"><select name="priority" style={inputStyle}><option value="normal">Normal</option><option value="high">High</option></select></Field>
            </div>
            <Field label="Owner"><select name="assignee_id" defaultValue={ctx.userId} style={inputStyle}>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select></Field>
            <Field label="Notes"><textarea name="details" rows={3} maxLength={4000} style={inputStyle} /></Field>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><Btn href={base}>Cancel</Btn><Btn primary>Save</Btn></div>
          </form>
        </Modal>
      )}
    </>
  );
}
