import { getCompanyContext, ROLE_LABELS, type CompanyContext } from "@/lib/workspace";
import { loadMyWork } from "@/lib/dashboard-data";
import { loadHomeVM } from "@/lib/home-data";
import { parsePeriodKey, periodRange } from "@/domain/periods";
import { formatDate, formatDayShort, formatTime, todayInBusinessTz } from "@/domain/dates";
import { designFor } from "@/domain/design";
import { CompanyHome } from "@/views/company-home";
import { loadSetupGuide } from "@/lib/setup-guide";
import { SetupGuideCard } from "@/components/dp/setup-guide";
import { TeamPulse } from "@/components/dp/team-pulse";
import { Glyph } from "@/components/dp/icons";
import { loadPersonStats } from "@/lib/activity";
import { loadMembers } from "@/lib/people";
import { formatShort } from "@/domain/money";
import { Cta, PageHead } from "@/components/dp/shell";
import { Card, Grid, Line, Tile } from "@/components/dp/ui";
import { C } from "@/components/dp/theme";

export default async function CompanyHomePage({ params, searchParams }: PageProps<"/c/[slug]">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const sp = await searchParams;
  if (!ctx.can("dashboard.owner")) return <EmployeeHome ctx={ctx} />;
  // Admin preview: "view as" a team member (their home, their work; read-only, nothing celebrated for them).
  if (typeof sp.as === "string") {
    const members = await loadMembers(ctx.supabase, ctx.company.id);
    const m = members.find((x) => x.user_id === (sp.as === "me" ? ctx.userId : sp.as));
    if (m) return <EmployeeHome ctx={ctx} view={{ userId: m.user_id, name: m.name, role: ROLE_LABELS[m.role] ?? m.role }} />;
  }
  const key = parsePeriodKey(sp.period);
  const period = periodRange(key, todayInBusinessTz(), ctx.company.fy_start_month);
  const [vm, guide] = await Promise.all([loadHomeVM(ctx, period, key), loadSetupGuide(ctx.supabase, ctx.company)]);
  return (
    <>
      <CompanyHome vm={vm} guide={<><TeamPulse db={ctx.supabase} orgs={[{ id: ctx.company.id, name: ctx.company.name }]} userId={ctx.userId} fyStartMonth={ctx.company.fy_start_month} firstName={ctx.displayName} /><SetupGuideCard g={guide} /></>} />
    </>
  );
}

/** Employee home: only work assigned to this person. No company totals, no finance, no group figures. */
async function EmployeeHome({ ctx, view }: { ctx: CompanyContext; view?: { userId: string; name: string; role: string } }) {
  const who = view?.userId ?? ctx.userId;
  const [w, stats, leads] = await Promise.all([
    loadMyWork(ctx, who),
    loadPersonStats(ctx.supabase, [ctx.company.id], [who], ctx.company.fy_start_month),
    ctx.supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", ctx.company.id).eq("owner_id", who).in("lead_status", ["new", "contacted"]).eq("do_not_contact", false),
  ]);
  const me = stats.get(who)!;
  const pct = me.targetMinor ? Math.min(100, Math.round((me.wonMonthMinor / me.targetMinor) * 100)) : 0;
  const d = designFor(ctx.company.slug);
  const base = `/c/${ctx.company.slug}`;
  const stage = new Map(w.stages.map((s) => [s.id, s.name]));
  const overdue = w.tasks.filter((t) => t.due_on && t.due_on < w.today);
  return (
    <>
      {view && (
        <div role="status" style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", background: "#141414", color: "#fff", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 14 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Glyph name="eye" size={16} />Employee view of <b>{view.name}</b> ({view.role}) · read-only preview of what they see on their home</span>
          <a href={base} style={{ color: "#fff", fontWeight: 700 }}>Exit preview ×</a>
        </div>
      )}
      <PageHead own={d.own} treat={view ? `${view.name}'s work only` : "Your assigned work only"} title={`Hello, ${(view?.name ?? ctx.displayName).split(/[\s@]/)[0]}`} right={!view && ctx.can("tasks.write") ? <Cta href={`${base}/meetings?add=task`}>+ Add</Cta> : undefined} />
      <TeamPulse db={ctx.supabase} orgs={[{ id: ctx.company.id, name: ctx.company.name }]} userId={who} fyStartMonth={ctx.company.fy_start_month} firstName={view?.name ?? ctx.displayName} preview={Boolean(view)} />
      <Grid cols="repeat(auto-fit,minmax(170px,1fr))" gap={14} style={{ marginBottom: 20 }}>
        <Tile l="Due today" v={w.tasks.filter((t) => t.due_on === w.today).length} s="Follow-ups for today" href={`${base}/followups`} />
        <Tile l="Overdue" v={overdue.length} s={overdue.length ? "Clear these first" : "All clear"} href={`${base}/followups`} />
        <Tile l="Leads to call" v={leads.count ?? 0} s="On the list or reached out" href={`${base}/outreach`} />
        <Tile l="Meetings ahead" v={w.meetings.length} href={`${base}/meetings`} />
        <Tile l="My open deals" v={w.deals.length} href={`${base}/pipeline`} />
      </Grid>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><b>My target this month</b><span>{me.targetMinor ? `${formatShort(me.wonMonthMinor)} of ${formatShort(me.targetMinor)} · ${pct}%` : `${formatShort(me.wonMonthMinor)} won · no target set yet`}</span></div>
        <div style={{ height: 8, background: C.line2, borderRadius: 4, marginTop: 10, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: "var(--co-btn)" }} /></div>
      </div>
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
