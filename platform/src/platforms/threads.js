import { PlatformAdapter } from './adapter.js';
import { ManualActionRequired } from '../core/errors.js';

const API = process.env.THREADS_API_BASE ?? 'https://graph.threads.net/v1.0';

/** Threads — official Threads API (container create, then publish). */
export class ThreadsAdapter extends PlatformAdapter {
  static platform = 'threads';
  static displayName = 'Threads';
  static requiredScopes = ['threads_basic', 'threads_content_publish', 'threads_manage_replies', 'threads_manage_insights'];
  static capabilities = {
    publish: ['text', 'image', 'short_video', 'link'],
    comment: true,
    readPublicSearch: false,
    readOwnInsights: true,
    readMentions: true,
    scheduleNatively: false,
    notes: {
      carousel: 'Carousels need a multi-container flow not enabled for this integration; post manually.',
      reel: 'Threads has no Reel type — publish as a video post.',
      document: 'Threads has no document post type.',
      story: 'Threads has no story format.',
    },
  };

  authorizeUrl({ state, redirectUri }) {
    const clientId = process.env.THREADS_APP_ID;
    if (!clientId) throw new ManualActionRequired(this.platform, 'THREADS_APP_ID is not configured.');
    const url = new URL('https://threads.net/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', ThreadsAdapter.requiredScopes.join(','));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode({ code, redirectUri }) {
    const body = await this.http(`${API}/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.THREADS_APP_ID ?? '',
        client_secret: process.env.THREADS_APP_SECRET ?? '',
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }).toString(),
    });
    return {
      accessToken: body.access_token,
      externalId: body.user_id ? String(body.user_id) : null,
      refreshToken: null,
      expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
      scopes: ThreadsAdapter.requiredScopes,
    };
  }

  async verify(creds) {
    const body = await this.http(`${API}/me?fields=id,username&access_token=${encodeURIComponent(creds.accessToken)}`);
    return { ok: Boolean(body?.id), handle: body?.username, detail: body?.id };
  }

  async post(path, params, token) {
    return this.http(`${API}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, access_token: token }).toString(),
    });
  }

  async publish(creds, draft) {
    this.assertCanPublish(draft.contentType);
    const userId = creds.externalId;
    if (!userId) throw new ManualActionRequired(this.platform, 'No Threads user id is linked.');

    const text = [draft.caption ?? '', (draft.hashtags ?? []).join(' '), draft.linkUrl ?? '']
      .filter(Boolean).join('\n\n').trim();

    const mediaType = draft.contentType === 'image' ? 'IMAGE'
      : draft.contentType === 'short_video' ? 'VIDEO' : 'TEXT';

    const container = await this.post(`${userId}/threads`, {
      media_type: mediaType,
      text,
      ...(mediaType === 'IMAGE' ? { image_url: draft.media?.[0]?.url ?? '' } : {}),
      ...(mediaType === 'VIDEO' ? { video_url: draft.media?.[0]?.url ?? '' } : {}),
    }, creds.accessToken);

    const published = await this.post(`${userId}/threads_publish`, { creation_id: container.id }, creds.accessToken);
    return {
      externalId: published.id,
      url: null,
      publishedAt: new Date().toISOString(),
      raw: published,
    };
  }

  async publishComment(creds, { targetId, body }) {
    const userId = creds.externalId;
    const container = await this.post(`${userId}/threads`, {
      media_type: 'TEXT', text: body, reply_to_id: targetId,
    }, creds.accessToken);
    const published = await this.post(`${userId}/threads_publish`, { creation_id: container.id }, creds.accessToken);
    return { externalId: published.id, url: null, publishedAt: new Date().toISOString(), raw: published };
  }
}
