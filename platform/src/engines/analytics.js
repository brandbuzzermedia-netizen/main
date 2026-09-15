import { list, rawScoped } from '../db/repo.js';
import { agents } from '../ai/agents/index.js';
import { log } from '../core/logger.js';

/**
 * Performance analytics (§32) and the AI learning loop (§33).
 *
 * Everything here is computed from the client's own published content and the
 * metrics their connected accounts returned. No cross-client data is ever mixed
 * into a client's analysis.
 */

/** @param {{agencyId:string, clientId:string, days?:number}} q */
export function performanceSummary({ agencyId, clientId, days = 30 }) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const published = list('published_content', agencyId,
    { client_id: clientId, published_at: { op: 'gte', value: since } },
    { orderBy: 'published_at DESC', limit: 500 });

  const scheduled = list('scheduled_content', agencyId, { client_id: clientId }, { limit: 500 });
  const comments = list('published_comments', agencyId,
    { client_id: clientId, published_at: { op: 'gte', value: since } }, { limit: 500 });
  const opportunities = list('engagement_opportunities', agencyId, { client_id: clientId }, { limit: 500 });
  const jobs = list('publishing_jobs', agencyId, { client_id: clientId }, { limit: 500 });

  const succeeded = jobs.filter((j) => j.status === 'succeeded').length;
  const failed = jobs.filter((j) => ['failed', 'dead_letter'].includes(j.status)).length;

  const totals = published.reduce((acc, p) => {
    const m = p.metrics ?? {};
    acc.reach += num(m.reach ?? m.impressions);
    acc.views += num(m.views ?? m.impressions);
    acc.likes += num(m.likes ?? m.like_count);
    acc.comments += num(m.comments ?? m.comment_count);
    acc.shares += num(m.shares ?? m.share_count);
    acc.saves += num(m.saved ?? m.saves);
    acc.clicks += num(m.clicks ?? m.post_clicks);
    return acc;
  }, { reach: 0, views: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0 });

  const engagementTotal = totals.likes + totals.comments + totals.shares + totals.saves;
  const engagementRate = totals.reach > 0 ? engagementTotal / totals.reach : 0;

  return {
    window_days: days,
    publishing: {
      scheduled: scheduled.length,
      published: published.length,
      failures: failed,
      success_rate: succeeded + failed > 0 ? Number((succeeded / (succeeded + failed)).toFixed(3)) : null,
      manual_action_required: scheduled.filter((s) => s.status === 'MANUAL_ACTION_REQUIRED').length,
    },
    reach: totals,
    engagement_rate: Number(engagementRate.toFixed(4)),
    engagement: {
      comments_published: comments.length,
      opportunities_found: opportunities.length,
      opportunities_engaged: opportunities.filter((o) => o.status === 'engaged').length,
      approval_rate: approvalRate(agencyId, clientId),
      replies_received: comments.reduce((n, c) => n + num(c.metrics?.replies), 0),
    },
    best: {
      platform: bestBy(published, (p) => p.platform),
      content_type: bestBy(published, (p) => p.content_type),
    },
    top_posts: [...published]
      .sort((a, b) => engagementOf(b) - engagementOf(a))
      .slice(0, 5)
      .map((p) => ({
        id: p.id, platform: p.platform, content_type: p.content_type,
        url: p.url, published_at: p.published_at,
        caption: String(p.caption ?? '').slice(0, 140),
        engagement: engagementOf(p),
      })),
  };
}

function approvalRate(agencyId, clientId) {
  const rows = rawScoped(
    `SELECT status, COUNT(*) AS n FROM approval_items
      WHERE agency_id = ? AND client_id = ? GROUP BY status`,
    agencyId, [agencyId, clientId],
  );
  const total = rows.reduce((n, r) => n + Number(r.n), 0);
  const approved = rows.filter((r) => r.status === 'approved').reduce((n, r) => n + Number(r.n), 0);
  return total ? Number((approved / total).toFixed(3)) : null;
}

function bestBy(published, keyFn) {
  /** @type {Map<string, {total:number, n:number}>} */
  const groups = new Map();
  for (const p of published) {
    const key = keyFn(p);
    if (!key) continue;
    const g = groups.get(key) ?? { total: 0, n: 0 };
    g.total += engagementOf(p);
    g.n += 1;
    groups.set(key, g);
  }
  const ranked = [...groups.entries()]
    .map(([key, g]) => ({ key, average: g.total / g.n, samples: g.n }))
    .sort((a, b) => b.average - a.average);
  if (!ranked.length) return null;
  return {
    ...ranked[0],
    average: Number(ranked[0].average.toFixed(1)),
    confident: ranked[0].samples >= 4,
  };
}

export function engagementOf(row) {
  const m = row.metrics ?? {};
  return num(m.likes ?? m.like_count) + num(m.comments ?? m.comment_count)
    + num(m.shares ?? m.share_count) + num(m.saved ?? m.saves);
}

/**
 * AI learning loop (§33): feed the client's own published history to the
 * Performance Analyst and store what it finds as a recommendation.
 */
export async function runLearningLoop({ agencyId, client }) {
  const published = list('published_content', agencyId, { client_id: client.id },
    { orderBy: 'published_at DESC', limit: 200 });
  const comments = list('published_comments', agencyId, { client_id: client.id },
    { orderBy: 'published_at DESC', limit: 200 });

  const samples = [
    ...published.map((p) => ({
      group: p.content_type, platform: p.platform, kind: 'post',
      engagement: engagementOf(p), published_at: p.published_at,
    })),
    ...comments.map((c) => ({
      group: 'comment', platform: c.platform, kind: 'comment',
      engagement: num(c.metrics?.likes) + num(c.metrics?.replies), published_at: c.published_at,
    })),
  ].filter((s) => s.published_at);

  if (samples.length < 3) {
    return { skipped: `Only ${samples.length} published items — not enough to learn from yet.`, samples: samples.length };
  }

  try {
    const run = await agents.performanceAnalyst.run(
      { agencyId, clientId: client.id },
      { client_name: client.name, samples: samples.slice(0, 400) },
    );
    return { ...run.output, samples: samples.length, promptVersionId: run.promptVersionId };
  } catch (err) {
    log.warn('learning_loop_failed', { client_id: client.id, err: String(err.message ?? err) });
    return { error: String(err.message ?? err), samples: samples.length };
  }
}

function num(v) { return Number.isFinite(Number(v)) ? Number(v) : 0; }
