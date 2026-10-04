import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Card, EmptyState, PageHeader, cx, timeAgo } from "@/components/ui";
import { markAllNotificationsRead } from "@/app/actions/engagement";

export const metadata = { title: "Notifications" };

const ICON: Record<string, string> = {
  opportunities_found: "◎",
  approval_required: "◔",
  comment_published: "●",
  publishing_failed: "!",
  oauth_expired: "⚠",
  integration_disconnected: "⚠",
  campaign_paused: "❚❚",
  daily_limit_reached: "◷",
  daily_report: "▤",
  manual_action_required: "✋",
};

export default async function NotificationsPage() {
  const user = await requireUser();
  // RLS returns only this user's notifications; client users only ever receive their own client's.
  const rows = await withUser(user.id, (db) =>
    db.query<{ id: string; kind: string; title: string; body: string | null; link: string | null; read_at: Date | null; created_at: Date; client: string | null }>(
      `select n.id, n.kind, n.title, n.body, n.link, n.read_at, n.created_at, c.name as client
       from notifications n left join clients c on c.id = n.client_id where n.user_id = $1 order by n.created_at desc limit 100`,
      [user.id],
    ),
  );
  const unread = rows.filter((r) => !r.read_at).length;
  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        actions={unread > 0 && (
          <form action={markAllNotificationsRead}>
            <button className="h-9 rounded-lg border border-line-strong px-3 text-sm">Mark all as read</button>
          </form>
        )}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No notifications yet" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((n) => {
              const inner = (
                <div className={cx("flex gap-3 px-5 py-3", !n.read_at && "bg-accent-soft/40")}>
                  <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sunken text-sm">{ICON[n.kind] ?? "•"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">{n.title}</div>
                    {n.body && <p className="line-clamp-2 text-sm text-ink-2">{n.body}</p>}
                    <div className="mt-0.5 text-xs text-ink-3">{timeAgo(n.created_at)}</div>
                  </div>
                  {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-bad" aria-label="Unread" />}
                </div>
              );
              return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-surface-2">{inner}</Link> : inner}</li>;
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
