import { PlatformAdapter } from './adapter.js';
import { ManualActionRequired } from '../core/errors.js';

const API = process.env.LINKEDIN_API_BASE ?? 'https://api.linkedin.com';

/**
 * LinkedIn — Marketing Developer Platform / Share on LinkedIn.
 * Publishing targets an organization URN the account owner administers.
 */
export class LinkedInAdapter extends PlatformAdapter {
  static platform = 'linkedin';
  static displayName = 'LinkedIn';
  static requiredScopes = ['w_member_social', 'r_organization_social', 'w_organization_social', 'rw_organization_admin'];
  static capabilities = {
    publish: ['text', 'link', 'image', 'document', 'short_video'],
    comment: true,
    readPublicSearch: false,     // no general content-search API
    readOwnInsights: true,
    readMentions: true,
    scheduleNatively: false,
    notes: {
      carousel: 'LinkedIn carousels are document posts — upload the PDF as a document post instead.',
      reel: 'LinkedIn has no Reel format; publish as a video post.',
      story: 'LinkedIn removed Stories.',
    },
  };

  authorizeUrl({ state, redirectUri }) {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    if (!clientId) throw new ManualActionRequired(this.platform, 'LINKEDIN_CLIENT_ID is not configured.');
    const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', LinkedInAdapter.requiredScopes.join(' '));
    return url.toString();
  }

  async exchangeCode({ code, redirectUri }) {
    const body = await this.http('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
      }).toString(),
    });
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
      scopes: LinkedInAdapter.requiredScopes,
    };
  }

  headers(creds) {
    return {
      authorization: `Bearer ${creds.accessToken}`,
      'x-restli-protocol-version': '2.0.0',
      'linkedin-version': process.env.LINKEDIN_VERSION ?? '202409',
      'content-type': 'application/json',
    };
  }

  async verify(creds) {
    const body = await this.http(`${API}/v2/userinfo`, { headers: this.headers(creds) });
    return { ok: Boolean(body?.sub), handle: body?.name, detail: body?.sub };
  }

  async publish(creds, draft) {
    this.assertCanPublish(draft.contentType);
    const author = creds.externalId;
    if (!author) throw new ManualActionRequired(this.platform, 'No LinkedIn organization or member URN is linked.');

    const commentary = [draft.caption ?? '', (draft.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n');
    /** @type {Record<string, any>} */
    const payload = {
      author,
      commentary,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };
    if (draft.contentType === 'link' && draft.linkUrl) {
      payload.content = { article: { source: draft.linkUrl, title: draft.title ?? draft.linkUrl } };
    }
    // Image/document posts require an upload-registration round trip; when the
    // caller has not supplied a LinkedIn asset URN we refuse rather than post a
    // text-only version the reviewer did not approve.
    if (['image', 'document', 'short_video'].includes(draft.contentType)) {
      const asset = /** @type {any} */ (draft.extra)?.linkedinAssetUrn;
      if (!asset) {
        throw new ManualActionRequired(
          this.platform,
          'LinkedIn media posts need an asset registered through the Assets API first.',
          'Upload the media in LinkedIn, or register the asset and retry with its URN.',
        );
      }
      payload.content = { media: { id: asset, title: draft.title ?? undefined } };
    }

    const res = await this.http(`${API}/rest/posts`, {
      method: 'POST', headers: this.headers(creds), body: JSON.stringify(payload),
    });
    const id = res?.id ?? null;
    return {
      externalId: id,
      url: id ? `https://www.linkedin.com/feed/update/${id}` : null,
      publishedAt: new Date().toISOString(),
      raw: res,
    };
  }

  async publishComment(creds, { targetId, body }) {
    const res = await this.http(`${API}/v2/socialActions/${encodeURIComponent(targetId)}/comments`, {
      method: 'POST',
      headers: this.headers(creds),
      body: JSON.stringify({ actor: creds.externalId, message: { text: body } }),
    });
    return { externalId: res?.id ?? null, url: null, publishedAt: new Date().toISOString(), raw: res };
  }
}
