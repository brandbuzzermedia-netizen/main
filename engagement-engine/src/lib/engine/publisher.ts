import type { DbRunner } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getAdapter } from "@/lib/platforms/registry";
import { ManualActionRequired, PlatformApiError, UnsupportedCapabilityError, type Platform } from "@/lib/platforms/types";
import { CredentialsUnavailableError, getCredentials } from "@/lib/services/tokens";
import { notifyClient } from "./notify";

interface ClaimedJob {
  id: string;
  organization_id: string;
  client_id: string;
  comment_id: string;
  social_account_id: string | null;
  platform: Platform;
  attempts: number;
  max_attempts: number;
  approved_by: string | null;
}

export interface PublishOutcome {
  jobId: string;
  clientId: string;
  status: "published" | "manual_required" | "rescheduled" | "failed" | "skipped";
  detail?: string;
}

const startOfTomorrow = () => {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d;
};

/**
 * Claims due jobs with FOR UPDATE SKIP LOCKED (safe with several workers) and publishes each
 * through the official API of its platform. Runs on the SYSTEM connection; every query in a
 * job is scoped to that job's client_id, and credentials are bound to that client + account.
 */
export async function processDueJobs(system: DbRunner, opts: { limit?: number; workerId?: string } = {}): Promise<PublishOutcome[]> {
  const jobs = await system((db) =>
    db.query<ClaimedJob>(
      `update publishing_jobs j set status = 'publishing', locked_at = now(), locked_by = $2, attempts = attempts + 1, updated_at = now()
       where j.id in (
         select id from publishing_jobs where status = 'queued' and scheduled_for <= now()
         order by scheduled_for for update skip locked limit $1)
       returning j.id, j.organization_id, j.client_id, j.comment_id, j.social_account_id, j.platform, j.attempts, j.max_attempts, j.approved_by`,
      [opts.limit ?? 10, opts.workerId ?? "worker"],
    ),
  );
  const out: PublishOutcome[] = [];
  for (const job of jobs) out.push(await publishOne(system, job));
  return out;
}

