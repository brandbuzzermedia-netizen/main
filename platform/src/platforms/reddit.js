import { PlatformAdapter } from './adapter.js';
import { ManualActionRequired } from '../core/errors.js';

const API = process.env.REDDIT_API_BASE ?? 'https://oauth.reddit.com';
const UA = process.env.REDDIT_USER_AGENT ?? 'social-os/0.1 (by /u/your-agency-account)';

/**
 * Reddit — official API with OAuth.
 *
 * Reddit is the platform where promotional participation does the most damage,
 * so the engagement engine treats every Reddit opportunity as approval-required
 * regardless of score (see engines/engagement.js), and subreddit rules are
 * carried into the comment prompt.
 */
export class RedditAdapter extends PlatformAdapter {
  static platform = 'reddit';
  static displayName = 'Reddit';
  static requiredScopes = ['identity', 'submit', 'read', 'edit', 'history'];
  static capabilities = {
    publish: ['text', 'link', 'image'],
    comment: true,
    readPublicSearch: true,
    readOwnInsights: false,
    readMentions: true,
    scheduleNatively: false,
    notes: {
      reel: 'Reddit has no Reel format.',
      carousel: 'Gallery posts need a per-image upload flow; publish manually.',
      story: 'Reddit has no story format.',
    },
  };

  authorizeUrl({ state, redirectUri }) {
    const clientId = process.env.REDDIT_CLIENT_ID;
    if (!clientId) throw new ManualActionRequired(this.platform, 'REDDIT_CLIENT_ID is not configured.');
    const url = new URL('https://www.reddit.com/api/v1/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('duration', 'permanent');
    url.searchParams.set('scope', RedditAdapter.requiredScopes.join(' '));
    return url.toString();
  }

  async exchangeCode({ code, redirectUri }) {
    const basic = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64');
    const body = await this.http('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': UA,
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }).toString(),
    });
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
      scopes: RedditAdapter.requiredScopes,
    };
  }

  auth(creds) {
    return { authorization: `Bearer ${creds.accessToken}`, 'user-agent': UA };
  }

  async verify(creds) {
    const body = await this.http(`${API}/api/v1/me`, { headers: this.auth(creds) });
    return { ok: Boolean(body?.name), handle: body?.name, detail: body?.id };
  }

  async publish(creds, draft) {
    this.assertCanPublish(draft.contentType);
    const subreddit = /** @type {any} */ (draft.extra)?.subreddit;
    if (!subreddit) {
      throw new ManualActionRequired(this.platform, 'A target subreddit is required for Reddit posts.');
    }
    const params = new URLSearchParams({
      sr: subreddit,
      title: draft.title ?? (draft.caption ?? '').slice(0, 280),
      api_type: 'json',
      kind: draft.contentType === 'link' ? 'link' : 'self',
      ...(draft.contentType === 'link' ? { url: draft.linkUrl ?? '' } : { text: draft.caption ?? '' }),
    });
    const res = await this.http(`${API}/api/submit`, {
      method: 'POST',
      headers: { ...this.auth(creds), 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = res?.json?.data;
    return {
      externalId: data?.name ?? data?.id ?? null,
      url: data?.url ?? null,
      publishedAt: new Date().toISOString(),
      raw: res,
    };
  }

  async publishComment(creds, { targetId, body }) {
    const res = await this.http(`${API}/api/comment`, {
      method: 'POST',
      headers: { ...this.auth(creds), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ thing_id: targetId, text: body, api_type: 'json' }).toString(),
    });
    const thing = res?.json?.data?.things?.[0]?.data;
    return {
      externalId: thing?.name ?? null,
      url: thing?.permalink ? `https://www.reddit.com${thing.permalink}` : null,
      publishedAt: new Date().toISOString(),
      raw: res,
    };
  }

  async searchPublic(creds, { query, limit = 25 }) {
    if (!creds?.accessToken) return [];
    const url = new URL(`${API}/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(Math.min(limit, 100)));
    url.searchParams.set('sort', 'new');
    url.searchParams.set('type', 'link');
    const body = await this.http(url.toString(), { headers: this.auth(creds) });
    return (body?.data?.children ?? []).map(({ data }) => ({
      externalId: data.name,
      url: `https://www.reddit.com${data.permalink}`,
      author: data.author,
      excerpt: data.selftext?.slice(0, 600) || data.title,
      context: `r/${data.subreddit}`,
      postedAt: new Date(data.created_utc * 1000).toISOString(),
      metrics: { score: data.score, comments: data.num_comments, upvote_ratio: data.upvote_ratio },
    }));
  }

  /** Subreddit rules, fetched so the comment writer can respect them (§13). */
  async fetchRules(creds, subreddit) {
    const body = await this.http(`${API}/r/${encodeURIComponent(subreddit)}/about/rules`, {
      headers: this.auth(creds),
    }).catch(() => null);
    return (body?.rules ?? []).map((r) => ({ name: r.short_name, description: r.description }));
  }
}
