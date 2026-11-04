import type { Db, DbRunner } from "@/lib/db";
import { notifyClient } from "./notify";

export interface DailyReport {
  clientName: string;
  date: string;
  opportunities: number;
  generated: number;
  approved: number;
  rejected: number;
  published: number;
  replies: number;
  likes: number;
  topOpportunity: { author: string | null; score: number; url: string | null; explanation: string | null } | null;
  topComment: { text: string; platform: string; likes: number; replies: number } | null;
}

/** Builds one client's report for one day. Every query filters on that client. */
export async function buildDailyReport(db: Db, clientId: string, date: string): Promise<DailyReport> {
  const counts = await db.one<{
    name: string;
    opportunities: number;
    generated: number;
    approved: number;
    rejected: number;
    published: number;
    replies: number;
    likes: number;
  }>(
    `select cl.name,
       (select count(*)::int from engagement_opportunities where client_id = $1 and discovered_at::date = $2::date) as opportunities,
       (select count(*)::int from comments where client_id = $1 and created_at::date = $2::date) as generated,
       (select count(*)::int from comments where client_id = $1 and approved_at::date = $2::date) as approved,
       (select count(*)::int from comments where client_id = $1 and rejected_at::date = $2::date) as rejected,
       (select count(*)::int from comments where client_id = $1 and published_at::date = $2::date) as published,
       (select coalesce(sum(replies), 0)::int from engagement_metrics where client_id = $1 and comment_id is not null and metric_date = $2::date) as replies,
       (select coalesce(sum(likes), 0)::int from engagement_metrics where client_id = $1 and comment_id is not null and metric_date = $2::date) as likes
     from clients cl where cl.id = $1`,
    [clientId, date],
  );
  const top = await db.one<{ author: string | null; score: number; url: string | null; explanation: string | null }>(
    `select coalesce(p.author_handle, p.author_name) as author, o.score, p.url, o.explanation
     from engagement_opportunities o join posts p on p.id = o.post_id and p.client_id = o.client_id
     where o.client_id = $1 and o.discovered_at::date = $2::date order by o.score desc nulls last limit 1`,
    [clientId, date],
  );
  const topComment = await db.one<{ text: string; platform: string; likes: number; replies: number }>(
    `select c.current_text as text, c.platform, coalesce(m.likes, 0) as likes, coalesce(m.replies, 0) as replies
     from comments c left join engagement_metrics m on m.comment_id = c.id and m.client_id = c.client_id
     where c.client_id = $1 and c.status = 'published' and c.published_at > $2::date - interval '7 days'
     order by coalesce(m.replies, 0) * 3 + coalesce(m.likes, 0) desc, c.published_at desc limit 1`,
    [clientId, date],
  );
  return {
    clientName: counts?.name ?? "",
    date,
    opportunities: counts?.opportunities ?? 0,
    generated: counts?.generated ?? 0,
    approved: counts?.approved ?? 0,
    rejected: counts?.rejected ?? 0,
    published: counts?.published ?? 0,
    replies: counts?.replies ?? 0,
    likes: counts?.likes ?? 0,
    topOpportunity: top,
    topComment,
  };
}

/** Generates and stores reports for every active client, and notifies that client's own users. */
export async function generateDailyReports(system: DbRunner, date = new Date().toISOString().slice(0, 10)) {
  const clients = await system((db) =>
    db.query<{ id: string; organization_id: string; name: string }>("select id, organization_id, name from clients where status = 'active'"),
  );
  for (const c of clients) {
    await system(async (db) => {
      const report = await buildDailyReport(db, c.id, date);
      await db.query(
        `insert into daily_reports (organization_id, client_id, report_date, data) values ($1, $2, $3, $4)
         on conflict (client_id, report_date) do update set data = excluded.data, created_at = now()`,
        [c.organization_id, c.id, date, JSON.stringify(report)],
      );
      await notifyClient(db, {
        organizationId: c.organization_id,
        clientId: c.id,
        kind: "daily_report",
        title: `${c.name}: today's engagement report`,
        body: `${report.opportunities} opportunities · ${report.approved} approved · ${report.published} published · ${report.replies} replies`,
        link: `/clients/${c.id}/reports?date=${date}`,
        audience: ["managers", "client_owners"],
      });
    });
  }
  return clients.length;
}
