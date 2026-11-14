import type { Metadata } from "next";
import { getGroupContext } from "@/lib/workspace";
import { companiesWith, nameMap } from "@/lib/group-data";
import { GroupHead } from "@/lib/group-head";
import { addDays, formatDate, formatDayShort, formatTime, todayInBusinessTz } from "@/domain/dates";
import { ListView, NOTES } from "@/views/list";

export const metadata: Metadata = { title: "Calendar" };

export default async function GroupCalendar() {
  const g = await getGroupContext();
  const crm = companiesWith(g, "crm.read_all"), fin = companiesWith(g, "finance.read"), rent = companiesWith(g, "rental.read");
  const names = nameMap(g.registry);
  const today = todayInBusinessTz(), end = addDays(today, 30);
  const none = { data: [] };
  const [meetings, tasks, leases, tax] = await Promise.all([
    crm.length ? g.supabase.from("meetings").select("organization_id, title, starts_at, status").in("organization_id", crm.map((c) => c.id)).gte("starts_at", `${today}T00:00:00+05:30`).lt("starts_at", `${end}T00:00:00+05:30`) : none,
    crm.length ? g.supabase.from("tasks").select("organization_id, title, due_on").in("organization_id", crm.map((c) => c.id)).in("status", ["open", "in_progress"]).gte("due_on", today).lt("due_on", end) : none,
    rent.length ? g.supabase.from("leases").select("organization_id, end_date, unit:rental_units(label)").in("organization_id", rent.map((c) => c.id)).eq("status", "active").gte("end_date", today).lt("end_date", addDays(today, 120)) : none,
    fin.length ? g.supabase.from("tax_periods").select("organization_id, label, due_on").in("organization_id", fin.map((c) => c.id)).neq("status", "filed").gte("due_on", addDays(today, -60)).lt("due_on", end) : none,
  ]);
  type Ev = { at: string; a: string; b: string; c: string; d: string };
  const ev: Ev[] = [
    ...((meetings.data ?? []) as { organization_id: string; title: string; starts_at: string; status: string }[]).map((m) => ({ at: m.starts_at, a: m.title, b: `${formatDayShort(m.starts_at)} ${formatTime(m.starts_at)}`, c: m.status === "scheduled" ? "Meeting" : m.status, d: names.get(m.organization_id) ?? "" })),
    ...((tasks.data ?? []) as { organization_id: string; title: string; due_on: string }[]).map((t) => ({ at: `${t.due_on}T23:00`, a: t.title, b: formatDate(t.due_on), c: "Follow-up", d: names.get(t.organization_id) ?? "" })),
    ...((leases.data ?? []) as unknown as { organization_id: string; end_date: string; unit: { label: string } }[]).map((l) => ({ at: `${l.end_date}T23:00`, a: `${l.unit.label} lease ends`, b: formatDate(l.end_date), c: "Renewal", d: names.get(l.organization_id) ?? "" })),
    ...((tax.data ?? []) as { organization_id: string; label: string; due_on: string }[]).map((t) => ({ at: `${t.due_on}T23:00`, a: t.label, b: formatDate(t.due_on), c: t.due_on < today ? "Overdue filing" : "Filing due", d: names.get(t.organization_id) ?? "" })),
  ].sort((x, y) => x.at.localeCompare(y.at));
  const [title, lines] = NOTES.meetings;
  return (
    <>
      <GroupHead title="Calendar" />
      <ListView vm={{ head: ["EVENT", "WHEN", "TYPE", "BUSINESS"], rows: ev.map(({ a, b, c, d }) => ({ a, b, c, d })), empty: "Nothing in the next 30 days across the businesses you can see.", noteTitle: title, noteLines: [...lines, "Calendar sync (Google, Outlook) runs through n8n once connected"] }} />
    </>
  );
}
