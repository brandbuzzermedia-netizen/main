import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { loadLeadContext, memberName } from "@/lib/leads";
import type { Activity, Appointment, ConsentRecord, Deal, Lead, OrgSettings, Suppression, Task } from "@/lib/db-types";
import { DEAL_COLUMNS, loadDealStages } from "@/lib/crm";
import { AppointmentForm, AppointmentStatusMenu, InteractionForm, TaskForm, TaskToggle } from "@/components/crm/controls";
import { appointmentKindLabel, appointmentStatusLabel, appointmentStatusTone, dealCategoryTone } from "@/domain/labels";
import { formatMoney } from "@/domain/money";
import { CHANNELS, evaluateEligibility, type Channel, type Decision } from "@/domain/eligibility";
import { basisLabel, categoryTone, channelLabel, segmentLabel, suppressionReasonLabel, timelineLabel } from "@/domain/labels";
import { formatBudget } from "@/domain/money";
import { formatDate, formatDateTime } from "@/domain/dates";
import { Badge, ButtonLink, Card, Dl, PageHeader, Select } from "@/components/ui";
import { assignAction, liftSuppressionAction, setStageAction } from "../actions";
import { ConsentForm, EraseForm, NoteForm, SuppressForm } from "./forms";

export const metadata: Metadata = { title: "Lead" };

const decisionTone: Record<Decision, "ok" | "info" | "warn" | "danger"> = { allow: "ok", defer: "info", review: "warn", block: "danger" };
const decisionLabel: Record<Decision, string> = { allow: "Allowed", defer: "Not now", review: "Needs review", block: "Blocked" };

