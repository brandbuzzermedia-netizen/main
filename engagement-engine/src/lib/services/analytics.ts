import type { Db } from "@/lib/db";

/**
 * Operational analytics. Every query runs in the caller's RLS transaction, so a client user
 * only ever aggregates their own client, and an account manager only their assigned clients.
 */
export interface AnalyticsFilters {
  clientId?: string | null;
  platform?: string | null;
  campaignId?: string | null;
  accountManagerId?: string | null;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD inclusive
}

function where(f: AnalyticsFilters, alias: string, dateCol: string, params: unknown[]): string {
  const parts: string[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    parts.push(sql.replace("?", `$${params.length}`));
  };
  add(`${alias}.${dateCol} >= ?::date`, f.from);
  add(`${alias}.${dateCol} < (?::date + 1)`, f.to);
  if (f.clientId) add(`${alias}.client_id = ?`, f.clientId);
  if (f.platform) add(`${alias}.platform = ?`, f.platform);
  if (f.campaignId) add(`${alias}.campaign_id = ?`, f.campaignId);
  if (f.accountManagerId) add(`exists (select 1 from account_managers am where am.client_id = ${alias}.client_id and am.user_id = ?)`, f.accountManagerId);
  return parts.join(" and ");
}

export interface Totals {
  opportunities: number;
  generated: number;
  approved: number;
  rejected: number;
  published: number;
  failed: number;
  pending: number;
  replies: number;
  likes: number;
  aiGenerations: number;
  apiCalls: number;
}

export async function totals(db: Db, f: AnalyticsFilters): Promise<Totals> {
  const p: unknown[] = [];
  const wo = where(f, "o", "discovered_at", p);
  const wc = where(f, "c", "created_at", p);
  const wa = where(f, "c", "approved_at", p);
  const wr = where(f, "c", "rejected_at", p);
  const wp = where(f, "c", "published_at", p);
  const wm = where({ ...f, campaignId: null }, "m", "metric_date", p);
  const wu = where({ ...f, campaignId: null }, "u", "created_at", p);
  const row = await db.one<Totals>(
    `select
       (select count(*)::int from engagement_opportunities o where ${wo}) as opportunities,
       (select count(*)::int from comments c where ${wc}) as generated,
       (select count(*)::int from comments c where ${wa}) as approved,
       (select count(*)::int from comments c where ${wr}) as rejected,
       (select count(*)::int from comments c where ${wp}) as published,
       (select count(*)::int from comments c where c.status = 'failed' and ${wc}) as failed,
       (select count(*)::int from comments c where c.status = 'pending_approval' and ${wc}) as pending,
       (select coalesce(sum(m.replies), 0)::int from engagement_metrics m where m.comment_id is not null and ${wm}) as replies,
       (select coalesce(sum(m.likes), 0)::int from engagement_metrics m where m.comment_id is not null and ${wm}) as likes,
       (select coalesce(sum(u.quantity), 0)::int from usage_events u where u.kind = 'ai_generation' and ${wu}) as "aiGenerations",
       (select coalesce(sum(u.quantity), 0)::int from usage_events u where u.kind in ('api_call','hashtag_query') and ${wu}) as "apiCalls"`,
    p,
  );
  return row!;
}

export interface DayPoint {
  day: string;
  opportunities: number;
  generated: number;
  approved: number;
  published: number;
  replies: number;
}

export async function dailySeries(db: Db, f: AnalyticsFilters): Promise<DayPoint[]> {
  const p: unknown[] = [f.from, f.to];
  const extra = (alias: string) => {
    const parts: string[] = [];
    if (f.clientId) {
      p.push(f.clientId);
      parts.push(`${alias}.client_id = $${p.length}`);
    }
    if (f.platform) {
      p.push(f.platform);
      parts.push(`${alias}.platform = $${p.length}`);
    }
    if (f.campaignId && alias !== "m") {
      p.push(f.campaignId);
      parts.push(`${alias}.campaign_id = $${p.length}`);
    }
    if (f.accountManagerId) {
      p.push(f.accountManagerId);
      parts.push(`exists (select 1 from account_managers am where am.client_id = ${alias}.client_id and am.user_id = $${p.length})`);
    }
    return parts.length ? ` and ${parts.join(" and ")}` : "";
  };
  const eo = extra("o");
  const ec = extra("c");
  const em = extra("m");
  return db.query<DayPoint>(
    `with days as (select generate_series($1::date, $2::date, interval '1 day')::date as day)
     select to_char(d.day, 'YYYY-MM-DD') as day,
       (select count(*)::int from engagement_opportunities o where o.discovered_at::date = d.day${eo}) as opportunities,
       (select count(*)::int from comments c where c.created_at::date = d.day${ec}) as generated,
       (select count(*)::int from comments c where c.approved_at::date = d.day${ec}) as approved,
       (select count(*)::int from comments c where c.published_at::date = d.day${ec}) as published,
       (select coalesce(sum(m.replies), 0)::int from engagement_metrics m where m.comment_id is not null and m.metric_date = d.day${em}) as replies
     from days d order by d.day`,
    p,
  );
}

export interface GroupRow {
  key: string;
  label: string;
  opportunities: number;
  generated: number;
  approved: number;
  rejected: number;
  published: number;
  replies: number;
}

/** Breakdown by platform, campaign or client (client breakdown is for GBS staff; RLS still applies). */
export async function breakdown(db: Db, f: AnalyticsFilters, by: "platform" | "campaign" | "client"): Promise<GroupRow[]> {
  const p: unknown[] = [];
  const wo = where(f, "o", "discovered_at", p);
  const wc = where(f, "c", "created_at", p);
  const keyExpr = by === "platform" ? "platform" : by === "campaign" ? "campaign_id::text" : "client_id::text";
  const labelJoin =
    by === "platform"
      ? "g.key as label"
      : by === "campaign"
        ? "(select name from campaigns where id = g.key::uuid) as label"
        : "(select name from clients where id = g.key::uuid) as label";
  return db.query<GroupRow>(
    `with o as (select ${keyExpr} as key, count(*)::int as n from engagement_opportunities o where ${wo} group by 1),
          c as (select ${keyExpr} as key,
                  count(*)::int as generated,
                  count(*) filter (where approved_at is not null)::int as approved,
                  count(*) filter (where status = 'rejected')::int as rejected,
                  count(*) filter (where status = 'published')::int as published,
                  coalesce(sum((select coalesce(sum(m.replies), 0) from engagement_metrics m where m.comment_id = c.id)), 0)::int as replies
                from comments c where ${wc} and c.status <> 'superseded' group by 1),
          g as (select key from o union select key from c)
     select g.key, ${labelJoin}, coalesce(o.n, 0) as opportunities, coalesce(c.generated, 0) as generated, coalesce(c.approved, 0) as approved,
            coalesce(c.rejected, 0) as rejected, coalesce(c.published, 0) as published, coalesce(c.replies, 0) as replies
     from g left join o on o.key = g.key left join c on c.key = g.key
     order by published desc, opportunities desc`,
    p,
  );
}

export function defaultRange(days = 30): { from: string; to: string } {
  const to = new Date();
  const from = new Date(Date.now() - (days - 1) * 86_400_000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function parseRange(sp: { from?: string; to?: string; days?: string }): { from: string; to: string; days: number } {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (sp.from && sp.to && iso.test(sp.from) && iso.test(sp.to)) {
    const days = Math.max(1, Math.round((Date.parse(sp.to) - Date.parse(sp.from)) / 86_400_000) + 1);
    return { from: sp.from, to: sp.to, days };
  }
  const days = [7, 14, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  return { ...defaultRange(days), days };
}
