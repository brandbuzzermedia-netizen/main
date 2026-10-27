import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { loadLeadContext, memberName } from "@/lib/leads";
import type { Appointment } from "@/lib/db-types";
import { appointmentKindLabel, appointmentStatusLabel, appointmentStatusTone } from "@/domain/labels";
import { formatDate } from "@/domain/dates";
import { Alert, Badge, EmptyState, PageHeader, cx } from "@/components/ui";
import { AppointmentStatusMenu } from "@/components/crm/controls";

export const metadata: Metadata = { title: "Appointments" };

const VIEWS = { upcoming: "Upcoming", outcome: "Needs outcome", past: "Past 30 days" } as const;

export default async function AppointmentsPage({ searchParams }: PageProps<"/appointments">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const view = (typeof sp.view === "string" && sp.view in VIEWS ? sp.view : "upcoming") as keyof typeof VIEWS;
  const now = new Date();
  const nowIso = now.toISOString();
  const cols = "id, lead_id, deal_id, kind, title, starts_at, ends_at, location, status, assigned_to, source, notes";
  let q = ctx.supabase.from("appointments").select(cols).eq("organization_id", ctx.org.id);
  if (view === "upcoming") q = q.gte("starts_at", nowIso).neq("status", "cancelled").order("starts_at").limit(200);
  else if (view === "outcome") q = q.lt("starts_at", nowIso).eq("status", "scheduled").order("starts_at", { ascending: false }).limit(200);
  else q = q.lt("starts_at", nowIso).gte("starts_at", new Date(now.getTime() - 30 * 86_400_000).toISOString()).order("starts_at", { ascending: false }).limit(300);
  const [{ data, error }, ref, { count: needOutcome }] = await Promise.all([
    q,
    loadLeadContext(ctx),
    ctx.supabase.from("appointments").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id).lt("starts_at", nowIso).eq("status", "scheduled"),
  ]);
  if (error) throw new Error(error.message);
  const appts = (data ?? []) as Appointment[];
  const leadIds = [...new Set(appts.map((a) => a.lead_id))];
  const { data: leads } = leadIds.length ? await ctx.supabase.from("leads").select("id, full_name").in("id", leadIds) : { data: [] };
  const leadName = new Map((leads ?? []).map((l) => [l.id, l.full_name]));
  const members = new Map(ref.members.map((m) => [m.user_id, m]));
  const tz = ctx.org.timezone;
  const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(new Date(iso));
  const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const days = [...new Set(appts.map((a) => dayKey(a.starts_at)))];

  return (
    <>
      <PageHeader title="Appointments" description={`Viewings, valuations, calls and meetings, in ${tz}. Book them from a lead's page.`} />
      {(needOutcome ?? 0) > 0 && view !== "outcome" && (
        <div className="mb-4"><Alert tone="warn">{needOutcome} past appointment{needOutcome === 1 ? " has" : "s have"} no outcome yet. <Link className="underline" href="/appointments?view=outcome">Record them</Link> so attendance figures stay accurate.</Alert></div>
      )}
      <nav className="mb-4 flex gap-1 border-b border-line text-sm" aria-label="Appointment views">
        {Object.entries(VIEWS).map(([k, label]) => (
          <Link key={k} href={`/appointments?view=${k}`} aria-current={k === view ? "page" : undefined}
            className={cx("-mb-px border-b-2 px-3 py-2", k === view ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-ink")}>
            {label}
          </Link>
        ))}
      </nav>
      {appts.length === 0 ? (
        <EmptyState title={view === "upcoming" ? "Nothing booked" : view === "outcome" ? "Every past appointment has an outcome" : "No appointments in the last 30 days"} />
      ) : (
        <div className="flex flex-col gap-5">
          {days.map((day) => (
            <section key={day}>
              <h2 className="mb-2 text-sm font-semibold">{formatDate(`${day}T12:00:00Z`)}</h2>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {appts.filter((a) => dayKey(a.starts_at) === day).map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-4">
                    <span className="tabular w-24 shrink-0 text-muted">{time(a.starts_at)}–{time(a.ends_at)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{a.title} <span className="font-normal text-muted">· {appointmentKindLabel[a.kind]}</span></div>
                      <div className="flex flex-wrap gap-x-2 text-xs text-muted">
                        <Link className="text-brand hover:underline" href={`/leads/${a.lead_id}`}>{leadName.get(a.lead_id) ?? "Lead"}</Link>
                        {a.location && <span>{a.location}</span>}
                        <span>with {a.assigned_to ? memberName(members.get(a.assigned_to)) : "nobody yet"}</span>
                        {a.source === "manual" && <span>· entered manually</span>}
                      </div>
                    </div>
                    {ctx.can.workCrm ? <AppointmentStatusMenu appointmentId={a.id} status={a.status} /> : <Badge tone={appointmentStatusTone[a.status]}>{appointmentStatusLabel[a.status]}</Badge>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-muted">Calendar sync (Google, Microsoft) arrives in phase 6. Until then, appointments are entered by your team and are not sent as calendar invites.</p>
    </>
  );
}
