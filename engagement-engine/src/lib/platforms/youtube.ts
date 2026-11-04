import { SocialPlatformAdapter, type OAuthConfig } from "./adapter";
import { requestJson, retryAfter, type HttpOptions } from "./http";
import {
  PlatformApiError,
  type AccountCredentials,
  type AccountProfile,
  type AuthorProfile,
  type CommentMetrics,
  type CommentRules,
  type ConnectableAccount,
  type DiscoveredItem,
  type DiscoveryQuery,
  type PlatformCapabilities,
  type ProfileMetrics,
  type PublishResult,
  type PublishTarget,
  type TokenSet,
} from "./types";

const API = "https://www.googleapis.com/youtube/v3";

function classify(status: number, body: unknown, headers: Headers): PlatformApiError {
  const e = (body as { error?: { message?: string; errors?: { reason?: string }[] } })?.error;
  const reason = e?.errors?.[0]?.reason ?? null;
  const msg = e?.message ?? `YouTube API error ${status}`;
  if (status === 401) return new PlatformApiError(msg, status, reason, false, true);
  const quota = reason === "quotaExceeded" || reason === "rateLimitExceeded" || status === 429;
  return new PlatformApiError(msg, status, reason, quota || status >= 500, false, quota ? (retryAfter(headers) ?? 3600) : null);
}

interface YtVideo {
  id: string | { videoId?: string };
  snippet?: { title?: string; description?: string; channelId?: string; channelTitle?: string; publishedAt?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}

/** YouTube Data API v3. search.list costs 100 quota units; commentThreads.insert costs 50. */
export class YouTubeAdapter extends SocialPlatformAdapter {
  readonly platform = "youtube" as const;
  readonly scopes = ["https://www.googleapis.com/auth/youtube.force-ssl"];

  readonly capabilities: PlatformCapabilities = {
    connect: { status: "supported" },
    discoverByHashtag: { status: "limited", note: "Hashtags are searched as keywords" },
    discoverByKeyword: { status: "supported", note: "search.list, 100 units per call (default quota 10,000/day)" },
    monitorProfiles: { status: "supported", note: "Channel uploads" },
    ownPostComments: { status: "supported" },
    mentions: { status: "unsupported" },
    getAuthor: { status: "supported", note: "Public channel statistics" },
    publishReplyOnOwnPost: { status: "supported" },
    publishOnOwnPost: { status: "supported" },
    publishMentionReply: { status: "unsupported" },
    publishOnThirdPartyPost: { status: "supported", note: "commentThreads.insert on videos with comments enabled" },
    commentMetrics: { status: "supported" },
    profileMetrics: { status: "supported" },
  };

  readonly commentRules: CommentRules = {
    maxLength: 10000,
    linksClickable: true,
    maxHashtags: 0,
    maxMentions: 0,
    styleNotes: "Reference a specific moment or point from the video. 1–3 sentences. No links.",
  };

  private api<T>(path: string, token: string, opts: Omit<HttpOptions, "bearer"> = {}) {
    return requestJson<T>(this.fetchImpl, `${API}/${path}`, { ...opts, bearer: token }, classify);
  }

  authorizationUrl(p: { state: string; redirectUri: string; codeChallenge: string; config: OAuthConfig }) {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", p.config.clientId);
    u.searchParams.set("redirect_uri", p.redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", this.scopes.join(" "));
    u.searchParams.set("state", p.state);
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "consent");
    u.searchParams.set("code_challenge", p.codeChallenge);
    u.searchParams.set("code_challenge_method", "S256");
    return u.toString();
  }

  async connectAccount(p: { code: string; redirectUri: string; codeVerifier: string; config: OAuthConfig }) {
    const t = await requestJson<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>(
      this.fetchImpl,
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        form: {
          grant_type: "authorization_code",
          code: p.code,
          redirect_uri: p.redirectUri,
          client_id: p.config.clientId,
          client_secret: p.config.clientSecret,
          code_verifier: p.codeVerifier,
        },
      },
      classify,
    );
    const token: TokenSet = {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? null,
      expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
      scopes: (t.scope ?? "").split(" ").filter(Boolean),
    };
    const ch = await this.api<{ items?: { id: string; snippet?: { title?: string; customUrl?: string } }[] }>("channels", token.accessToken, {
      query: { part: "snippet", mine: "true" },
    });
    return (ch.items ?? []).map<ConnectableAccount>((c) => ({
      platform: "youtube",
      externalAccountId: c.id,
      handle: c.snippet?.customUrl ?? null,
      displayName: c.snippet?.title ?? null,
      accountType: "channel",
      token,
      metadata: {},
    }));
  }

