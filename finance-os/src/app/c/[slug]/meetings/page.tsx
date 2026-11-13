import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext, ROLE_LABELS } from "@/lib/workspace";
import { loadMembers } from "@/lib/people";
import { addDays, formatDayShort, formatTime, todayInBusinessTz } from "@/domain/dates";
import { Badge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { MeetingForm } from "../forms";
import { setMeetingStatusAction } from "../actions";

export const metadata: Metadata = { title: "Meetings" };

function isPast(iso: string) {
  return Date.parse(iso) < Date.now();
}

export default async function MeetingsPage({ params }: PageProps<"/c/[slug]/meetings">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.read_all") && !ctx.can("crm.read_assigned")) notFound();
  const today = todayInBusinessTz();
  const canAssign = ctx.can("crm.read_all");
  const [meetings, deals, members] = await Promise.all([
    ctx.supabase.from("meetings").select("id, title, starts_at, status, location, owner_id, deal:deals(title)")
      .eq("organization_id", ctx.company.id).gte("starts_at", `${addDays(today, -14)}T00:00:00+05:30`).order("starts_at").limit(500),
    ctx.supabase.from("deals").select("id, title").eq("organization_id", ctx.company.id).is("closed_at", null).order("title").limit(500),
    canAssign ? loadMembers(ctx.supabase, ctx.company.id) : Promise.resolve([]),
  ]);
  if (meetings.error) throw new Error(meetings.error.message);
  const rows = (meetings.data ?? []) as unknown as { id: string; title: string; starts_at: string; status: string; location: string | null; owner_id: string | null; deal: { title: string } | null }[];
  const names = new Map(members.map((m) => [m.user_id, m.name]));
  return (
    <>
      <PageHeader title="Meetings" description="Last two weeks and everything ahead. Times are India time. Calendar sync arrives with integrations." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {rows.length === 0 ? <EmptyState title="No meetings yet">Add one on the right.</EmptyState> : (
          <Table head={["When", "Meeting", "Owner", "Status", ""]}>
            {rows.map((m) => (
              <tr key={m.id}>
                <Td className="whitespace-nowrap">{formatDayShort(m.starts_at)} · {formatTime(m.starts_at)}</Td>
                <Td><div className="font-medium">{m.title}</div><div className="text-xs text-muted">{[m.deal?.title, m.location].filter(Boolean).join(" · ")}</div></Td>
                <Td>{m.owner_id ? names.get(m.owner_id) ?? (m.owner_id === ctx.userId ? "You" : "—") : "—"}</Td>
                <Td><Badge tone={m.status === "completed" ? "ok" : m.status === "scheduled" ? (isPast(m.starts_at) ? "warn" : "info") : "neutral"}>{m.status.replace("_", " ")}</Badge></Td>
                <Td>
                  {ctx.can("crm.write") && m.status === "scheduled" && (
                    <form action={setMeetingStatusAction.bind(null, slug)} className="flex gap-1">
                      <input type="hidden" name="meeting_id" value={m.id} />
                      <select name="status" aria-label="Outcome" className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs">
                        <option value="completed">Completed</option><option value="no_show">No-show</option><option value="cancelled">Cancelled</option>
                      </select>
                      <button className="rounded-md border border-line px-2 text-xs hover:bg-surface-2">Save</button>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
        {ctx.can("crm.write") && (
          <Card title="Add a meeting">
            <MeetingForm slug={slug} today={today} canAssign={canAssign}
              deals={(deals.data ?? []).map((d) => ({ id: d.id as string, label: d.title as string }))}
              people={members.filter((m) => m.user_id !== ctx.userId && !["partner", "accountant"].includes(m.role)).map((m) => ({ id: m.user_id, label: `${m.name} · ${ROLE_LABELS[m.role] ?? m.role}` }))} />
          </Card>
        )}
      </div>
    </>
  );
}
