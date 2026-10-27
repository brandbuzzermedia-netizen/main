import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { loadLeadContext, memberName } from "@/lib/leads";
import type { Task } from "@/lib/db-types";
import { formatDateTime, startOfDay } from "@/domain/dates";
import { Badge, Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { TaskForm, TaskToggle } from "@/components/crm/controls";

export const metadata: Metadata = { title: "Tasks" };

const VIEWS = { mine: "Assigned to me", all: "Everyone's", done: "Completed" } as const;

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const view = (typeof sp.view === "string" && sp.view in VIEWS ? sp.view : "mine") as keyof typeof VIEWS;
  let q = ctx.supabase.from("tasks").select("id, lead_id, deal_id, title, notes, due_at, priority, status, assignee_id, completed_at, created_at").eq("organization_id", ctx.org.id);
  if (view === "mine") q = q.eq("assignee_id", ctx.userId);
  q = view === "done"
    ? q.eq("status", "done").order("completed_at", { ascending: false }).limit(100)
    : q.eq("status", "open").order("due_at", { ascending: true, nullsFirst: false }).limit(300);
  const [{ data, error }, ref] = await Promise.all([q, loadLeadContext(ctx)]);
  if (error) throw new Error(error.message);
  const tasks = (data ?? []) as Task[];
  const leadIds = [...new Set(tasks.map((t) => t.lead_id).filter(Boolean))] as string[];
  const { data: leads } = leadIds.length ? await ctx.supabase.from("leads").select("id, full_name").in("id", leadIds) : { data: [] };
  const leadName = new Map((leads ?? []).map((l) => [l.id, l.full_name]));
  const members = new Map(ref.members.map((m) => [m.user_id, m]));

  const now = new Date();
  const todayStart = startOfDay(now, ctx.org.timezone);
  const tomorrow = new Date(todayStart.getTime() + 86_400_000);
  const groups = view === "done"
    ? [{ title: "Completed", tasks }]
    : [
        { title: "Overdue", tasks: tasks.filter((t) => t.due_at && new Date(t.due_at) < now) },
        { title: "Today", tasks: tasks.filter((t) => t.due_at && new Date(t.due_at) >= now && new Date(t.due_at) < tomorrow) },
        { title: "Upcoming", tasks: tasks.filter((t) => t.due_at && new Date(t.due_at) >= tomorrow) },
        { title: "No due date", tasks: tasks.filter((t) => !t.due_at) },
      ];

  return (
    <>
      <PageHeader title="Tasks" description="Follow-ups and to-dos. Tasks on a lead also appear on its page; completing one adds it to the lead's timeline." />
      <nav className="mb-4 flex gap-1 border-b border-line text-sm" aria-label="Task views">
        {Object.entries(VIEWS).filter(([k]) => k !== "all" || ctx.role !== "sales_rep").map(([k, label]) => (
          <Link key={k} href={`/tasks?view=${k}`} aria-current={k === view ? "page" : undefined}
            className={cx("-mb-px border-b-2 px-3 py-2", k === view ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-ink")}>
            {label}
          </Link>
        ))}
      </nav>
      {ctx.can.workCrm && view !== "done" && (
        <div className="mb-6"><Card title="New task"><TaskForm leadId={null} members={ref.members.map((m) => ({ id: m.user_id, label: memberName(m) }))} canAssign={ctx.can.assignLeads} /></Card></div>
      )}
      {tasks.length === 0 ? (
        <EmptyState title={view === "done" ? "Nothing completed yet" : "No open tasks"}>{view === "mine" ? "Tasks assigned to you will show here." : undefined}</EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.filter((g) => g.tasks.length).map((g) => (
            <section key={g.title}>
              <h2 className={cx("mb-2 text-sm font-semibold", g.title === "Overdue" && "text-danger")}>{g.title} <span className="tabular font-normal text-muted">{g.tasks.length}</span></h2>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {g.tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                    {ctx.can.workCrm ? <TaskToggle taskId={t.id} done={t.status === "done"} title={t.title} /> : <span className="size-4" />}
                    <div className="min-w-0 flex-1">
                      <div className={cx("font-medium", t.status === "done" && "text-muted line-through")}>{t.title}</div>
                      <div className="flex flex-wrap gap-x-2 text-xs text-muted">
                        {t.lead_id && <Link className="text-brand hover:underline" href={`/leads/${t.lead_id}`}>{leadName.get(t.lead_id) ?? "Lead"}</Link>}
                        {t.due_at && <span className={t.status === "open" && new Date(t.due_at) < now ? "text-danger" : undefined}>Due {formatDateTime(t.due_at, ctx.org.timezone)}</span>}
                        {t.completed_at && <span>Done {formatDateTime(t.completed_at, ctx.org.timezone)}</span>}
                        {view !== "mine" && <span>{t.assignee_id ? memberName(members.get(t.assignee_id)) : "Unassigned"}</span>}
                      </div>
                    </div>
                    {t.priority === "high" && <Badge tone="danger">High</Badge>}
                    {t.priority === "low" && <Badge>Low</Badge>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
