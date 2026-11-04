import { SocialPlatformAdapter, type OAuthConfig } from "./adapter";
import { graph, metaAuthorizationUrl, metaConnectableAccounts, META_SCOPES } from "./meta";
import {
  ManualActionRequired,
  type AccountCredentials,
  type AccountProfile,
  type AuthorProfile,
  type CommentMetrics,
  type CommentRules,
  type DiscoveredItem,
  type DiscoveryQuery,
  type PlatformCapabilities,
  type ProfileMetrics,
  type PublishResult,
  type PublishTarget,
} from "./types";

interface IgMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  username?: string;
}

interface IgComment {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  like_count?: number;
  replies?: { data?: { username?: string }[] };
}

const MEDIA_FIELDS = "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count";

/**
 * Instagram API with Facebook Login (Business/Creator accounts).
 * Publishing is limited to the account's own media, replies on its own media,
 * and replies where it was @mentioned. Commenting on other accounts' media is not
 * offered by the API, so those opportunities are manual.
 */
export class InstagramAdapter extends SocialPlatformAdapter {
  readonly platform = "instagram" as const;
  readonly scopes = META_SCOPES;

  readonly capabilities: PlatformCapabilities = {
    connect: { status: "supported", note: "Business or Creator account linked to a Facebook Page" },
    discoverByHashtag: {
      status: "limited",
      note: "30 unique hashtags per account per 7 days; recent_media covers 24 hours; no author username returned",
    },
    discoverByKeyword: { status: "unsupported", note: "No keyword search in the Instagram API" },
    monitorProfiles: { status: "limited", note: "Business Discovery works only for Business/Creator accounts" },
    ownPostComments: { status: "supported" },
    mentions: { status: "supported", note: "Media the account is tagged in" },
    getAuthor: { status: "limited", note: "Business/Creator accounts only" },
    publishReplyOnOwnPost: { status: "supported" },
    publishOnOwnPost: { status: "supported" },
    publishMentionReply: { status: "supported" },
    publishOnThirdPartyPost: { status: "manual", note: "The API cannot comment on media owned by other accounts" },
    commentMetrics: { status: "supported", note: "Own comments" },
    profileMetrics: { status: "supported" },
  };

  readonly commentRules: CommentRules = {
    maxLength: 2200,
    linksClickable: false,
    maxHashtags: 2,
    maxMentions: 1,
    styleNotes: "Conversational, 1–3 sentences. Links are not clickable in Instagram comments, so never include URLs.",
  };

  authorizationUrl(p: { state: string; redirectUri: string; codeChallenge: string; config: OAuthConfig }) {
    return metaAuthorizationUrl(p);
  }

  async connectAccount(p: { code: string; redirectUri: string; codeVerifier: string; config: OAuthConfig }) {
    return (await metaConnectableAccounts(this.fetchImpl, p)).filter((a) => a.platform === "instagram");
  }

  async getAccount(creds: AccountCredentials): Promise<AccountProfile> {
    const r = await graph<{ id: string; username?: string; name?: string; followers_count?: number }>(
      this.fetchImpl,
      creds.externalAccountId,
      creds.accessToken,
      { query: { fields: "id,username,name,followers_count" } },
    );
    return {
      externalAccountId: r.id,
      handle: r.username ?? null,
      displayName: r.name ?? r.username ?? null,
      accountType: "business",
      followers: r.followers_count ?? null,
    };
  }

