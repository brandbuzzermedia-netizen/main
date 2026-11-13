import Link from "next/link";
import { getCompanyContext, type CompanyContext } from "@/lib/workspace";
import { loadCompanyDashboard, loadMyWork } from "@/lib/dashboard-data";
import { parsePeriodKey, periodRange } from "@/domain/periods";
import { todayInBusinessTz, formatDate, formatTime, formatDayShort } from "@/domain/dates";
import { formatShort } from "@/domain/money";
import { COMPANY_TEMPLATES, LIFECYCLE } from "@/domain/registry";
import type { DeskItem } from "@/domain/dashboard";
import { CloserDesk, KpiList, NotYet, OwnershipEyebrow, Panel, PeriodTabs, StageBar, type KpiRow } from "@/components/dashboard";
import { Alert, Badge, ButtonLink, PageHeader } from "@/components/ui";

export default async function CompanyHome({ params, searchParams }: PageProps<"/c/[slug]">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("dashboard.owner")) return <EmployeeHome ctx={ctx} />;

  const c = ctx.company;
  const key = parsePeriodKey((await searchParams).period);
  const period = periodRange(key, todayInBusinessTz(), c.fy_start_month);
  const d = await loadCompanyDashboard(ctx, period);
  const base = `/c/${c.slug}`;
  const p = d.pipeline;

  const hrefFor = (k: DeskItem["key"]) => ({
    meetings: `${base}/meetings`,
    hot: `${base}/pipeline?view=hot`,
    proposals: `${base}/pipeline?view=proposals`,
    overdue_followups: `${base}/tasks?view=overdue`,
    stalled: `${base}/pipeline?view=stalled`,
    collections: `/switch?to=${c.slug}&next=${encodeURIComponent("/invoices?view=overdue")}`,
  })[k];

  const kpis: KpiRow[] = [
    {
      label: "Open pipeline", value: formatShort(p.openValueMinor), href: `${base}/pipeline`,
      sub: `${p.openCount} open deal${p.openCount === 1 ? "" : "s"} · ${p.probabilitiesSet ? `weighted ${formatShort(p.weightedMinor)}` : "set stage probabilities for a weighted forecast"}`,
    },
    { label: `Won · ${period.label}`, value: formatShort(p.won.valueMinor), sub: `${p.won.count} deal${p.won.count === 1 ? "" : "s"} closed won` },
    { label: "Meetings this week", value: d.meetingsThisWeek, href: `${base}/meetings` },
    { label: "Overdue tasks", value: d.overdueTasks, href: `${base}/tasks?view=overdue`, tone: d.overdueTasks ? "danger" : undefined },
  ];
  if (d.finance) {
    kpis.push(
      { label: `Invoiced · ${period.label}`, value: formatShort(d.finance.invoicedMinor), sub: "Booked (accrual), incl. GST" },
      { label: `Cash received · ${period.label}`, value: formatShort(d.finance.cashReceivedMinor), sub: "Verified receipts less refunds (cash)" },
      { label: "Receivables", value: formatShort(d.finance.receivablesMinor), sub: d.finance.overdueMinor ? `${formatShort(d.finance.overdueMinor)} overdue` : "Nothing overdue",
        tone: d.finance.overdueMinor ? "danger" : undefined, href: `/switch?to=${c.slug}&next=/invoices` },
    );
  }

  const template = COMPANY_TEMPLATES.find((t) => t.slug === c.slug);
  const needsSetup = c.lifecycle_status !== "active";

  return (
    <>
      <PageHeader
        eyebrow={<OwnershipEyebrow ownership={c.ownership_type} consolidation={c.consolidation} />}
        title={c.name}
        description={`${period.label} · figures from recorded deals, meetings, tasks${d.finance ? " and the finance ledger" : ""}.`}
        actions={
          <>
            <PeriodTabs current={key} basePath={base} />
            {ctx.can("crm.write") && <ButtonLink href={`${base}/pipeline/new`} variant="company">+ New deal</ButtonLink>}
          </>
        }
      />

      {needsSetup && (
        <section className="mb-5 max-w-3xl rounded-2xl border border-dashed border-[#cfc8b5] bg-surface p-7">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-[26px]">{LIFECYCLE[c.lifecycle_status]}</h2>
          </div>
          <p className="mt-1.5 mb-4 leading-relaxed text-muted">Nothing is assumed for this workspace. These steps unlock its dashboards:</p>
          <ul>
            {(template?.setup ?? ["Set ownership and consolidation treatment", "Choose the modules to enable", "Invite the first team member"]).map((s) => (
              <li key={s} className="flex items-center gap-3 border-t border-line-2 py-2.5 text-[14.5px]">
                <span className="size-[22px] flex-none rounded-full border-[1.5px] border-faint" aria-hidden />{s}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <CloserDesk items={d.desk} hrefFor={hrefFor}
            emptyHint={d.crm.deals.length === 0
              ? <>No open deals yet. <Link className="underline" href={`${base}/pipeline/new`}>Add the first deal</Link>; meetings, hot deals, proposals, stalled deals and overdue collections will be ranked here.</>
              : "Nothing needs your decision right now."} />
          <StageBar pipeline={p} href={`${base}/pipeline`} />
          {p.otherCurrencyOpen > 0 && (
            <Alert tone="info">{p.otherCurrencyOpen} open deal(s) in another currency are counted by stage but not added to {c.base_currency} totals.</Alert>
          )}
        </div>
        <div className="flex flex-col gap-5">
          <KpiList rows={kpis} />
          <section className="rounded-2xl bg-co-side p-6 text-[#F5F1E8]">
            <div className="text-[13px] text-white/65">Automation (n8n)</div>
            <div className="my-1.5 font-display text-[30px]">Not connected</div>
            <p className="text-sm text-white/80">
              Workflow library, approvals and run history arrive in build phase 8. Nothing runs automatically for {c.short_name ?? c.name} yet
              {c.emergency_stop ? ", and the emergency stop is on." : "."}
            </p>
          </section>
          <Panel title="Today" aside={formatDate(d.today)}>
            {d.todaysMeetings.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted">
                No meetings today. Calendar sync needs a connected calendar (later phase); <Link className="underline" href={`${base}/meetings`}>add a meeting</Link> manually.
              </p>
            ) : (
              <ul>
                {d.todaysMeetings.map((m) => (
                  <li key={m.id} className="flex gap-3 border-t border-line-2 py-2.5 text-sm">
                    <span className="tabular w-16 flex-none font-semibold">{formatTime(m.starts_at)}</span>
                    <span className="min-w-0 truncate">{m.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
      {!d.finance && (
        <p className="mt-6 text-xs text-muted">Finance figures are hidden because your role in {c.name} does not include finance access.</p>
      )}
    </>
  );
}

/** Employee home: assigned work only. No company totals, no finance, no group figures. */
async function EmployeeHome({ ctx }: { ctx: CompanyContext }) {
  const w = await loadMyWork(ctx);
  const base = `/c/${ctx.company.slug}`;
  const stageName = new Map(w.stages.map((s) => [s.id, s.name]));
  const overdue = w.tasks.filter((t) => t.due_on && t.due_on < w.today);
  const dueToday = w.tasks.filter((t) => t.due_on === w.today);
  return (
    <>
      <PageHeader
        title={`Hello, ${ctx.displayName.split(/[\s@]/)[0]}`}
        description={`Your work in ${ctx.company.name}. You see only records assigned to you or shared with you.`}
        actions={ctx.can("tasks.write") && <ButtonLink href={`${base}/tasks#new`} variant="company">+ New task</ButtonLink>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi label="Overdue tasks" value={overdue.length} danger={overdue.length > 0} />
        <Kpi label="Due today" value={dueToday.length} />
        <Kpi label="My open deals" value={w.deals.length} />
        <Kpi label="My upcoming meetings" value={w.meetings.length} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="My tasks" aside={<Link className="hover:underline" href={`${base}/tasks`}>All tasks</Link>}>
          {w.tasks.length === 0 ? <p className="text-sm text-muted">No open tasks assigned to you.</p> : (
            <ul>
              {w.tasks.slice(0, 12).map((t) => (
                <li key={t.id} className="flex items-center gap-3 border-t border-line-2 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  {t.due_on && <Badge tone={t.due_on < w.today ? "danger" : t.due_on === w.today ? "warn" : "neutral"}>{formatDate(t.due_on)}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="My deals and next steps" aside={<Link className="hover:underline" href={`${base}/pipeline`}>Pipeline</Link>}>
          {w.deals.length === 0 ? <p className="text-sm text-muted">No open deals assigned to you.</p> : (
            <ul>
              {w.deals.slice(0, 12).map((d) => (
                <li key={d.id} className="border-t border-line-2 py-2.5 text-sm">
                  <div className="flex justify-between gap-3"><span className="truncate font-semibold">{d.title}</span><span className="text-muted">{stageName.get(d.stage_id)}</span></div>
                  <div className="text-[13px] text-muted">{d.next_action ? `${d.next_action}${d.next_action_on ? ` · ${formatDate(d.next_action_on)}` : ""}` : <NotYet>No next step set</NotYet>}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="My meetings">
          {w.meetings.length === 0 ? <p className="text-sm text-muted">No upcoming meetings assigned to you.</p> : (
            <ul>
              {w.meetings.map((m) => (
                <li key={m.id} className="flex gap-3 border-t border-line-2 py-2.5 text-sm">
                  <span className="tabular w-28 flex-none font-semibold">{formatDayShort(m.starts_at)} {formatTime(m.starts_at)}</span>
                  <span className="truncate">{m.title}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function Kpi({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface px-[18px] py-4">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`tabular mt-1.5 font-display text-[28px] leading-tight ${danger ? "text-danger" : ""}`}>{value}</div>
    </div>
  );
}
