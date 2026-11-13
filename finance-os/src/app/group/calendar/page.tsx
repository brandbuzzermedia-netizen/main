import type { Metadata } from "next";
import { getGroupContext } from "@/lib/workspace";
import { companiesWith, nameMap } from "@/lib/group-data";
import { addDays, formatDate, formatDayShort, formatTime, todayInBusinessTz } from "@/domain/dates";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Calendar" };

export default async function GroupCalendar() {
  const g = await getGroupContext();
  const crm = companiesWith(g, "crm.read_all");
  const fin = companiesWith(g, "finance.read");
  const rent = companiesWith(g, "rental.read");
  const names = nameMap(g.registry);
  const today = todayInBusinessTz();
  const end = addDays(today, 30);
  const [meetings, tasks, leases, tax] = await Promise.all([
    crm.length ? g.supabase.from("meetings").select("organization_id, title, starts_at").in("organization_id", crm.map((c) => c.id)).eq("status", "scheduled").gte("starts_at", `${today}T00:00:00+05:30`).lt("starts_at", `${end}T00:00:00+05:30`) : { data: [] },
    crm.length ? g.supabase.from("tasks").select("organization_id, title, due_on").in("organization_id", crm.map((c) => c.id)).in("status", ["open", "in_progress"]).gte("due_on", today).lt("due_on", end) : { data: [] },
    rent.length ? g.supabase.from("leases").select("organization_id, end_date, unit:rental_units(label)").in("organization_id", rent.map((c) => c.id)).eq("status", "active").gte("end_date", today).lt("end_date", addDays(today, 120)) : { data: [] },
    fin.length ? g.supabase.from("tax_periods").select("organization_id, label, due_on").in("organization_id", fin.map((c) => c.id)).neq("status", "filed").gte("due_on", addDays(today, -60)).lt("due_on", end) : { data: [] },
  ]);
  type Ev = { date: string; time?: string; company: string; text: string; kind: string };
  const ev: Ev[] = ([
    ...((meetings.data ?? []) as { organization_id: string; title: string; starts_at: string }[]).map((m) => ({ date: todayInBusinessTz(new Date(m.starts_at)), time: formatTime(m.starts_at), company: names.get(m.organization_id)!, text: m.title, kind: "Meeting" })),
    ...((tasks.data ?? []) as { organization_id: string; title: string; due_on: string }[]).map((t) => ({ date: t.due_on, company: names.get(t.organization_id)!, text: t.title, kind: "Follow-up" })),
    ...((leases.data ?? []) as unknown as { organization_id: string; end_date: string; unit: { label: string } }[]).map((l) => ({ date: l.end_date, company: names.get(l.organization_id)!, text: `${l.unit.label} lease ends (renewal)`, kind: "Renewal" })),
    ...((tax.data ?? []) as { organization_id: string; label: string; due_on: string }[]).map((t) => ({ date: t.due_on, company: names.get(t.organization_id)!, text: t.label, kind: t.due_on < today ? "Overdue filing" : "Filing due" })),
  ] as Ev[]).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
  const days = [...new Set(ev.map((e) => e.date))];
  return (
    <>
      <PageHeader title="Calendar" description="Next 30 days across your companies: meetings, follow-ups, filings and lease renewals. Calendar sync with Google or Outlook needs a connection (via n8n)." />
      {ev.length === 0 ? <EmptyState title="Nothing scheduled" /> : (
        <ol className="flex flex-col gap-4">
          {days.map((d) => (
            <li key={d}>
              <h2 className="mb-1.5 font-display text-lg">{d === today ? "Today" : formatDayShort(`${d}T06:00:00Z`)} <span className="text-sm text-muted">{formatDate(d)}</span></h2>
              <ul className="rounded-2xl border border-line bg-surface">
                {ev.filter((e) => e.date === d).map((e, i) => (
                  <li key={i} className="flex gap-3 border-t border-line-2 px-4 py-2.5 text-sm first:border-t-0">
                    <span className="w-16 flex-none text-muted">{e.time ?? ""}</span><span className={`w-28 flex-none text-xs ${e.kind.startsWith("Overdue") ? "text-danger" : "text-muted"}`}>{e.kind}</span>
                    <span className="min-w-0 flex-1">{e.text}</span><span className="text-xs text-muted">{e.company}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
