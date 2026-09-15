import { MetaAdapter } from './meta.js';
import { ManualActionRequired } from '../core/errors.js';

/** Facebook Pages — Graph API publishing against a Page access token. */
export class FacebookAdapter extends MetaAdapter {
  static platform = 'facebook';
  static displayName = 'Facebook';
  static requiredScopes = [
    'pages_show_list', 'pages_manage_posts', 'pages_read_engagement',
    'pages_manage_engagement', 'read_insights',
  ];
  static capabilities = {
    publish: ['image', 'text', 'link', 'short_video', 'long_video', 'reel'],
    comment: true,
    readPublicSearch: false,
    readOwnInsights: true,
    readMentions: true,
    scheduleNatively: true,
    notes: {
      story: 'Page Stories are not publishable through this integration. Post from the Facebook app.',
      carousel: 'Multi-photo carousels need the paid ads API; publish manually or post as separate images.',
      document: 'Facebook has no document post type.',
    },
  };

  async publish(creds, draft) {
    this.assertCanPublish(draft.contentType);
    const pageId = creds.externalId;
    if (!pageId) throw new ManualActionRequired(this.platform, 'No Facebook Page id is linked.');
    const message = [draft.caption ?? '', (draft.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n');

    let res;
    if (draft.contentType === 'image' && draft.media?.length) {
      res = await this.graphPost(`${pageId}/photos`, { url: draft.media[0].url, caption: message }, creds.accessToken);
    } else if (['short_video', 'long_video', 'reel'].includes(draft.contentType) && draft.media?.length) {
      res = await this.graphPost(`${pageId}/videos`, { file_url: draft.media[0].url, description: message }, creds.accessToken);
    } else {
      res = await this.graphPost(`${pageId}/feed`, {
        message, ...(draft.linkUrl ? { link: draft.linkUrl } : {}),
      }, creds.accessToken);
    }

    const id = res.post_id ?? res.id;
    return {
      externalId: id,
      url: id ? `https://www.facebook.com/${id}` : null,
      publishedAt: new Date().toISOString(),
      raw: res,
    };
  }

  async publishComment(creds, { targetId, body }) {
    const res = await this.graphPost(`${targetId}/comments`, { message: body }, creds.accessToken);
    return { externalId: res.id, url: null, publishedAt: new Date().toISOString(), raw: res };
  }

  async fetchInsights(creds, { externalIds = [] }) {
    const out = [];
    for (const id of externalIds) {
      const body = await this.graphGet(`${id}/insights`, {
        metric: 'post_impressions,post_engaged_users,post_clicks',
      }, creds.accessToken).catch(() => null);
      if (body?.data) {
        /** @type {Record<string, number>} */
        const metrics = {};
        for (const entry of body.data) metrics[entry.name] = entry.values?.[0]?.value ?? 0;
        out.push({ externalId: id, metrics });
      }
    }
    return out;
  }
}
