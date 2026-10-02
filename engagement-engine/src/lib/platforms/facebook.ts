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

interface FbPost {
  id: string;
  message?: string;
  permalink_url?: string;
  created_time?: string;
  from?: { id: string; name?: string };
}

interface FbComment {
  id: string;
  message?: string;
  created_time?: string;
  from?: { id: string; name?: string };
  comments?: { data?: { from?: { id: string } }[] };
}

/** Facebook Pages API: conversations on the Page's own posts, and posts the Page is tagged in. */
export class FacebookAdapter extends SocialPlatformAdapter {
  readonly platform = "facebook" as const;
  readonly scopes = META_SCOPES;

  readonly capabilities: PlatformCapabilities = {
    connect: { status: "supported", note: "Facebook Pages the user manages" },
    discoverByHashtag: { status: "unsupported", note: "No public post search in the Pages API" },
    discoverByKeyword: { status: "unsupported", note: "No public post search in the Pages API" },
    monitorProfiles: { status: "unsupported" },
    ownPostComments: { status: "supported" },
    mentions: { status: "supported", note: "Posts the Page is tagged in" },
    getAuthor: { status: "limited", note: "Public Page name only; personal profiles are not available" },
    publishReplyOnOwnPost: { status: "supported" },
    publishOnOwnPost: { status: "supported" },
    publishMentionReply: { status: "manual", note: "Commenting on another Page's post is done manually" },
    publishOnThirdPartyPost: { status: "manual" },
    commentMetrics: { status: "supported" },
    profileMetrics: { status: "supported" },
  };

  readonly commentRules: CommentRules = {
    maxLength: 8000,
    linksClickable: true,
    maxHashtags: 1,
    maxMentions: 1,
    styleNotes: "Friendly and specific, 1–3 sentences. Avoid links unless the client explicitly allows a soft CTA.",
  };

  authorizationUrl(p: { state: string; redirectUri: string; codeChallenge: string; config: OAuthConfig }) {
    return metaAuthorizationUrl(p);
  }

  async connectAccount(p: { code: string; redirectUri: string; codeVerifier: string; config: OAuthConfig }) {
    return (await metaConnectableAccounts(this.fetchImpl, p)).filter((a) => a.platform === "facebook");
  }

  async getAccount(creds: AccountCredentials): Promise<AccountProfile> {
    const r = await graph<{ id: string; name?: string; username?: string; followers_count?: number }>(
      this.fetchImpl,
      creds.externalAccountId,
      creds.accessToken,
      { query: { fields: "id,name,username,followers_count" } },
    );
    return {
      externalAccountId: r.id,
      handle: r.username ?? null,
      displayName: r.name ?? null,
      accountType: "page",
      followers: r.followers_count ?? null,
    };
  }

  async discoverContent(creds: AccountCredentials, q: DiscoveryQuery): Promise<DiscoveredItem[]> {
    const items: DiscoveredItem[] = [];
    const pageId = creds.externalAccountId;
    const since = Math.floor(q.since.getTime() / 1000);

    const posts = await graph<{ data: FbPost[] }>(this.fetchImpl, `${pageId}/posts`, creds.accessToken, {
      query: { fields: "id,message,permalink_url,created_time", limit: 10 },
    });
    for (const post of posts.data ?? []) {
      const comments = await graph<{ data: FbComment[] }>(this.fetchImpl, `${post.id}/comments`, creds.accessToken, {
        query: { fields: "id,message,created_time,from,comments{from}", filter: "toplevel", since, limit: 50 },
      });
      for (const c of comments.data ?? []) {
        if (c.from?.id === pageId) continue;
        if (c.comments?.data?.some((r) => r.from?.id === pageId)) continue; // already answered
        items.push({
          ...this.postToItem(post, "own_post_comment", "own-post-comments"),
          replyToExternalId: c.id,
          replyToText: c.message ?? "",
          replyToAuthor: c.from?.name ?? null,
          authorName: c.from?.name ?? null,
          authorExternalId: c.from?.id ?? null,
          publishCapability: "api",
        });
      }
    }

    const tagged = await graph<{ data: FbPost[] }>(this.fetchImpl, `${pageId}/tagged`, creds.accessToken, {
      query: { fields: "id,message,permalink_url,created_time,from", since, limit: 25 },
    });
    for (const post of tagged.data ?? []) {
      items.push({
        ...this.postToItem(post, "mention", "tagged"),
        authorName: post.from?.name ?? null,
        authorExternalId: post.from?.id ?? null,
      });
    }
    return items;
  }

  async getPost(creds: AccountCredentials, id: string): Promise<DiscoveredItem | null> {
    const p = await graph<FbPost>(this.fetchImpl, id, creds.accessToken, {
      query: { fields: "id,message,permalink_url,created_time,from" },
    }).catch(() => null);
    return p ? this.postToItem(p, "own_post_comment", "lookup") : null;
  }

  async getAuthor(): Promise<AuthorProfile | null> {
    return null; // personal profiles are not available; Page names arrive with the post
  }

  async publishComment(creds: AccountCredentials, t: PublishTarget): Promise<PublishResult> {
    if (t.opportunityType !== "own_post_comment") {
      throw new ManualActionRequired(
        "Commenting on posts outside the client's own Page is done manually. Post this approved comment as the Page and record the link.",
      );
    }
    const target = t.replyToExternalId ?? t.externalPostId;
    const r = await graph<{ id: string }>(this.fetchImpl, `${target}/comments`, creds.accessToken, {
      method: "POST",
      form: { message: t.text },
    });
    return { externalCommentId: r.id, url: null };
  }

  async getCommentMetrics(creds: AccountCredentials, id: string): Promise<CommentMetrics | null> {
    const r = await graph<{ like_count?: number; comment_count?: number }>(this.fetchImpl, id, creds.accessToken, {
      query: { fields: "like_count,comment_count" },
    }).catch(() => null);
    return r ? { likes: r.like_count ?? 0, replies: r.comment_count ?? 0 } : null;
  }

  async getProfileMetrics(creds: AccountCredentials): Promise<ProfileMetrics> {
    const a = await this.getAccount(creds);
    return { followers: a.followers, profileVisits: null };
  }

  private postToItem(p: FbPost, type: DiscoveredItem["opportunityType"], via: string): DiscoveredItem {
    return {
      externalPostId: p.id,
      url: p.permalink_url ?? null,
      authorHandle: null,
      authorName: p.from?.name ?? null,
      authorExternalId: p.from?.id ?? null,
      authorBio: null,
      authorFollowers: null,
      authorIsBusiness: null,
      content: p.message ?? "",
      media: [],
      metrics: {},
      postedAt: p.created_time ? new Date(p.created_time) : null,
      opportunityType: type,
      publishCapability: this.publishCapabilityFor(type),
      discoveredVia: via,
    };
  }
}
