import { PlatformAdapter } from './adapter.js';
import { ManualActionRequired } from '../core/errors.js';
import { createHash, randomBytes } from 'node:crypto';

const API = process.env.X_API_BASE ?? 'https://api.x.com';

/**
 * X (Twitter) — API v2 with OAuth 2.0 PKCE.
 * Public search is available on paid access tiers; on tiers without it the
 * adapter returns nothing rather than reaching for an unofficial source.
 */
export class XAdapter extends PlatformAdapter {
  static platform = 'x';
  static displayName = 'X';
  static requiredScopes = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];
  static capabilities = {
    publish: ['text', 'link', 'image', 'short_video'],
    comment: true,
    readPublicSearch: true,
    readOwnInsights: true,
    readMentions: true,
    scheduleNatively: false,
    notes: {
      carousel: 'X has no carousel type — attach up to four images to one post instead.',
      reel: 'Publish as a video post.',
      document: 'X has no document post type.',
      story: 'X has no story format.',
    },
  };

  static pkce() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

  authorizeUrl({ state, redirectUri, codeChallenge }) {
    const clientId = process.env.X_CLIENT_ID;
    if (!clientId) throw new ManualActionRequired(this.platform, 'X_CLIENT_ID is not configured.');
    const url = new URL('https://x.com/i/oauth2/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', XAdapter.requiredScopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge ?? '');
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchangeCode({ code, redirectUri, codeVerifier }) {
    const basic = Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64');
    const body = await this.http(`${API}/2/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: redirectUri,
        code_verifier: codeVerifier ?? '', client_id: process.env.X_CLIENT_ID ?? '',
      }).toString(),
    });
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
      scopes: XAdapter.requiredScopes,
    };
  }

  auth(creds) { return { authorization: `Bearer ${creds.accessToken}`, 'content-type': 'application/json' }; }

  async verify(creds) {
    const body = await this.http(`${API}/2/users/me`, { headers: this.auth(creds) });
    return { ok: Boolean(body?.data?.id), handle: body?.data?.username, detail: body?.data?.id };
  }

  async publish(creds, draft) {
    this.assertCanPublish(draft.contentType);
    const text = [draft.caption ?? '', (draft.hashtags ?? []).join(' '), draft.linkUrl ?? '']
      .filter(Boolean).join(' ').trim();
    if (text.length > 280) {
      throw new ManualActionRequired(
        this.platform,
        `Post is ${text.length} characters; X allows 280 on this access tier.`,
        'Shorten the post or split it into a thread.',
      );
    }
    const res = await this.http(`${API}/2/tweets`, {
      method: 'POST', headers: this.auth(creds), body: JSON.stringify({ text }),
    });
    const id = res?.data?.id;
    return {
      externalId: id,
      url: id ? `https://x.com/i/web/status/${id}` : null,
      publishedAt: new Date().toISOString(),
      raw: res,
    };
  }

  async publishComment(creds, { targetId, body }) {
    const res = await this.http(`${API}/2/tweets`, {
      method: 'POST',
      headers: this.auth(creds),
      body: JSON.stringify({ text: body, reply: { in_reply_to_tweet_id: targetId } }),
    });
    const id = res?.data?.id;
    return { externalId: id, url: id ? `https://x.com/i/web/status/${id}` : null, publishedAt: new Date().toISOString(), raw: res };
  }

  async searchPublic(creds, { query, limit = 20 }) {
    if (!creds?.accessToken) return [];
    const url = new URL(`${API}/2/tweets/search/recent`);
    url.searchParams.set('query', `${query} -is:retweet lang:en`);
    url.searchParams.set('max_results', String(Math.min(Math.max(limit, 10), 100)));
    url.searchParams.set('tweet.fields', 'created_at,public_metrics,author_id,conversation_id');
    const body = await this.http(url.toString(), { headers: this.auth(creds) });
    return (body?.data ?? []).map((t) => ({
      externalId: t.id,
      url: `https://x.com/i/web/status/${t.id}`,
      author: t.author_id,
      excerpt: t.text,
      postedAt: t.created_at,
      metrics: t.public_metrics ?? {},
    }));
  }
}