async function publishOne(system: DbRunner, job: ClaimedJob): Promise<PublishOutcome> {
  // 1. Re-verify the comment is approved and still belongs to this client.
  const prep = await system(async (db) => {
    const c = await db.one<{
      id: string;
      status: string;
      approved_at: Date | null;
      current_text: string;
      campaign_id: string;
      opportunity_id: string;
      opportunity_type: "third_party_post" | "own_post_comment" | "mention" | "manual";
      publish_capability: "api" | "manual";
      reply_to_external_id: string | null;
      external_post_id: string;
      post_source: string;
      daily_publish_limit: number;
      client_name: string;
    }>(
      `select c.id, c.status, c.approved_at, c.current_text, c.campaign_id, c.opportunity_id, o.opportunity_type, o.publish_capability,
              o.reply_to_external_id, p.external_post_id, p.source as post_source, ca.daily_publish_limit, cl.name as client_name
       from comments c
       join engagement_opportunities o on o.id = c.opportunity_id and o.client_id = c.client_id
       join posts p on p.id = o.post_id and p.client_id = o.client_id
       join campaigns ca on ca.id = c.campaign_id and ca.client_id = c.client_id
       join clients cl on cl.id = c.client_id
       where c.id = $1 and c.client_id = $2`,
      [job.comment_id, job.client_id],
    );
    if (!c || !c.approved_at || !["queued", "publishing"].includes(c.status)) return { skip: "Comment is no longer approved." as const };

    // 2. Internal limits (in addition to platform limits).
    const limits = await db.one<{ daily: number; gap: number; published_today: number; campaign_today: number; last: Date | null }>(
      `select coalesce(lp.daily_publish_limit, la.daily_publish_limit, 5) as daily,
              coalesce(lp.min_minutes_between_comments, la.min_minutes_between_comments, 10) as gap,
              (select count(*)::int from comments where client_id = $1 and platform = $2 and status = 'published'
                 and published_at >= date_trunc('day', now())) as published_today,
              (select count(*)::int from comments where client_id = $1 and campaign_id = $4 and status = 'published'
                 and published_at >= date_trunc('day', now())) as campaign_today,
              (select last_published_at from social_accounts where id = $3 and client_id = $1) as last
       from (select 1) x
       left join usage_limits lp on lp.client_id = $1 and lp.platform = $2
       left join usage_limits la on la.client_id = $1 and la.platform = 'all'`,
      [job.client_id, job.platform, job.social_account_id, c.campaign_id],
    );
    if (limits && (limits.published_today >= limits.daily || limits.campaign_today >= c.daily_publish_limit)) {
      return { reschedule: startOfTomorrow(), reason: "Daily publishing limit reached.", limitHit: true, c };
    }
    if (limits?.last && limits.gap > 0) {
      const next = new Date(limits.last.getTime() + limits.gap * 60_000);
      if (next > new Date()) return { reschedule: next, reason: "Spacing between comments.", limitHit: false, c };
    }
    await db.query(`update comments set status = 'publishing' where id = $1 and client_id = $2 and status = 'queued'`, [c.id, job.client_id]);
    return { c };
  });

  if ("skip" in prep) {
    await system((db) =>
      db.query(`update publishing_jobs set status = 'failed', last_error = $3, updated_at = now() where id = $1 and client_id = $2`, [
        job.id,
        job.client_id,
        prep.skip,
      ]),
    );
    return { jobId: job.id, clientId: job.client_id, status: "skipped", detail: prep.skip };
  }
  const c = prep.c;

  if ("reschedule" in prep && prep.reschedule) {
    await system(async (db) => {
      await db.query(
        `update publishing_jobs set status = 'queued', scheduled_for = $3, attempts = greatest(attempts - 1, 0), last_error = $4, updated_at = now()
         where id = $1 and client_id = $2`,
        [job.id, job.client_id, prep.reschedule, prep.reason],
      );
      if (prep.limitHit) {
        await notifyClient(db, {
          organizationId: job.organization_id,
          clientId: job.client_id,
          kind: "daily_limit_reached",
          title: `${c.client_name}: daily ${job.platform} publishing limit reached`,
          body: "Remaining approved comments will publish tomorrow.",
          link: `/clients/${job.client_id}/publishing`,
          audience: ["managers"],
        });
      }
    });
    return { jobId: job.id, clientId: job.client_id, status: "rescheduled", detail: prep.reason };
  }

  // 3. Publish through the platform adapter.
  try {
    if (c.publish_capability === "manual" || c.post_source === "seed") {
      throw new ManualActionRequired("The platform API cannot publish this comment; post it from the client's account.");
    }
    if (!job.social_account_id) throw new CredentialsUnavailableError("No connected account for this platform.");
    const creds = await system((db) => getCredentials(db, { clientId: job.client_id, socialAccountId: job.social_account_id! }));
    if (creds.clientId !== job.client_id) throw new Error("credential/client mismatch");
    const adapter = getAdapter(job.platform);
    const res = await adapter.publishComment(creds, {
      opportunityType: c.opportunity_type,
      externalPostId: c.external_post_id,
      replyToExternalId: c.reply_to_external_id,
      text: c.current_text,
    });
    await system(async (db) => {
      await db.query(`update publishing_jobs set status = 'published', last_error = null, updated_at = now() where id = $1 and client_id = $2`, [
        job.id,
        job.client_id,
      ]);
      await db.query(
        `update comments set status = 'published', published_at = now(), external_comment_id = $3, external_url = $4 where id = $1 and client_id = $2`,
        [c.id, job.client_id, res.externalCommentId, res.url],
      );
      await db.query(`update engagement_opportunities set status = 'published', updated_at = now() where id = $1 and client_id = $2`, [
        c.opportunity_id,
        job.client_id,
      ]);
      await db.query(`update social_accounts set last_published_at = now() where id = $1 and client_id = $2`, [job.social_account_id, job.client_id]);
      await db.query(
        `insert into publishing_results (organization_id, client_id, job_id, comment_id, success, method, external_comment_id, external_url)
         values ($1, $2, $3, $4, true, 'api', $5, $6)`,
        [job.organization_id, job.client_id, job.id, c.id, res.externalCommentId, res.url],
      );
      await db.query(
        `insert into usage_events (organization_id, client_id, kind, platform, quantity) values ($1, $2, 'comment_published', $3, 1), ($1, $2, 'api_call', $3, 1)`,
        [job.organization_id, job.client_id, job.platform],
      );
      await audit(db, {
        organizationId: job.organization_id,
        clientId: job.client_id,
        campaignId: c.campaign_id,
        actorId: null,
        actorName: "Publishing worker",
        action: "comment.published",
        entityType: "comment",
        entityId: c.id,
        details: { approved_by: job.approved_by, external_comment_id: res.externalCommentId },
      });
      await notifyClient(db, {
        organizationId: job.organization_id,
        clientId: job.client_id,
        kind: "comment_published",
        title: `${c.client_name}: comment published on ${job.platform}`,
        body: c.current_text.slice(0, 140),
        link: `/clients/${job.client_id}/comments`,
        audience: ["managers", "client_owners"],
      });
    });
    return { jobId: job.id, clientId: job.client_id, status: "published" };
  } catch (err) {
    return handleFailure(system, job, c, err);
  }
}

