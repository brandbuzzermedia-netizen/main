import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext, ROLE_LABELS } from "@/lib/workspace";
import { loadMembers } from "@/lib/people";
import { formatDate, todayInBusinessTz } from "@/domain/dates";
import { Badge, Card, EmptyState, PageHeader, Table, Td, cx } from "@/components/ui";
import { TaskForm } from "../forms";
import { setTaskStatusAction } from "../actions";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage({ params, searchParams }: PageProps<"/c/[slug]/tasks">) {
  const { slug } = await params;
  const view = (await searchParams).view === "overdue" ? "overdue" : (await searchParams).view === "done" ? "done" : "open";
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("tasks.write") && !ctx.can("tasks.read_all")) notFound();
  const today = todayInBusinessTz();
  const all = ctx.can("tasks.read_all");
  let q = ctx.supabase.from("tasks").select("id, title, due_on, status, priority, assignee_id, details").eq("organization_id", ctx.company.id);
  q = view === "done" ? q.in("status", ["done", "cancelled"]).order("updated_at", { ascending: false })
    : q.in("status", ["open", "in_progress"]).order("due_on", { ascending: true, nullsFirst: false });
  if (view === "overdue") q = q.lt("due_on", today);
  const [tasks, members] = await Promise.all([q.limit(500), loadMembers(ctx.supabase, ctx.company.id)]);
  if (tasks.error) throw new Error(tasks.error.message);
  const names = new Map(members.map((m) => [m.user_id, m.name]));
  const base = `/c/${slug}/tasks`;
  return (
    <>
      <PageHeader title="Tasks & follow-ups" description={all ? "Every task in this company." : "Tasks assigned to you or created by you."} />
      <nav aria-label="Views" className="mb-4 flex gap-1.5">
        {([["open", "Open", base], ["overdue", "Overdue", `${base}?view=overdue`], ["done", "Done", `${base}?view=done`]] as const).map(([k, l, h]) => (
          <Link key={k} href={h} aria-current={view === k ? "page" : undefined}
            className={cx("rounded-full border px-3 py-1 text-sm", view === k ? "border-co-side bg-co-side text-white" : "border-line bg-surface hover:bg-surface-2")}>{l}</Link>
        ))}
      </nav>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {(tasks.data ?? []).length === 0 ? <EmptyState title={view === "overdue" ? "Nothing overdue" : "No tasks here"} /> : (
          <Table head={["Task", "Due", "Assignee", "Priority", ""]}>
            {(tasks.data ?? []).map((t) => (
              <tr key={t.id}>
                <Td><div className="font-medium">{t.title}</div>{t.details && <div className="line-clamp-2 text-xs text-muted">{t.details}</div>}</Td>
                <Td className={cx("whitespace-nowrap", t.due_on && t.due_on < today && t.status !== "done" && "text-danger")}>{formatDate(t.due_on)}</Td>
                <Td>{t.assignee_id ? names.get(t.assignee_id) ?? "—" : "Unassigned"}</Td>
                <Td><Badge tone={t.priority === "urgent" ? "danger" : t.priority === "high" ? "warn" : "neutral"}>{t.priority}</Badge></Td>
                <Td>
                  {(all || t.assignee_id === ctx.userId) && (t.status === "open" || t.status === "in_progress") && (
                    <form action={setTaskStatusAction.bind(null, slug)}>
                      <input type="hidden" name="task_id" value={t.id} />
                      <input type="hidden" name="status" value="done" />
                      <button className="rounded-md border border-line px-2 py-1 text-xs hover:bg-surface-2">Mark done</button>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
        {ctx.can("tasks.write") && (
          <Card title="Add a task">
            <TaskForm slug={slug} canAssign={all}
              people={members.filter((m) => m.user_id !== ctx.userId && !["partner", "accountant", "viewer"].includes(m.role)).map((m) => ({ id: m.user_id, label: `${m.name} · ${ROLE_LABELS[m.role] ?? m.role}` }))} />
          </Card>
        )}
      </div>
    </>
  );
}