export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  const { data: leadRow } = await ctx.supabase.from("leads").select("*").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!leadRow) notFound();
  const lead = leadRow as Lead;

  const valueFilters = [
    lead.email && `and(value_type.eq.email,value.eq."${lead.email.toLowerCase().replace(/"/g, "")}")`,
    lead.phone_e164 && `and(value_type.eq.phone,value.eq.${lead.phone_e164})`,
  ].filter(Boolean) as string[];

  const [ref, activities, consents, suppressions, settings, deals, tasks, appts, dealStages] = await Promise.all([
    loadLeadContext(ctx),
    ctx.supabase.from("lead_activities").select("id, kind, summary, data, actor_id, occurred_at").eq("lead_id", id).order("occurred_at", { ascending: false }).limit(100),
    ctx.supabase.from("consent_records").select("id, channel, status, basis, source, evidence_url, captured_at, expires_at, recorded_by").eq("lead_id", id).order("captured_at", { ascending: false }),
    ctx.supabase.from("suppression_entries").select("id, value_type, value, channel, reason, source, created_at").eq("organization_id", ctx.org.id).or(valueFilters.join(",")),
    ctx.supabase.from("organization_settings").select("*").eq("organization_id", ctx.org.id).single(),
    ctx.supabase.from("deals").select(DEAL_COLUMNS).eq("lead_id", id).order("created_at", { ascending: false }),
    ctx.supabase.from("tasks").select("id, lead_id, deal_id, title, notes, due_at, priority, status, assignee_id, completed_at, created_at").eq("lead_id", id)
      .neq("status", "cancelled").order("status").order("due_at", { ascending: true, nullsFirst: false }).limit(50),
    ctx.supabase.from("appointments").select("id, lead_id, deal_id, kind, title, starts_at, ends_at, location, status, assigned_to, source, notes").eq("lead_id", id).order("starts_at", { ascending: false }).limit(20),
    loadDealStages(ctx),
  ]);
  for (const r of [deals, tasks, appts]) if (r.error) throw new Error(r.error.message);
  const leadDeals = (deals.data ?? []) as unknown as Deal[];
  const leadTasks = (tasks.data ?? []) as Task[];
  const leadAppts = (appts.data ?? []) as Appointment[];
  const dealStageById = new Map(dealStages.map((s) => [s.id, s]));
  for (const r of [activities, consents, suppressions, settings]) if (r.error) throw new Error(r.error.message);
  const timeline = (activities.data ?? []) as Activity[];
  const consentRows = (consents.data ?? []) as ConsentRecord[];
  const suppressed = (suppressions.data ?? []) as Suppression[];
  const policy = settings.data as OrgSettings;

  const stage = ref.stages.find((s) => s.id === lead.stage_id);
  const memberById = new Map(ref.members.map((m) => [m.user_id, m]));
  const source = ref.sources.find((s) => s.id === lead.source_id);
  const canEdit = ctx.can.assignLeads || (ctx.role === "sales_rep" && lead.owner_id === ctx.userId);
  const memberOptions = ref.members.map((m) => ({ id: m.user_id, label: memberName(m) }));
  const now = new Date();

  const eligibility = CHANNELS.map((channel) => {
    const latest = consentRows.find((c) => c.channel === channel);
    const valueType = channel === "email" ? "email" : "phone";
    return {
      channel,
      result: evaluateEligibility({
        channel,
        country: lead.country,
        timezone: lead.timezone,
        hasContactValue: Boolean(valueType === "email" ? lead.email : lead.phone_e164),
        suppressed: suppressed.some((s) => s.value_type === valueType && (s.channel === null || s.channel === channel)),
        optedOutStage: stage?.category === "opted_out",
        consent: latest && { status: latest.status, basis: latest.basis, capturedAt: new Date(latest.captured_at), expiresAt: latest.expires_at ? new Date(latest.expires_at) : null },
        now,
        orgWindow: { start: policy.contact_window_start.slice(0, 5), end: policy.contact_window_end.slice(0, 5) },
        impliedInquiryDays: policy.implied_inquiry_days,
      }),
    };
  });

  return (
    <>
      <div className="mb-2 text-sm"><Link href="/leads" className="text-muted hover:text-ink">← Leads</Link></div>
      <PageHeader
        title={lead.full_name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {stage && <Badge tone={categoryTone[stage.category]}>{stage.name}</Badge>}
            <span>{segmentLabel[lead.segment]}</span>
            {lead.score !== null && <span>· Score {lead.score}</span>}
            <span>· Added {formatDate(lead.created_at, ctx.org.timezone)}</span>
          </span>
        }
        actions={canEdit ? <ButtonLink variant="secondary" href={`/leads/${lead.id}/edit`}>Edit</ButtonLink> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <Card title="Details">
            <Dl items={[
              ["Email", lead.email],
              ["Phone", lead.phone_e164],
              ["Country", lead.country],
              ["Time zone", lead.timezone ?? <span className="text-warn">Unknown: calls and texts need review</span>],
              ["Looking for", lead.property_interest],
              ["Property type", lead.property_type],
              ["Preferred location", lead.preferred_location],
              ["Budget", formatBudget(lead.budget_min_minor, lead.budget_max_minor, lead.currency)],
              ["Timeline", timelineLabel[lead.timeline]],
              ["Source", source ? source.name : null],
              ["Owner", lead.owner_id ? memberName(memberById.get(lead.owner_id)) : "Unassigned"],
              ["Next follow-up", lead.next_follow_up_at ? formatDateTime(lead.next_follow_up_at, ctx.org.timezone) : null],
              ["Last contacted", lead.last_contacted_at ? formatDateTime(lead.last_contacted_at, ctx.org.timezone) : "Never"],
              ["Tags", lead.tags.length ? <span className="flex flex-wrap gap-1">{lead.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> : null],
            ]} />
            {Object.keys(lead.custom_fields).length > 0 && (
              <div className="mt-4 border-t border-line pt-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Custom fields</div>
                <Dl items={Object.entries(lead.custom_fields).map(([k, v]) => [k.replaceAll("_", " "), String(v)])} />
              </div>
            )}
            {lead.notes && <p className="mt-4 border-t border-line pt-4 text-sm whitespace-pre-wrap">{lead.notes}</p>}
          </Card>

          {canEdit && (
            <Card title="Move and assign">
              <div className="flex flex-col gap-3 sm:flex-row">
                <form action={setStageAction.bind(null, lead.id)} className="flex flex-1 gap-2">
                  <label htmlFor="stage_id" className="sr-only">Stage</label>
                  <Select name="stage_id" defaultValue={lead.stage_id}>
                    {ref.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                  <button className="rounded-lg border border-line px-3 text-sm hover:bg-surface-2">Move</button>
                </form>
                {ctx.can.assignLeads && (
                  <form action={assignAction.bind(null, lead.id)} className="flex flex-1 gap-2">
                    <label htmlFor="owner_id" className="sr-only">Owner</label>
                    <Select name="owner_id" defaultValue={lead.owner_id ?? ""}>
                      <option value="">Unassigned</option>
                      {ref.members.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}
                    </Select>
                    <button className="rounded-lg border border-line px-3 text-sm hover:bg-surface-2">Assign</button>
                  </form>
                )}
              </div>
            </Card>
          )}

          {canEdit && (
            <Card title="Log an interaction">
              <InteractionForm leadId={lead.id} blockedChannels={eligibility.filter((x) => x.result.decision === "block").map((x) => x.channel)} />
            </Card>
          )}

          <Card title="Deals" actions={canEdit ? <ButtonLink variant="secondary" href={`/deals/new?lead=${lead.id}`}>Open a deal</ButtonLink> : undefined}>
            {leadDeals.length === 0 ? <p className="text-sm text-muted">No deals yet.</p> : (
              <ul className="flex flex-col divide-y divide-line text-sm">
                {leadDeals.map((d) => {
                  const ds = dealStageById.get(d.stage_id);
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`/deals/${d.id}`} className="font-medium hover:text-brand">{d.title}</Link>
                      <span className="flex items-center gap-2">
                        <span className="tabular text-muted">{formatMoney(d.value_minor, d.currency, { compact: true })}</span>
                        {ds && <Badge tone={dealCategoryTone[ds.category]}>{ds.name}</Badge>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Tasks">
            {leadTasks.length === 0 ? <p className="mb-3 text-sm text-muted">No tasks.</p> : (
              <ul className="mb-4 flex flex-col divide-y divide-line text-sm">
                {leadTasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 py-2">
                    {canEdit ? <TaskToggle taskId={t.id} done={t.status === "done"} title={t.title} /> : null}
                    <div className="min-w-0 flex-1">
                      <div className={t.status === "done" ? "text-muted line-through" : undefined}>{t.title}</div>
                      <div className="text-xs text-muted">
                        {t.due_at && <span className={t.status === "open" && new Date(t.due_at) < now ? "text-danger" : undefined}>Due {formatDateTime(t.due_at, ctx.org.timezone)} · </span>}
                        {t.assignee_id ? memberName(memberById.get(t.assignee_id)) : "Unassigned"}
                      </div>
                    </div>
                    {t.priority === "high" && <Badge tone="danger">High</Badge>}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && <TaskForm leadId={lead.id} members={memberOptions} canAssign={ctx.can.assignLeads} />}
          </Card>

          <Card title="Appointments">
            {leadAppts.length === 0 ? <p className="mb-3 text-sm text-muted">None booked.</p> : (
              <ul className="mb-4 flex flex-col divide-y divide-line text-sm">
                {leadAppts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <div className="font-medium">{a.title} <span className="font-normal text-muted">· {appointmentKindLabel[a.kind]}</span></div>
                      <div className="text-xs text-muted">{formatDateTime(a.starts_at, ctx.org.timezone)}{a.location && ` · ${a.location}`}</div>
                    </div>
                    {canEdit ? <AppointmentStatusMenu appointmentId={a.id} status={a.status} /> : <Badge tone={appointmentStatusTone[a.status]}>{appointmentStatusLabel[a.status]}</Badge>}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && <AppointmentForm leadId={lead.id} members={memberOptions} canAssign={ctx.can.assignLeads} defaultTitle={`Viewing with ${lead.full_name}`} />}
          </Card>

          <Card title="Activity">
            {canEdit && <NoteForm leadId={lead.id} />}
            <ol className="mt-4 flex flex-col gap-3">
              {timeline.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand/60" aria-hidden />
                  <div className="min-w-0">
                    <div className={a.kind === "note" ? "whitespace-pre-wrap" : undefined}>{a.summary}</div>
                    <div className="text-xs text-muted">
                      {formatDateTime(a.occurred_at, ctx.org.timezone)} · {a.actor_id ? memberName(memberById.get(a.actor_id)) : "System"}
                      {a.kind === "note" && " · note"}
                      {["call", "email", "sms", "whatsapp", "meeting"].includes(a.kind) && (
                        <> · {a.kind}{typeof a.data.direction === "string" && ` ${a.data.direction}`}{typeof a.data.outcome === "string" && ` · ${a.data.outcome.replaceAll("_", " ")}`}</>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Can we contact them?">
            <p className="mb-3 text-xs text-muted">
              Checked now against suppression, recorded consent, the rules for {lead.country ?? "an unknown country"} and calling hours.
              Automated outreach will run the same check before every message or call. Decision support, not legal advice.
            </p>
            <ul className="flex flex-col divide-y divide-line">
              {eligibility.map(({ channel, result }) => (
                <li key={channel} className="py-2.5">
                  <details>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm">
                      <span>{channelLabel[channel as Channel]}</span>
                      <Badge tone={decisionTone[result.decision]}>{decisionLabel[result.decision]}</Badge>
                    </summary>
                    <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                      {result.reasons.length === 0 && <li>A sufficient basis is recorded and it is within contact hours.</li>}
                      {result.reasons.map((r) => <li key={r.code}>{r.message}</li>)}
                      {result.notBefore && <li>Earliest: {formatDateTime(result.notBefore.toISOString(), lead.timezone ?? "UTC")} their time.</li>}
                    </ul>
                    <p className="mt-2 text-xs text-muted">{result.basisNote}</p>
                  </details>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted">Rules version {eligibility[0].result.rulesetVersion}</p>
          </Card>

          <Card title="Consent history">
            {consentRows.length === 0 ? (
              <p className="text-sm text-muted">No consent recorded.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {consentRows.map((c) => (
                  <li key={c.id} className="rounded-lg border border-line p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{channelLabel[c.channel]}</span>
                      <Badge tone={c.status === "granted" ? "ok" : "danger"}>{c.status === "granted" ? "Granted" : "Withdrawn"}</Badge>
                    </div>
                    {c.basis !== "none_recorded" && <div className="text-xs">{basisLabel[c.basis]}</div>}
                    <div className="text-xs text-muted">{c.source}</div>
                    <div className="text-xs text-muted">
                      {formatDateTime(c.captured_at, ctx.org.timezone)}
                      {c.expires_at && ` · expires ${formatDate(c.expires_at, ctx.org.timezone)}`}
                      {c.evidence_url && <> · <a className="text-brand underline" href={c.evidence_url} rel="noopener noreferrer" target="_blank">evidence</a></>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {canEdit && <ConsentForm leadId={lead.id} />}
          </Card>

          <Card title="Suppression">
            {suppressed.length === 0 ? (
              <p className="text-sm text-muted">Not suppressed.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {suppressed.map((s) => (
                  <li key={s.id} className="flex items-start justify-between gap-2 rounded-lg border border-danger/30 bg-danger-soft/40 p-2.5">
                    <div>
                      <div className="font-medium">{s.value_type === "email" ? "Email" : "Phone"} · {s.channel ? channelLabel[s.channel] : "all channels"}</div>
                      <div className="text-xs text-muted">{suppressionReasonLabel[s.reason as keyof typeof suppressionReasonLabel] ?? s.reason}{s.source && ` · ${s.source}`} · {formatDate(s.created_at, ctx.org.timezone)}</div>
                    </div>
                    {ctx.can.liftSuppression && s.reason !== "erasure" && (
                      <form action={liftSuppressionAction.bind(null, lead.id, s.id)}>
                        <button className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline">Lift</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && <SuppressForm leadId={lead.id} hasEmail={Boolean(lead.email)} hasPhone={Boolean(lead.phone_e164)} />}
          </Card>

          {ctx.can.eraseLeads && (
            <Card title="Erase this person">
              <EraseForm leadId={lead.id} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
