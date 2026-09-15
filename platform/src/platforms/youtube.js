import { PlatformAdapter } from './adapter.js';
import { ManualActionRequired } from '../core/errors.js';

const API = process.env.YOUTUBE_API_BASE ?? 'https://www.googleapis.com/youtube/v3';

/**
 * YouTube — Data API v3.
 *
 * Video uploads need a resumable multipart upload of the actual file, which the
 * publishing worker performs from the media store. Where the deployment has no
 * media store wired up, the adapter reports MANUAL_ACTION_REQUIRED rather than
 * publishing an empty video.
 */
export class YouTubeAdapter extends PlatformAdapter {
  static platform = 'youtube';
  static displayName = 'YouTube';
  static requiredScopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.force-ssl',
  ];
  static capabilities = {
    publish: ['short_video', 'long_video'],
    comment: true,
    readPublicSearch: true,
    readOwnInsights: true,
    readMentions: true,
    scheduleNatively: true,
    notes: {
      image: 'YouTube posts (community tab) are not available through the Data API.',
      text: 'Community posts are not publishable through the Data API.',
      carousel: 'Not a YouTube format.',
      story: 'YouTube retired Stories.',
    },
  };

  authorizeUrl({ state, redirectUri }) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new ManualActionRequired(this.platform, 'GOOGLE_CLIENT_ID is not configured.');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    url.searchParams.set('scope', YouTubeAdapter.requiredScopes.join(' '));
    return url.toString();
  }

  async exchangeCode({ code, redirectUri }) {
    const body = await this.http('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, redirect_uri: redirectUri, grant_type: 'authorization_code',
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      }).toString(),
    });
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
      scopes: YouTubeAdapter.requiredScopes,
    };
  }

  async refresh(creds) {
    if (!creds.refreshToken) throw new ManualActionRequired(this.platform, 'No refresh token stored; reconnect the account.');
    const body = await this.http('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: creds.refreshToken, grant_type: 'refresh_token',
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      }).toString(),
    });
    return {
      accessToken: body.access_token,
      refreshToken: creds.refreshToken,
      expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
    };
  }

  auth(creds) { return { authorization: `Bearer ${creds.accessToken}` }; }

  async verify(creds) {
    const body = await this.http(`${API}/channels?part=snippet&mine=true`, { headers: this.auth(creds) });
    const channel = body?.items?.[0];
    return { ok: Boolean(channel), handle: channel?.snippet?.title, detail: channel?.id };
  }

  async publish(creds, draft) {
    this.assertCanPublish(draft.contentType);
    const source = draft.media?.[0]?.url;
    if (!source) throw new ManualActionRequired(this.platform, 'YouTube publishing needs a video file.');

    // Resumable upload: initiate, then stream the file the media store holds.
    const metadata = {
      snippet: {
        title: (draft.title ?? draft.caption ?? 'Untitled').slice(0, 100),
        description: [draft.caption ?? '', (draft.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n').slice(0, 5000),
        tags: (draft.hashtags ?? []).map((h) => h.replace(/^#/, '')).slice(0, 15),
      },
      status: { privacyStatus: /** @type {any} */ (draft.extra)?.privacy ?? 'public', selfDeclaredMadeForKids: false },
    };

    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: { ...this.auth(creds), 'content-type': 'application/json', 'x-upload-content-type': 'video/*' },
        body: JSON.stringify(metadata),
      },
    );
    const uploadUrl = initRes.headers.get('location');
    if (!initRes.ok || !uploadUrl) {
      throw new ManualActionRequired(
        this.platform,
        `YouTube did not accept the upload session (${initRes.status}).`,
        'Upload the video in YouTube Studio and record the URL here.',
      );
    }

    const file = await fetch(source);
    if (!file.ok || !file.body) {
      throw new ManualActionRequired(this.platform, 'The media file could not be read from the media store.');
    }
    const uploaded = await this.http(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.headers.get('content-type') ?? 'video/*' },
      body: Buffer.from(await file.arrayBuffer()),
      timeoutMs: 15 * 60_000,
    });

    return {
      externalId: uploaded?.id,
      url: uploaded?.id ? `https://www.youtube.com/watch?v=${uploaded.id}` : null,
      publishedAt: new Date().toISOString(),
      raw: uploaded,
    };
  }

  async publishComment(creds, { targetId, body }) {
    const res = await this.http(`${API}/commentThreads?part=snippet`, {
      method: 'POST',
      headers: { ...this.auth(creds), 'content-type': 'application/json' },
      body: JSON.stringify({
        snippet: { videoId: targetId, topLevelComment: { snippet: { textOriginal: body } } },
      }),
    });
    return { externalId: res?.id, url: null, publishedAt: new Date().toISOString(), raw: res };
  }

  async searchPublic(creds, { query, limit = 20 }) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey && !creds?.accessToken) return [];
    const url = new URL(`${API}/search`);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'video');
    url.searchParams.set('order', 'viewCount');
    url.searchParams.set('maxResults', String(Math.min(limit, 50)));
    if (apiKey) url.searchParams.set('key', apiKey);
    const body = await this.http(url.toString(), {
      headers: creds?.accessToken ? this.auth(creds) : {},
    });
    return (body?.items ?? []).map((item) => ({
      externalId: item.id?.videoId,
      url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      author: item.snippet?.channelTitle,
      excerpt: item.snippet?.description,
      title: item.snippet?.title,
      thumbnailUrl: item.snippet?.thumbnails?.high?.url,
      postedAt: item.snippet?.publishedAt,
      metrics: {},
    }));
  }
}
