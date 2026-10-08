import type { DbRunner } from "@/lib/db";
import { getAdapter } from "@/lib/platforms/registry";
import type { Platform } from "@/lib/platforms/types";
import { getCredentials } from "@/lib/services/tokens";

/**
 * Pulls likes/replies for recently published comments and follower counts for connected
 * accounts, where each platform's API exposes them. Scoped per client and account.
 */
export async function collectMetrics(system: DbRunner, opts: { days?: number; limit?: number } = {}) {
  const comments = await system((db) =>
    db.query<{ id: string; organization_id: string; client_id: string; platform: Platform; social_account_id: string; external_comment_id: string }>(
      `select id, organization_id, client_id, platform, social_account_id, external_comment_id from comments
       where status = 'published' and external_comment_id is not null and social_account_id is not null
         and published_at > now() - make_interval(days => $1)
       order by published_at desc limit $2`,
      [opts.days ?? 14, opts.limit ?? 200],
    ),
  );
  let updated = 0;
  for (const c of comments) {
    try {
      const creds = await system((db) => getCredentials(db, { clientId: c.client_id, socialAccountId: c.social_account_id }));
      const m = await getAdapter(c.platform).getCommentMetrics(creds, c.external_comment_id);
      if (!m) continue;
      await system((db) =>
        db.query(
          `insert into engagement_metrics (organization_id, client_id, comment_id, social_account_id, platform, likes, replies)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (comment_id, metric_date) where comment_id is not null
           do update set likes = excluded.likes, replies = excluded.replies, collected_at = now()`,
          [c.organization_id, c.client_id, c.id, c.social_account_id, c.platform, m.likes, m.replies],
        ),
      );
      updated++;
    } catch {
      // Expired tokens and missing permissions are surfaced by discovery/publishing; metrics are best-effort.
    }
  }

  const accounts = await system((db) =>
    db.query<{ id: string; organization_id: string; client_id: string; platform: Platform }>(
      `select id, organization_id, client_id, platform from social_accounts where status = 'connected'`,
    ),
  );
  for (const a of accounts) {
    try {
      const creds = await system((db) => getCredentials(db, { clientId: a.client_id, socialAccountId: a.id }));
      const m = await getAdapter(a.platform).getProfileMetrics(creds);
      await system((db) =>
        db.query(
          `insert into engagement_metrics (organization_id, client_id, social_account_id, platform, followers, profile_visits)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (social_account_id, metric_date) where comment_id is null and social_account_id is not null
           do update set followers = excluded.followers, profile_visits = excluded.profile_visits, collected_at = now()`,
          [a.organization_id, a.client_id, a.id, a.platform, m.followers, m.profileVisits],
        ),
      );
    } catch {
      // best-effort
    }
  }
  return { commentsUpdated: updated, accounts: accounts.length };
}