  async refreshToken(refreshToken: string, config: OAuthConfig): Promise<TokenSet | null> {
    const t = await requestJson<{ access_token: string; expires_in?: number }>(
      this.fetchImpl,
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        form: { grant_type: "refresh_token", refresh_token: refreshToken, client_id: config.clientId, client_secret: config.clientSecret },
      },
      classify,
    );
    return {
      accessToken: t.access_token,
      refreshToken,
      expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
      scopes: this.scopes,
    };
  }

  async disconnectAccount(creds: AccountCredentials): Promise<void> {
    await this.fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(creds.accessToken)}`, { method: "POST" }).catch(
      () => {},
    );
  }

  async getAccount(creds: AccountCredentials): Promise<AccountProfile> {
    const r = await this.api<{ items?: { id: string; snippet?: { title?: string; customUrl?: string }; statistics?: { subscriberCount?: string } }[] }>(
      "channels",
      creds.accessToken,
      { query: { part: "snippet,statistics", id: creds.externalAccountId } },
    );
    const c = r.items?.[0];
    return {
      externalAccountId: creds.externalAccountId,
      handle: c?.snippet?.customUrl ?? null,
      displayName: c?.snippet?.title ?? null,
      accountType: "channel",
      followers: c?.statistics?.subscriberCount ? Number(c.statistics.subscriberCount) : null,
    };
  }

  async discoverContent(creds: AccountCredentials, q: DiscoveryQuery): Promise<DiscoveredItem[]> {
    const terms = [...q.keywords, ...q.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`))].slice(0, 3);
    const items: DiscoveredItem[] = [];
    for (const term of terms) {
      const r = await this.api<{ items?: YtVideo[] }>("search", creds.accessToken, {
        query: {
          part: "snippet",
          type: "video",
          q: term,
          order: "date",
          maxResults: Math.min(25, q.limit),
          publishedAfter: q.since.toISOString(),
          relevanceLanguage: "en",
        },
      });
      for (const v of r.items ?? []) {
        const id = typeof v.id === "string" ? v.id : v.id.videoId;
        if (!id || v.snippet?.channelId === creds.externalAccountId) continue;
        items.push(this.videoToItem(id, v, `keyword:${term}`));
      }
    }
    return items;
  }

  async getPost(creds: AccountCredentials, id: string): Promise<DiscoveredItem | null> {
    const r = await this.api<{ items?: YtVideo[] }>("videos", creds.accessToken, { query: { part: "snippet,statistics", id } });
    const v = r.items?.[0];
    return v ? this.videoToItem(id, v, "lookup") : null;
  }

  async getAuthor(creds: AccountCredentials, channelId: string): Promise<AuthorProfile | null> {
    const r = await this.api<{
      items?: { id: string; snippet?: { title?: string; description?: string; customUrl?: string }; statistics?: { subscriberCount?: string } }[];
    }>("channels", creds.accessToken, { query: { part: "snippet,statistics", id: channelId } });
    const c = r.items?.[0];
    if (!c) return null;
    return {
      handle: c.snippet?.customUrl ?? c.id,
      name: c.snippet?.title ?? null,
      bio: c.snippet?.description ?? null,
      followers: c.statistics?.subscriberCount ? Number(c.statistics.subscriberCount) : null,
      isBusiness: null,
      url: `https://www.youtube.com/channel/${c.id}`,
    };
  }

  async publishComment(creds: AccountCredentials, t: PublishTarget): Promise<PublishResult> {
    if (t.replyToExternalId) {
      const r = await this.api<{ id: string }>("comments", creds.accessToken, {
        method: "POST",
        query: { part: "snippet" },
        body: { snippet: { parentId: t.replyToExternalId, textOriginal: t.text } },
      });
      return { externalCommentId: r.id, url: `https://www.youtube.com/watch?v=${t.externalPostId}&lc=${r.id}` };
    }
    const r = await this.api<{ id: string }>("commentThreads", creds.accessToken, {
      method: "POST",
      query: { part: "snippet" },
      body: { snippet: { videoId: t.externalPostId, topLevelComment: { snippet: { textOriginal: t.text } } } },
    });
    return { externalCommentId: r.id, url: `https://www.youtube.com/watch?v=${t.externalPostId}&lc=${r.id}` };
  }

  async getCommentMetrics(creds: AccountCredentials, id: string): Promise<CommentMetrics | null> {
    const r = await this.api<{ items?: { snippet?: { totalReplyCount?: number; topLevelComment?: { snippet?: { likeCount?: number } } } }[] }>(
      "commentThreads",
      creds.accessToken,
      { query: { part: "snippet", id } },
    ).catch(() => null);
    const s = r?.items?.[0]?.snippet;
    return s ? { likes: s.topLevelComment?.snippet?.likeCount ?? 0, replies: s.totalReplyCount ?? 0 } : null;
  }

  async getProfileMetrics(creds: AccountCredentials): Promise<ProfileMetrics> {
    const a = await this.getAccount(creds);
    return { followers: a.followers, profileVisits: null };
  }

  private videoToItem(id: string, v: YtVideo, via: string): DiscoveredItem {
    return {
      externalPostId: id,
      url: `https://www.youtube.com/watch?v=${id}`,
      authorHandle: v.snippet?.channelTitle ?? null,
      authorName: v.snippet?.channelTitle ?? null,
      authorExternalId: v.snippet?.channelId ?? null,
      authorBio: null,
      authorFollowers: null,
      authorIsBusiness: null,
      content: [v.snippet?.title, v.snippet?.description].filter(Boolean).join("\n\n"),
      media: [{ type: "video" }],
      metrics: {
        views: v.statistics?.viewCount ? Number(v.statistics.viewCount) : undefined,
        likes: v.statistics?.likeCount ? Number(v.statistics.likeCount) : undefined,
        comments: v.statistics?.commentCount ? Number(v.statistics.commentCount) : undefined,
      },
      postedAt: v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : null,
      opportunityType: "third_party_post",
      publishCapability: "api",
      discoveredVia: via,
    };
  }
}
