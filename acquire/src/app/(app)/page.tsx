import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { startOfDay } from "@/domain/dates";
import { categoryTone, type StageCategory } from "@/domain/labels";
import { Badge, ButtonLink, Card, EmptyState, NotYetAvailable, PageHeader, Stat } from "@/components/ui";

export const metadata: Metadata = { title: "Overview" };

type Metrics = {
  total: number; new_today: number; created_in_range: number; contacted: number; qualified: number; interested: number;
  appointment_booked: number; converted: number; opted_out: number; unassigned: number; follow_ups_due: number;
  by_stage: { stage_id: string; name: string; category: StageCategory; count: number }[];
  by_source: { source_id: string | null; name: string; count: number; qualified: number }[];
};

const RANGES = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days" } as const;

export default async function OverviewPage({ searchParams }: PageProps<"/">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const range = (typeof sp.range === "string" && sp.range in RANGES ? sp.range : "30") as keyof typeof RANGES;
  const now = new Date();
  const from = new Date(now.getTime() - Number(range) * 86_400_000);
  const { data, error } = await ctx.supabase.rpc("lead_metrics", {
    p_org: ctx.org.id, p_from: from.toISOString(), p_to: new Date(now.getTime() + 60_000).toISOString(),
    p_today_start: startOfDay(now, ctx.org.timezone).toISOString(),
  });
  if (error) throw new Error(error.message);
  const m = data as Metrics;
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
  const maxStage = Math.max(1, ...m.by_stage.map((s) => s.count));

  return (
    <>
      <PageHeader
        title="Overview"
        description={ctx.role === "sales_rep" ? "Your assigned leads." : `Acquisition at ${ctx.org.name}. Every figure is counted from your records.`}
        actions={
          <nav className="flex rounded-lg border border-line bg-surface p-0.5 text-sm" aria-label="Date range">
            {Object.entries(RANGES).map(([k, label]) => (
              <Link key={k} href={`/?range=${k}`} aria-current={k === range ? "page" : undefined}
                className={`rounded-md px-3 py-1 ${k === range ? "bg-brand-soft font-medium text-brand" : "text-muted hover:text-ink"}`}>
                {label}
              </Link>
            ))}
          </nav>
        }
      />

      {m.total === 0 ? (
        <EmptyState
          title="No leads yet"
          action={ctx.can.importLeads ? <div className="flex gap-2"><ButtonLink href="/leads/import">Import a CSV</ButtonLink><ButtonLink variant="secondary" href="/leads/new">Add a lead</ButtonLink></div> : undefined}
        >
          Once leads are in, this page shows how many you have, where they came from and how far they have moved through your pipeline.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total leads" value={m.total.toLocaleString()} hint={`${m.created_in_range.toLocaleString()} added in range`} />
            <Stat label="New today" value={m.new_today.toLocaleString()} hint={`Since midnight, ${ctx.org.timezone}`} />
            <Stat label="Qualified" value={m.qualified.toLocaleString()} hint={`${pct(m.qualified, m.total)} of all leads`} />
            <Stat label="Appointment booked" value={m.appointment_booked.toLocaleString()} hint="Leads in that stage now" />
            <Stat label="Converted" value={m.converted.toLocaleString()} tone={m.converted ? "ok" : "default"} hint={`${pct(m.converted, m.total)} of all leads`} />
            <Stat label="Follow-ups overdue" value={m.follow_ups_due.toLocaleString()} tone={m.follow_ups_due ? "warn" : "default"}
              hint={m.follow_ups_due ? <Link className="underline" href="/leads?sort=follow_up">See them</Link> : "Open leads past their follow-up time"} />
            <Stat label="Unassigned" value={m.unassigned.toLocaleString()} tone={m.unassigned ? "warn" : "default"}
              hint={m.unassigned && ctx.can.assignLeads ? <Link className="underline" href="/leads?owner=none">Assign them</Link> : "Open leads with no owner"} />
            <Stat label="Opted out" value={m.opted_out.toLocaleString()} hint="Never contacted automatically" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Leads by stage" actions={<Link href="/pipeline" className="text-sm text-brand">Pipeline →</Link>}>
              <ul className="flex flex-col gap-2" aria-label="Number of leads in each stage">
                {m.by_stage.map((s) => (
                  <li key={s.stage_id} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 text-sm" title={`${s.name}: ${s.count} lead${s.count === 1 ? "" : "s"}`}>
                    <Link href={`/leads?stage=${s.stage_id}`} className="truncate hover:text-brand">{s.name}</Link>
                    <span className="h-2 rounded-r bg-surface-2" aria-hidden>
                      <span className="block h-2 rounded-r bg-chart-1" style={{ width: `${(s.count / maxStage) * 100}%` }} />
                    </span>
                    <span className="tabular text-right text-muted">{s.count}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card title={`Lead sources · ${RANGES[range].toLowerCase()}`}>
              {m.by_source.length === 0 ? (
                <p className="text-sm text-muted">No leads were added in this period.</p>
              ) : (
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

          <details className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium">How these figures are calculated</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li><strong>Qualified</strong>: leads now in a stage whose category is <Badge tone={categoryTone.qualified}>qualified</Badge> or <Badge tone={categoryTone.won}>won</Badge>. Stage categories are set in Settings → Pipeline.</li>
              <li><strong>Converted</strong>: leads now in a <Badge tone={categoryTone.won}>won</Badge> stage. Revenue is not tracked yet.</li>
              <li><strong>Appointment booked</strong>: leads now in the “Appointment booked” stage. Calendar-confirmed appointments arrive in phase 6.</li>
              <li><strong>Lead sources</strong>: leads created in the selected period, grouped by source; the rate is qualified ÷ leads.</li>
              <li>Stage counts are a snapshot of now, not a history. A sales rep sees only their own leads.</li>
            </ul>
          </details>

          <NotYetAvailable phase={4}>
            Contact activity (messages, AI calls, reply rates), campaign spend, cost per lead and cost per appointment appear here once outreach
            and usage metering are built. Until then they are not shown rather than estimated.
          </NotYetAvailable>
        </div>
      )}
    </>
  );
}