  async discoverContent(creds: AccountCredentials, q: DiscoveryQuery): Promise<DiscoveredItem[]> {
    const items: DiscoveredItem[] = [];
    const own = (creds.metadata.handle as string | undefined)?.toLowerCase();

    // 1. Hashtags (caller has already enforced the 30-per-7-days budget).
    for (const raw of q.hashtags) {
      const tag = raw.replace(/^#/, "").toLowerCase();
      if (!tag) continue;
      const search = await graph<{ data: { id: string }[] }>(this.fetchImpl, "ig_hashtag_search", creds.accessToken, {
        query: { user_id: creds.externalAccountId, q: tag },
      });
      const hashtagId = search.data?.[0]?.id;
      if (!hashtagId) continue;
      const media = await graph<{ data: IgMedia[] }>(this.fetchImpl, `${hashtagId}/recent_media`, creds.accessToken, {
        query: { user_id: creds.externalAccountId, fields: MEDIA_FIELDS, limit: Math.min(50, q.limit) },
      });
      for (const m of media.data ?? []) {
        if (!isNewer(m.timestamp, q.since)) continue;
        items.push(this.mediaToItem(m, "third_party_post", `hashtag:#${tag}`));
      }
    }

    // 2. Comments on the account's own recent media (inbound conversations).
    const recent = await graph<{ data: IgMedia[] }>(this.fetchImpl, `${creds.externalAccountId}/media`, creds.accessToken, {
      query: { fields: "id,caption,permalink,timestamp,comments_count", limit: 10 },
    });
    for (const m of recent.data ?? []) {
      if (!m.comments_count) continue;
      const comments = await graph<{ data: IgComment[] }>(this.fetchImpl, `${m.id}/comments`, creds.accessToken, {
        query: { fields: "id,text,username,timestamp,like_count,replies{username}", limit: 50 },
      });
      for (const c of comments.data ?? []) {
        if (!isNewer(c.timestamp, q.since)) continue;
        if (own && c.username?.toLowerCase() === own) continue;
        if (own && c.replies?.data?.some((r) => r.username?.toLowerCase() === own)) continue; // already answered
        items.push({
          ...this.mediaToItem(m, "own_post_comment", "own-post-comments"),
          replyToExternalId: c.id,
          replyToText: c.text ?? "",
          replyToAuthor: c.username ?? null,
          authorHandle: c.username ?? null,
          publishCapability: "api",
        });
      }
    }

    // 3. Media the account is tagged in.
    const tags = await graph<{ data: IgMedia[] }>(this.fetchImpl, `${creds.externalAccountId}/tags`, creds.accessToken, {
      query: { fields: `${MEDIA_FIELDS},username`, limit: 25 },
    });
    for (const m of tags.data ?? []) {
      if (!isNewer(m.timestamp, q.since)) continue;
      items.push({ ...this.mediaToItem(m, "mention", "tagged"), authorHandle: m.username ?? null });
    }

    // 4. Target profiles via Business Discovery (Business/Creator accounts only).
    for (const handle of q.targetHandles) {
      const author = await this.businessDiscovery(creds, handle, true).catch(() => null);
      for (const m of author?.media ?? []) {
        if (!isNewer(m.timestamp, q.since)) continue;
        items.push({
          ...this.mediaToItem(m, "third_party_post", `profile:@${handle}`),
          authorHandle: author!.profile.handle,
          authorName: author!.profile.name,
          authorBio: author!.profile.bio,
          authorFollowers: author!.profile.followers,
          authorIsBusiness: true,
        });
      }
    }

    return items.slice(0, Math.max(q.limit, 0) * 3);
  }

  async getPost(creds: AccountCredentials, externalPostId: string): Promise<DiscoveredItem | null> {
    // Only media the account can access (its own or tagged media).
    const m = await graph<IgMedia>(this.fetchImpl, externalPostId, creds.accessToken, {
      query: { fields: `${MEDIA_FIELDS},username` },
    }).catch(() => null);
    return m ? { ...this.mediaToItem(m, "own_post_comment", "lookup"), authorHandle: m.username ?? null } : null;
  }

  async getAuthor(creds: AccountCredentials, handle: string): Promise<AuthorProfile | null> {
    return (await this.businessDiscovery(creds, handle, false).catch(() => null))?.profile ?? null;
  }

  async publishComment(creds: AccountCredentials, t: PublishTarget): Promise<PublishResult> {
    if (t.opportunityType === "own_post_comment") {
      const path = t.replyToExternalId ? `${t.replyToExternalId}/replies` : `${t.externalPostId}/comments`;
      const r = await graph<{ id: string }>(this.fetchImpl, path, creds.accessToken, {
        method: "POST",
        form: { message: t.text },
      });
      return { externalCommentId: r.id, url: null };
    }
    if (t.opportunityType === "mention") {
      const form: Record<string, string> = { media_id: t.externalPostId, message: t.text };
      if (t.replyToExternalId) form.comment_id = t.replyToExternalId;
      const r = await graph<{ id: string }>(this.fetchImpl, `${creds.externalAccountId}/mentions`, creds.accessToken, {
        method: "POST",
        form,
      });
      return { externalCommentId: r.id, url: null };
    }
    throw new ManualActionRequired(
      "Instagram's API does not allow commenting on media owned by other accounts. Post this approved comment from the client's Instagram app and record the link.",
    );
  }

  async getCommentMetrics(creds: AccountCredentials, id: string): Promise<CommentMetrics | null> {
    const r = await graph<{ like_count?: number; replies?: { data?: unknown[] } }>(this.fetchImpl, id, creds.accessToken, {
      query: { fields: "like_count,replies.limit(100){id}" },
    }).catch(() => null);
    return r ? { likes: r.like_count ?? 0, replies: r.replies?.data?.length ?? 0 } : null;
  }

  async getProfileMetrics(creds: AccountCredentials): Promise<ProfileMetrics> {
    const acct = await this.getAccount(creds);
    let profileVisits: number | null = null;
    try {
      const ins = await graph<{ data: { name: string; total_value?: { value: number } }[] }>(
        this.fetchImpl,
        `${creds.externalAccountId}/insights`,
        creds.accessToken,
        { query: { metric: "profile_views", period: "day", metric_type: "total_value" } },
      );
      profileVisits = ins.data?.find((d) => d.name === "profile_views")?.total_value?.value ?? null;
    } catch {
      profileVisits = null; // metric availability varies by account and API version
    }
    return { followers: acct.followers, profileVisits };
  }

  private async businessDiscovery(creds: AccountCredentials, handle: string, withMedia: boolean) {
    const username = handle.replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, "");
    const mediaPart = withMedia ? `,media.limit(10){${MEDIA_FIELDS}}` : "";
    const r = await graph<{
      business_discovery?: {
        username: string;
        name?: string;
        biography?: string;
        followers_count?: number;
        media?: { data: IgMedia[] };
      };
    }>(this.fetchImpl, creds.externalAccountId, creds.accessToken, {
      query: { fields: `business_discovery.username(${username}){username,name,biography,followers_count${mediaPart}}` },
    });
    const b = r.business_discovery;
    if (!b) return null;
    return {
      profile: {
        handle: b.username,
        name: b.name ?? null,
        bio: b.biography ?? null,
        followers: b.followers_count ?? null,
        isBusiness: true,
        url: `https://www.instagram.com/${b.username}/`,
      } satisfies AuthorProfile,
      media: b.media?.data ?? [],
    };
  }

  private mediaToItem(m: IgMedia, type: DiscoveredItem["opportunityType"], via: string): DiscoveredItem {
    return {
      externalPostId: m.id,
      url: m.permalink ?? null,
      authorHandle: null,
      authorName: null,
      authorExternalId: null,
      authorBio: null,
      authorFollowers: null,
      authorIsBusiness: null,
      content: m.caption ?? "",
      media: m.media_type ? [{ type: m.media_type.toLowerCase(), url: m.media_url }] : [],
      metrics: { likes: m.like_count, comments: m.comments_count },
      postedAt: m.timestamp ? new Date(m.timestamp) : null,
      opportunityType: type,
      publishCapability: this.publishCapabilityFor(type),
      discoveredVia: via,
    };
  }
}

function isNewer(ts: string | undefined, since: Date): boolean {
  return !ts || new Date(ts) >= since;
}