async function handleFailure(
  system: DbRunner,
  job: ClaimedJob,
  c: { id: string; campaign_id: string; client_name: string },
  err: unknown,
): Promise<PublishOutcome> {
  const message = err instanceof Error ? err.message : String(err);

  if (err instanceof ManualActionRequired) {
    await system(async (db) => {
      await db.query(`update publishing_jobs set status = 'manual_required', last_error = $3, updated_at = now() where id = $1 and client_id = $2`, [
        job.id,
        job.client_id,
        err.reason,
      ]);
      await db.query(`update comments set status = 'queued' where id = $1 and client_id = $2 and status = 'publishing'`, [c.id, job.client_id]);
      await notifyClient(db, {
        organizationId: job.organization_id,
        clientId: job.client_id,
        kind: "manual_action_required",
        title: `${c.client_name}: approved comment ready to post manually`,
        body: err.reason,
        link: `/clients/${job.client_id}/publishing`,
        audience: ["managers"],
      });
    });
    return { jobId: job.id, clientId: job.client_id, status: "manual_required", detail: err.reason };
  }

  const authExpired = (err instanceof PlatformApiError && err.authExpired) || err instanceof CredentialsUnavailableError;
  const retryable = err instanceof PlatformApiError && err.retryable && job.attempts < job.max_attempts;

  if (retryable) {
    const delay = (err as PlatformApiError).retryAfterSeconds ?? 300 * 2 ** (job.attempts - 1);
    await system(async (db) => {
      await db.query(
        `update publishing_jobs set status = 'queued', scheduled_for = now() + make_interval(secs => $3), last_error = $4, updated_at = now()
         where id = $1 and client_id = $2`,
        [job.id, job.client_id, delay, message],
      );
      await db.query(`update comments set status = 'queued' where id = $1 and client_id = $2 and status = 'publishing'`, [c.id, job.client_id]);
    });
    return { jobId: job.id, clientId: job.client_id, status: "rescheduled", detail: message };
  }

  await system(async (db) => {
    await db.query(`update publishing_jobs set status = 'failed', last_error = $3, updated_at = now() where id = $1 and client_id = $2`, [
      job.id,
      job.client_id,
      message.slice(0, 1000),
    ]);
    await db.query(`update comments set status = 'failed' where id = $1 and client_id = $2 and status = 'publishing'`, [c.id, job.client_id]);
    await db.query(
      `insert into publishing_results (organization_id, client_id, job_id, comment_id, success, method, error_code, error_message)
       values ($1, $2, $3, $4, false, 'api', $5, $6)`,
      [
        job.organization_id,
        job.client_id,
        job.id,
        c.id,
        err instanceof PlatformApiError ? err.code : err instanceof UnsupportedCapabilityError ? "unsupported" : null,
        message.slice(0, 1000),
      ],
    );
    if (authExpired && job.social_account_id) {
      await db.query(`update social_accounts set status = 'expired' where id = $1 and client_id = $2`, [job.social_account_id, job.client_id]);
      await notifyClient(db, {
        organizationId: job.organization_id,
        clientId: job.client_id,
        kind: "oauth_expired",
        title: `${c.client_name}: ${job.platform} connection expired`,
        body: "Reconnect the account to resume publishing.",
        link: `/clients/${job.client_id}/accounts`,
        audience: ["managers", "client_owners"],
      });
    }
    await audit(db, {
      organizationId: job.organization_id,
      clientId: job.client_id,
      campaignId: c.campaign_id,
      actorId: null,
      actorName: "Publishing worker",
      action: "comment.publish_failed",
      entityType: "comment",
      entityId: c.id,
      details: { error: message.slice(0, 300) },
    });
    await notifyClient(db, {
      organizationId: job.organization_id,
      clientId: job.client_id,
      kind: "publishing_failed",
      title: `${c.client_name}: publishing failed on ${job.platform}`,
      body: message.slice(0, 200),
      link: `/clients/${job.client_id}/publishing`,
      audience: ["managers"],
    });
  });
  return { jobId: job.id, clientId: job.client_id, status: "failed", detail: message };
}
