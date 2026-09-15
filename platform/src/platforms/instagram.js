import { MetaAdapter, GRAPH } from './meta.js';
import { ManualActionRequired } from '../core/errors.js';

/**
 * Instagram — Instagram Graph API (Professional accounts only).
 *
 * Publishing uses the documented two-step container flow: create a media
 * container, then publish it. Stories are not offered here: container
 * publishing for stories is not generally available to all app types, so the
 * system reports MANUAL_ACTION_REQUIRED rather than guessing.
 */
export class InstagramAdapter extends MetaAdapter {
  static platform = 'instagram';
  static displayName = 'Instagram';
  static requiredScopes = [
    'instagram_basic', 'instagram_content_publish',
    'instagram_manage_comments', 'instagram_manage_insights',
    'pages_show_list', 'pages_read_engagement',
  ];
  static capabilities = {
    publish: ['image', 'carousel', 'reel'],
    comment: true,
    readPublicSearch: false,   // no general public-search API
    readOwnInsights: true,
    readMentions: true,
    scheduleNatively: false,
    notes: {
      story: 'Story publishing is not available to this integration type. Post the story from the Instagram app.',
      long_video: 'Upload long-form video directly in the Instagram app or via a Reel under the platform limit.',
      text: 'Instagram has no text-only post type.',
      link: 'Instagram captions do not support clickable links; use the profile link or a Story sticker manually.',
    },
  };

  async publish(creds, draft) {
    this.assertCanPublish(draft.contentType);
    const igId = creds.externalId;
    if (!igId) throw new ManualActionRequired(this.platform, 'No Instagram professional account id is linked.');

    const caption = [draft.caption ?? '', (draft.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n');
    const media = draft.media ?? [];
    if (!media.length) throw new ManualActionRequired(this.platform, 'Instagram requires at least one media item.');

    let containerId;
    if (draft.contentType === 'carousel') {
      const children = [];
      for (const item of media.slice(0, 10)) {
        const child = await this.graphPost(`${igId}/media`, {
          ...(item.type === 'video' ? { video_url: item.url, media_type: 'VIDEO' } : { image_url: item.url }),
          is_carousel_item: 'true',
        }, creds.accessToken);
        children.push(child.id);
      }
      const parent = await this.graphPost(`${igId}/media`, {
        media_type: 'CAROUSEL', children: children.join(','), caption,
      }, creds.accessToken);
      containerId = parent.id;
    } else if (draft.contentType === 'reel') {
      const created = await this.graphPost(`${igId}/media`, {
        media_type: 'REELS', video_url: media[0].url, caption,
      }, creds.accessToken);
      containerId = created.id;
    } else {
      const created = await this.graphPost(`${igId}/media`, {
        image_url: media[0].url, caption,
      }, creds.accessToken);
      containerId = created.id;
    }

    const published = await this.graphPost(`${igId}/media_publish`, { creation_id: containerId }, creds.accessToken);
    const permalink = await this.graphGet(`${published.id}`, { fields: 'permalink' }, creds.accessToken)
      .catch(() => ({ permalink: null }));

    return {
      externalId: published.id,
      url: permalink?.permalink ?? null,
      publishedAt: new Date().toISOString(),
      raw: published,
    };
  }

  async publishComment(creds, { targetId, body }) {
    const res = await this.graphPost(`${targetId}/replies`, { message: body }, creds.accessToken);
    return { externalId: res.id, url: null, publishedAt: new Date().toISOString(), raw: res };
  }

  /**
   * Instagram offers no public conversation search. Returning [] is the honest
   * answer; the engagement engine falls back to owned-media comments and
   * mentions, which are officially available.
   */
  async searchPublic() { return []; }

  async fetchInsights(creds, { externalIds = [] }) {
    const out = [];
    for (const id of externalIds) {
      const body = await this.graphGet(`${id}/insights`, {
        metric: 'impressions,reach,saved,likes,comments,shares',
      }, creds.accessToken).catch(() => null);
      if (body?.data) out.push({ externalId: id, metrics: normaliseInsights(body.data) });
    }
    return out;
  }
}

function normaliseInsights(data) {
  /** @type {Record<string, number>} */
  const metrics = {};
  for (const entry of data) metrics[entry.name] = entry.values?.[0]?.value ?? 0;
  return metrics;
}
export { GRAPH };
