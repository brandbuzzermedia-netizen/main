import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { loadMembers } from "@/lib/people";
import { designFor } from "@/domain/design";
import { formatDate, todayInBusinessTz } from "@/domain/dates";
import { Cta, PageHead } from "@/components/dp/shell";
import { Board, type BoardCard } from "@/components/dp/board";
import { Modal } from "@/components/dp/modal";
import { Btn, Field, inputStyle } from "@/components/dp/ui";
import { C } from "@/components/dp/theme";
import { addFollowUpAction, moveFollowUpAction } from "./actions";

export const metadata: Metadata = { title: "Follow-ups" };
const initials = (n: string) => n.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("");

/** Follow-ups board (More of Us OS): every open follow-up and task, by status or due date. */
export default async function FollowUpsPage({ params, searchParams }: PageProps<"/c/[slug]/followups">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("tasks.write") && !ctx.can("tasks.read_all")) notFound();
  const d = designFor(slug);
  const base = `/c/${slug}/followups`;
  const owner = typeof sp.owner === "string" ? sp.owner : "all";
  const today = todayInBusinessTz();
  let q = ctx.supabase.from("tasks").select("id, title, status, due_on, assignee_id, priority, deal_id").eq("organization_id", ctx.company.id).neq("status", "cancelled").order("due_on", { ascending: true, nullsFirst: false }).limit(300);
  if (owner === "me") q = q.eq("assignee_id", ctx.userId);
  const [{ data }, members] = await Promise.all([q, loadMembers(ctx.supabase, ctx.company.id)]);
  const name = new Map(members.map((m) => [m.user_id, m.name]));
  const rows = (data ?? []) as { id: string; title: string; status: string; due_on: string | null; assignee_id: string | null; priority: string }[];
  const open = rows.filter((r) => r.status !== "done").length;
  const dueToday = rows.filter((r) => r.status !== "done" && r.due_on === today).length;
  const cards: BoardCard[] = rows.map((r) => ({
    id: r.id, col: r.status, title: r.title, meta: r.due_on ? formatDate(r.due_on) : "No date",
    badge: r.status !== "done" && r.due_on && r.due_on < today ? { text: "Overdue", tone: "red" } : r.priority === "high" || r.priority === "urgent" ? { text: "High priority" } : undefined,
    initials: r.assignee_id ? initials(name.get(r.assignee_id) ?? "?") : undefined,
  }));
  const tab = (k: string, l: string) => <a href={k === "all" ? base : `${base}?owner=${k}`} aria-current={owner === k ? "page" : undefined} style={{ padding: "9px 14px", fontSize: 13.5, fontWeight: 600, textDecoration: "none", background: owner === k ? C.ink : C.card, color: owner === k ? "#fff" : C.ink, border: `1px solid ${C.line}` }}>{l}</a>;
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title="Follow up" tag="Every time." right={<Cta href={`${base}?add=1`}>+ New follow-up</Cta>}
        intro={<>{open} open · {dueToday} due today · drag cards between columns</>} />
      {typeof sp.note === "string" && <div role="status" style={{ marginBottom: 14, fontSize: 14, color: C.red }}>{sp.note}</div>}
      <nav aria-label="Whose follow-ups" style={{ display: "flex", marginBottom: 16 }}>{tab("all", "All owners")}{tab("me", "Mine")}</nav>
      <Board columns={[{ key: "open", label: "To do" }, { key: "in_progress", label: "In progress" }, { key: "done", label: "Done" }]} cards={cards} move={moveFollowUpAction.bind(null, slug)} />
      {sp.add && (
        <Modal title="New follow-up" closeHref={base}>
          <form action={addFollowUpAction.bind(null, slug)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="What to do *"><input name="title" required minLength={2} maxLength={200} placeholder="e.g. Call back about the proposal" style={inputStyle} /></Field>
            <Field label="Due date"><input type="date" name="due_on" defaultValue={today} style={inputStyle} /></Field>
            <Field label="Owner"><select name="assignee_id" defaultValue={ctx.userId} style={inputStyle}>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select></Field>
            <Field label="Notes"><textarea name="details" rows={3} maxLength={2000} style={inputStyle} /></Field>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><Btn href={base}>Cancel</Btn><Btn primary>Save</Btn></div>
          </form>
        </Modal>
      )}
    </>
  );
}
