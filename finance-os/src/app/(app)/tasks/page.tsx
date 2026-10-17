import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import type { EscalationTask } from "@/lib/db-types";
import { Badge, Button, EmptyState, Input, PageHeader } from "@/components/ui";
import { updateTaskAction } from "./actions";

export const metadata: Metadata = { title: "Tasks" };

const KIND_LABEL: Record<string, string> = {
  overdue_escalation: "Overdue escalation", commitment_missed: "Missed commitment", formal_review: "Formal review",
  suspension_decision: "Suspension decision", automation_failed: "Automation failed", sync_failed: "Sync failed",
  reconciliation: "Reconciliation", ad_funds_low: "Ad funds low",
};

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const { show } = await searchParams;
  const closed = show === "closed";
  const ctx = await getContext();
  const { data } = await ctx.supabase
    .from("escalation_tasks")
    .select("*")
    .eq("organization_id", ctx.org.id)
    .in("status", closed ? ["resolved", "dismissed"] : ["open", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(200);
  const tasks = (data ?? []) as (EscalationTask & { resolution: string | null })[];

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Exceptions that need a person: reconciliation differences, escalations and failures. Routine follow-ups are automated."
        actions={<Link className="text-sm text-brand hover:underline" href={closed ? "/tasks" : "/tasks?show=closed"}>{closed ? "Show open" : "Show closed"}</Link>}
      />
      {tasks.length === 0 ? (
        <EmptyState title={closed ? "No closed tasks" : "Nothing needs your attention"} />
      ) : (
        <ul className="flex flex-col gap-3">
          {tasks.map((t) => (
            <li key={t.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={t.priority === "urgent" || t.priority === "high" ? "danger" : "warn"}>{KIND_LABEL[t.kind] ?? t.kind}</Badge>
                {t.status === "in_progress" && <Badge tone="info">In progress</Badge>}
                <span className="text-xs text-muted">{new Date(t.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              <div className="mt-2 font-medium">{t.title}</div>
              {t.details && <p className="mt-1 text-sm text-muted">{t.details}</p>}
              <div className="mt-2 flex gap-3 text-sm">
                {t.invoice_id && <Link className="text-brand underline" href={`/invoices/${t.invoice_id}`}>Open invoice</Link>}
                {t.client_id && <Link className="text-brand underline" href={`/clients/${t.client_id}`}>Open client</Link>}
              </div>
              {closed && t.resolution && <p className="mt-2 text-sm">Resolution: {t.resolution}</p>}
              {!closed && ctx.canWrite && (
                <form action={updateTaskAction.bind(null, t.id)} className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input name="resolution" placeholder="What was done (optional)" aria-label="Resolution" className="sm:max-w-md" />
                  <Button name="status" value="resolved" type="submit">Resolve</Button>
                  {t.status !== "in_progress" && <Button name="status" value="in_progress" variant="secondary" type="submit">Start</Button>}
                  <Button name="status" value="dismissed" variant="ghost" type="submit">Dismiss</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
