import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { loadLeadContext, memberName } from "@/lib/leads";
import type { Appointment, Task } from "@/lib/db-types";
import { formatDateTime, startOfDay } from "@/domain/dates";
import { appointmentKindLabel, categoryTone, interactionLabel, INTERACTION_KINDS, type StageCategory } from "@/domain/labels";
import { formatMoney } from "@/domain/money";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Stat, cx } from "@/components/ui";
import { BarList, ColumnChart } from "@/components/charts";
import { TaskToggle } from "@/components/crm/controls";

export const metadata: Metadata = { title: "Dashboard" };

type LeadMetrics = {
  total: number; new_today: number; qualified: number; converted: number; opted_out: number; unassigned: number; follow_ups_due: number;
  by_stage: { stage_id: string; name: string; category: StageCategory; count: number }[];
  by_source: { source_id: string | null; name: string; count: number; qualified: number }[];
};

type CrmMetrics = {
  currency: string;
  leads_created: number;
  leads_series: { day: string; count: number }[];
  contacted_leads: number;
  interactions: Partial<Record<string, number>>;
  cohort_with_appointment: number;
  appointments_booked: number; appointments_held: number; appointments_no_show: number; appointments_upcoming: number;
  open_deals: number; pipeline_value: number; open_commission: number; weighted_commission: number;
  won_count: number; won_value: number; won_commission: number; lost_count: number; avg_days_to_close: number | null;
  other_currency_deals: number;
  deals_by_stage: { stage_id: string; name: string; count: number; value: number }[];
  tasks_overdue: number;
  leaderboard: { user_id: string; name: string | null; open_leads: number; interactions: number; appointments_held: number; deals_won: number; won_commission: number }[];
};

