import { getCompanyContext, type CompanyContext } from "@/lib/workspace";
import { loadMyWork } from "@/lib/dashboard-data";
import { loadHomeVM } from "@/lib/home-data";
import { parsePeriodKey, periodRange } from "@/domain/periods";
import { formatDate, formatDayShort, formatTime, todayInBusinessTz } from "@/domain/dates";
import { designFor } from "@/domain/design";
import { CompanyHome } from "@/views/company-home";
import { Cta, PageHead } from "@/components/dp/shell";
import { Card, Grid, Line, Tile } from "@/components/dp/ui";
import { C } from "@/components/dp/theme";

export default async function CompanyHomePage({ params, searchParams }: PageProps<"/c/[slug]">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("dashboard.owner")) return <EmployeeHome ctx={ctx} />;
  const key = parsePeriodKey((await searchParams).period);
  const period = periodRange(key, todayInBusinessTz(), ctx.company.fy_start_month);
  return <CompanyHome vm={await loadHomeVM(ctx, period, key)} />;
}

/** Employee home: only work assigned to this person. No company totals, no finance, no group figures. */
async function EmployeeHome({ ctx }: { ctx: CompanyContext }) {
  const w = await loadMyWork(ctx);
  const d = designFor(ctx.company.slug);
  const base = `/c/${ctx.company.slug}`;
  const stage = new Map(w.stages.map((s) => [s.id, s.name]));
  const overdue = w.tasks.filter((t) => t.due_on && t.due_on < w.today);
  return (
    <>
      <PageHead own={d.own} treat="Your assigned work only" title={`Hello, ${ctx.displayName.split(/[\s@]/)[0]}`} right={ctx.can("tasks.write") ? <Cta href={`${base}/meetings?add=task`}>+ Add</Cta> : undefined} />
      <Grid cols="repeat(auto-fit,minmax(200px,1fr))" gap={14} style={{ marginBottom: 20 }}>
        <Tile l="Overdue tasks" v={overdue.length} s="Past due date" />
        <Tile l="Due today" v={w.tasks.filter((t) => t.due_on === w.today).length} />
        <Tile l="My open deals" v={w.deals.length} href={`${base}/pipeline`} />
        <Tile l="My upcoming meetings" v={w.meetings.length} href={`${base}/meetings`} />
      </Grid>
      <Grid cols="minmax(0,1fr) minmax(0,1fr)">
        <Card title="My tasks">
          {w.tasks.length === 0 ? <div style={{ fontSize: 14, color: C.muted }}>No open tasks assigned to you.</div>
            : w.tasks.slice(0, 12).map((t) => <Line key={t.id} left={t.title} right={formatDate(t.due_on)} strong={false} rightColor={t.due_on && t.due_on < w.today ? C.red : undefined} />)}
        </Card>
        <Card title="My deals and next steps">
          {w.deals.length === 0 ? <div style={{ fontSize: 14, color: C.muted }}>No open deals assigned to you.</div>
            : w.deals.slice(0, 12).map((x) => <Line key={x.id} left={x.title} sub={x.next_action ? `${x.next_action}${x.next_action_on ? ` · ${formatDate(x.next_action_on)}` : ""}` : "No next step set"} right={stage.get(x.stage_id)} strong={false} />)}
        </Card>
        <Card title="My meetings">
          {w.meetings.length === 0 ? <div style={{ fontSize: 14, color: C.muted }}>No upcoming meetings assigned to you.</div>
            : w.meetings.map((m) => <Line key={m.id} left={m.title} right={`${formatDayShort(m.starts_at)} ${formatTime(m.starts_at)}`} strong={false} />)}
        </Card>
      </Grid>
    </>
  );
}
