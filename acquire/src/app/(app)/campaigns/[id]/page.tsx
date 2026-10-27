import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { loadLeadContext } from "@/lib/leads";
import { formatDateTime } from "@/domain/dates";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import { CampaignForm, EnrollStageForm, EnrollmentButton } from "@/components/outreach";
import { setCampaignStatusAction } from "../../outreach-actions";

export const metadata: Metadata = { title: "Sequence" };

type Step = { channel: "email" | "sms"; template_id: string; delay_days: number };

export default async function CampaignPage({ params }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  const { data: c } = await ctx.supabase.from("campaigns").select("id, name, status, steps, stop_on_reply").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!c) notFound();
  const [{ data: templates }, { data: enrollments }, ref] = await Promise.all([
    ctx.supabase.from("message_templates").select("id, name, channel, status").eq("organization_id", ctx.org.id).order("name"),
    ctx.supabase.from("campaign_enrollments").select("id, lead_id, status, current_step, next_run_at, stop_reason").eq("campaign_id", id)
      .order("status").order("next_run_at").limit(300),
    loadLeadContext(ctx),
  ]);
  const leadIds = (enrollments ?? []).map((e) => e.lead_id);
  const { data: leads } = leadIds.length ? await ctx.supabase.from("leads").select("id, full_name").in("id", leadIds) : { data: [] };
  const leadName = new Map((leads ?? []).map((l) => [l.id, l.full_name]));
  const steps = c.steps as Step[];
  const tName = new Map((templates ?? []).map((t) => [t.id, t]));
  const approved = (templates ?? []).filter((t) => t.status === "approved") as { id: string; name: string; channel: "email" | "sms" }[];
  const status = c.status as "draft" | "active" | "paused" | "archived";

  return (
    <>
      <div className="mb-2 text-sm"><Link href="/campaigns" className="text-muted hover:text-ink">← Campaigns</Link></div>
      <PageHeader
        title={c.name}
        description={<span className="flex items-center gap-2"><Badge tone={status === "active" ? "ok" : status === "paused" ? "warn" : "neutral"}>{status}</Badge>{steps.length} step(s){c.stop_on_reply && " · stops on reply"}</span>}
        actions={ctx.can.assignLeads ? (
          <div className="flex gap-2">
            {status !== "active" && <form action={setCampaignStatusAction.bind(null, c.id, "active")}><button className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-brand-ink">Activate</button></form>}
            {status === "active" && <form action={setCampaignStatusAction.bind(null, c.id, "paused")}><button className="rounded-lg border border-line px-3.5 py-2 text-sm">Pause</button></form>}
            {status !== "archived" && <form action={setCampaignStatusAction.bind(null, c.id, "archived")}><button className="rounded-lg px-3.5 py-2 text-sm text-muted hover:text-danger">Archive</button></form>}
          </div>
        ) : undefined}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <Card title={`Enrolled leads (${enrollments?.length ?? 0})`}>
            {!enrollments?.length ? <p className="text-sm text-muted">Nobody enrolled yet. Enroll from a lead&apos;s page, or a whole stage here.</p> : (
              <div className="-m-4">
                <Table head={["Lead", "Status", "Next step", "Due", ""]}>
                  {enrollments.map((e) => (
                    <tr key={e.id}>
                      <Td><Link className="hover:text-brand" href={`/leads/${e.lead_id}`}>{leadName.get(e.lead_id) ?? "Lead"}</Link></Td>
                      <Td>
                        <Badge tone={e.status === "active" ? "info" : e.status === "held" ? "warn" : e.status === "completed" ? "ok" : "neutral"}>{e.status}</Badge>
                        {e.stop_reason && <div className="max-w-xs text-xs text-muted">{e.stop_reason}</div>}
                      </Td>
                      <Td>{e.current_step < steps.length ? `#${e.current_step + 1} ${steps[e.current_step].channel}` : "—"}</Td>
                      <Td>{e.status === "active" ? formatDateTime(e.next_run_at, ctx.org.timezone) : "—"}</Td>
                      <Td>
                        {ctx.can.workCrm && e.status === "held" && <EnrollmentButton enrollmentId={e.id} to="active" label="Reviewed, resume" />}
                        {ctx.can.workCrm && e.status === "active" && <EnrollmentButton enrollmentId={e.id} to="stopped" label="Stop" />}
                      </Td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
            <p className="mt-6 text-xs text-muted">“Reviewed, resume” means a person confirmed the lead may be contacted. The step still re-checks suppression, consent and hours before sending.</p>
          </Card>
          {ctx.can.assignLeads && (
            <Card title="Edit sequence">
              <CampaignForm campaign={{ id: c.id, name: c.name, steps, stop_on_reply: c.stop_on_reply }} templates={approved} />
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <Card title="Steps">
            <ol className="flex flex-col gap-2 text-sm">
              {steps.map((s, i) => {
                const t = tName.get(s.template_id);
                return (
                  <li key={i} className="flex justify-between gap-2">
                    <span>#{i + 1} {s.channel.toUpperCase()} · {t?.name ?? "missing template"}{t && t.status !== "approved" && <Badge tone="warn">not approved</Badge>}</span>
                    <span className="tabular text-muted">+{s.delay_days}d</span>
                  </li>
                );
              })}
            </ol>
          </Card>
          {ctx.can.assignLeads && status === "active" && (
            <Card title="Enroll a stage"><EnrollStageForm campaignId={c.id} stages={ref.stages.filter((s) => s.category !== "opted_out").map((s) => ({ id: s.id, name: s.name }))} /></Card>
          )}
        </div>
      </div>
    </>
  );
}