const RANGES = { "7": "7 days", "30": "30 days", "90": "90 days" } as const;

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const range = (typeof sp.range === "string" && sp.range in RANGES ? sp.range : "30") as keyof typeof RANGES;
  const tz = ctx.org.timezone;
  const now = new Date();
  const todayStart = startOfDay(now, tz);
  // The range is whole days in the workspace time zone, ending today.
  const from = new Date(todayStart.getTime() - (Number(range) - 1) * 86_400_000);
  const to = new Date(todayStart.getTime() + 86_400_000);
  const tomorrowEnd = new Date(to.getTime() + 86_400_000);

  const [lm, cm, tasks, appts, ref] = await Promise.all([
    ctx.supabase.rpc("lead_metrics", { p_org: ctx.org.id, p_from: from.toISOString(), p_to: to.toISOString(), p_today_start: todayStart.toISOString() }),
    ctx.supabase.rpc("crm_dashboard", { p_org: ctx.org.id, p_from: from.toISOString(), p_to: to.toISOString() }),
    ctx.supabase.from("tasks").select("id, lead_id, deal_id, title, notes, due_at, priority, status, assignee_id, completed_at, created_at")
      .eq("organization_id", ctx.org.id).eq("assignee_id", ctx.userId).eq("status", "open").lt("due_at", tomorrowEnd.toISOString())
      .order("due_at").limit(8),
    ctx.supabase.from("appointments").select("id, lead_id, deal_id, kind, title, starts_at, ends_at, location, status, assigned_to, source, notes")
      .eq("organization_id", ctx.org.id).eq("status", "scheduled").gte("starts_at", now.toISOString()).order("starts_at").limit(6),
    loadLeadContext(ctx),
  ]);
  for (const r of [lm, cm, tasks, appts]) if (r.error) throw new Error(r.error.message);
  const m = lm.data as LeadMetrics;
  const c = cm.data as CrmMetrics;
  const myTasks = (tasks.data ?? []) as Task[];
  const upcoming = (appts.data ?? []) as Appointment[];
  const leadIds = [...new Set([...myTasks.map((t) => t.lead_id), ...upcoming.map((a) => a.lead_id)].filter(Boolean))] as string[];
  const { data: leadRows } = leadIds.length ? await ctx.supabase.from("leads").select("id, full_name").in("id", leadIds) : { data: [] };
  const leadName = new Map((leadRows ?? []).map((l) => [l.id, l.full_name]));
  const members = new Map(ref.members.map((x) => [x.user_id, x]));

  const cur = c.currency;
  const money = (v: number) => formatMoney(v, cur, { compact: true });
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
  const closed = c.won_count + c.lost_count;
  const dayLabel = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const interactionsTotal = INTERACTION_KINDS.reduce((t, k) => t + (c.interactions[k] ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={ctx.role === "sales_rep" ? "Your leads, deals and appointments." : `${ctx.org.name} · every figure is counted from your records.`}
        actions={
          <nav className="flex rounded-lg border border-line bg-surface p-0.5 text-sm" aria-label="Date range">
            {Object.entries(RANGES).map(([k, label]) => (
              <Link key={k} href={`/?range=${k}`} aria-current={k === range ? "page" : undefined}
                className={cx("rounded-md px-3 py-1", k === range ? "bg-brand-soft font-medium text-brand" : "text-muted hover:text-ink")}>
                Last {label}
              </Link>
            ))}
          </nav>
        }
      />

      {m.total === 0 ? (
        <EmptyState
          title="Your CRM is empty"
          action={ctx.can.importLeads ? <div className="flex gap-2"><ButtonLink href="/leads/import">Import a CSV</ButtonLink><ButtonLink variant="secondary" href="/leads/new">Add a lead</ButtonLink></div> : undefined}
        >
          Add leads to start. The dashboard then tracks new leads, contact activity, appointments, deals and revenue as your team works them.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Stat label="New leads" value={c.leads_created.toLocaleString()} hint={`${m.new_today} today · ${m.total.toLocaleString()} total`} />
            <Stat label="Leads contacted" value={c.contacted_leads.toLocaleString()} hint={`${interactionsTotal} interactions logged`} />
            <Stat label="Appointments booked" value={c.appointments_booked.toLocaleString()} hint={`${c.appointments_upcoming} upcoming`} />
            <Stat label="Appointments held" value={c.appointments_held.toLocaleString()}
              hint={c.appointments_held + c.appointments_no_show > 0 ? `${pct(c.appointments_no_show, c.appointments_held + c.appointments_no_show)} no-show` : "No outcomes yet"} />
            <Stat label="Deals won" value={c.won_count.toLocaleString()} tone={c.won_count ? "ok" : "default"} hint={`${money(c.won_commission)} commission`} />
            <Stat label="Open pipeline" value={money(c.pipeline_value)} hint={`${c.open_deals} deals · ${money(c.weighted_commission)} weighted`} />
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title={`New leads per day · last ${RANGES[range]}`} className="lg:col-span-2">
              <ColumnChart unit="leads" points={c.leads_series.map((p) => ({ key: p.day, label: dayLabel(p.day), value: p.count }))} />
            </Card>
            <Card title="Conversion">
              <div className="flex flex-col gap-3 text-sm">
                <Rate label="New leads with an appointment" value={pct(c.cohort_with_appointment, c.leads_created)} detail={`${c.cohort_with_appointment} of ${c.leads_created} added in range`} />
                <Rate label="Win rate" value={pct(c.won_count, closed)} detail={closed ? `${c.won_count} won, ${c.lost_count} lost` : "No deals closed in range"} />
                <Rate label="Average days to close" value={c.avg_days_to_close !== null ? String(c.avg_days_to_close) : "—"} detail="Won deals, opened to closed" />
                <Rate label="Won property value" value={money(c.won_value)} detail={`Commission ${money(c.won_commission)}`} />
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="My tasks · due by tomorrow" actions={<Link href="/tasks" className="text-sm text-brand">All tasks →</Link>}>
              {myTasks.length === 0 ? <p className="text-sm text-muted">Nothing due. {c.tasks_overdue > 0 && ctx.role !== "sales_rep" && `${c.tasks_overdue} overdue across the team.`}</p> : (
                <ul className="flex flex-col divide-y divide-line text-sm">
                  {myTasks.map((t) => (
                    <li key={t.id} className="flex items-start gap-3 py-2">
                      <TaskToggle taskId={t.id} done={false} title={t.title} />
                      <div className="min-w-0 flex-1">
                        <div>{t.title}</div>
                        <div className="text-xs text-muted">
                          <span className={t.due_at && new Date(t.due_at) < now ? "text-danger" : undefined}>{formatDateTime(t.due_at, tz)}</span>
                          {t.lead_id && <> · <Link className="text-brand hover:underline" href={`/leads/${t.lead_id}`}>{leadName.get(t.lead_id) ?? "Lead"}</Link></>}
                        </div>
                      </div>
                      {t.priority === "high" && <Badge tone="danger">High</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Upcoming appointments" actions={<Link href="/appointments" className="text-sm text-brand">Calendar →</Link>}>
              {upcoming.length === 0 ? <p className="text-sm text-muted">Nothing booked. Book viewings and valuations from a lead&apos;s page.</p> : (
                <ul className="flex flex-col divide-y divide-line text-sm">
                  {upcoming.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate">{a.title}</div>
                        <div className="text-xs text-muted">
                          <Link className="text-brand hover:underline" href={`/leads/${a.lead_id}`}>{leadName.get(a.lead_id) ?? "Lead"}</Link>
                          {a.assigned_to && ` · ${memberName(members.get(a.assigned_to))}`}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <div className="tabular">{formatDateTime(a.starts_at, tz)}</div>
                        <div className="text-muted">{appointmentKindLabel[a.kind]}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Leads by stage · now" actions={<Link href="/pipeline" className="text-sm text-brand">Pipeline →</Link>}>
              <BarList rows={m.by_stage.filter((s) => s.category !== "opted_out" || s.count > 0).map((s) => ({
                key: s.stage_id,
                label: <Link href={`/leads?stage=${s.stage_id}`} className="hover:text-brand"><span className="sr-only">{s.category} </span>{s.name}</Link>,
                value: s.count, display: String(s.count), title: `${s.name}: ${s.count} lead${s.count === 1 ? "" : "s"}`,
              }))} />
            </Card>
            <Card title={`Deal pipeline · ${cur} value by stage`} actions={<Link href="/deals" className="text-sm text-brand">Deals →</Link>}>
              {c.open_deals === 0 ? <p className="text-sm text-muted">No open deals. Open one from a lead&apos;s page when they are ready to transact.</p> : (
                <BarList rows={c.deals_by_stage.map((s) => ({
                  key: s.stage_id, label: s.name, value: s.value, display: `${money(s.value)} · ${s.count}`, title: `${s.name}: ${s.count} deals, ${formatMoney(s.value, cur)}`,
                }))} />
              )}
              {c.other_currency_deals > 0 && <p className="mt-3 text-xs text-muted">{c.other_currency_deals} deal(s) in other currencies are not included in these totals.</p>}
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={`Contact activity · last ${RANGES[range]}`}>
              {interactionsTotal === 0 ? <p className="text-sm text-muted">No calls, emails or meetings logged in this period. Log them from a lead&apos;s page.</p> : (
                <BarList rows={INTERACTION_KINDS.map((k) => ({ key: k, label: interactionLabel[k], value: c.interactions[k] ?? 0, display: String(c.interactions[k] ?? 0), title: `${interactionLabel[k]}: ${c.interactions[k] ?? 0}` }))} />
              )}
            </Card>
            <Card title={`Lead sources · last ${RANGES[range]}`}>
              {m.by_source.length === 0 ? <p className="text-sm text-muted">No leads were added in this period.</p> : (
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted">
                    <tr><th className="pb-2 text-left font-medium">Source</th><th className="pb-2 text-right font-medium">Leads</th><th className="pb-2 text-right font-medium">Qualified</th><th className="pb-2 text-right font-medium">Rate</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {m.by_source.map((s) => (
                      <tr key={s.source_id ?? "none"}>
                        <td className="py-2">{s.source_id ? <Link className="hover:text-brand" href={`/leads?source=${s.source_id}`}>{s.name}</Link> : s.name}</td>
                        <td className="tabular py-2 text-right">{s.count}</td>
                        <td className="tabular py-2 text-right">{s.qualified}</td>
                        <td className="tabular py-2 text-right text-muted">{pct(s.qualified, s.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          {ctx.role !== "sales_rep" && c.leaderboard.length > 0 && (
            <Card title={`Team · last ${RANGES[range]}`}>
              <div className="-m-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-muted">
                    <tr>
                      {["Person", "Open leads", "Interactions", "Appointments held", "Deals won", "Commission won"].map((h, i) => (
                        <th key={h} className={cx("px-4 py-2.5 font-medium", i === 0 ? "text-left" : "text-right")}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {c.leaderboard.map((r) => (
                      <tr key={r.user_id}>
                        <td className="px-4 py-2.5">{r.name ?? "Unknown"}{r.user_id === ctx.userId && <span className="text-muted"> (you)</span>}</td>
                        <td className="tabular px-4 py-2.5 text-right">{r.open_leads}</td>
                        <td className="tabular px-4 py-2.5 text-right">{r.interactions}</td>
                        <td className="tabular px-4 py-2.5 text-right">{r.appointments_held}</td>
                        <td className="tabular px-4 py-2.5 text-right">{r.deals_won}</td>
                        <td className="tabular px-4 py-2.5 text-right">{money(r.won_commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <section aria-label="Needs attention" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Follow-ups overdue" value={m.follow_ups_due} tone={m.follow_ups_due ? "warn" : "default"}
              hint={m.follow_ups_due ? <Link className="underline" href="/leads?sort=follow_up">See them</Link> : "Leads past their follow-up time"} />
            <Stat label="Tasks overdue" value={c.tasks_overdue} tone={c.tasks_overdue ? "warn" : "default"} hint={<Link className="underline" href="/tasks">Open tasks</Link>} />
            <Stat label="Unassigned leads" value={m.unassigned} tone={m.unassigned ? "warn" : "default"}
              hint={m.unassigned && ctx.can.assignLeads ? <Link className="underline" href="/leads?owner=none">Assign them</Link> : "Open leads with no owner"} />
            <Stat label="Opted out" value={m.opted_out} hint="Never contacted automatically" />
          </section>

          <details className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium">How these figures are calculated</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li>The range is whole days in {tz}, ending today. <strong>New leads</strong> counts leads created in the range.</li>
              <li><strong>Leads contacted</strong>: distinct leads with an outbound call, email, SMS or WhatsApp, or a meeting, logged in the range.</li>
              <li><strong>Appointments booked</strong>: appointments created in the range. <strong>Held</strong> and no-show use the outcome recorded after the appointment, by its start time.</li>
              <li><strong>New leads with an appointment</strong>: of the leads created in the range, how many have any appointment that is not cancelled.</li>
              <li><strong>Deals won / win rate</strong>: deals that entered a <Badge tone={categoryTone.won}>won</Badge> or lost stage in the range. Money totals include {cur} deals only.</li>
              <li><strong>Weighted</strong> commission multiplies each open deal&apos;s commission by its stage probability (Settings → Pipeline).</li>
              <li>Commission is what your team entered on each deal. It is not reconciled with invoices or payments.</li>
              <li>A sales rep&apos;s dashboard counts only their own leads, deals, tasks and appointments.</li>
            </ul>
          </details>
        </div>
      )}
    </>
  );
}

function Rate({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div>{label}</div>
        <div className="text-xs text-muted">{detail}</div>
      </div>
      <div className="tabular text-xl font-semibold">{value}</div>
    </div>
  );
}
