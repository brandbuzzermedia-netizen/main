import { SocialPlatformAdapter, type OAuthConfig } from "./adapter";
import { requestJson, retryAfter, type HttpOptions } from "./http";
import {
  ManualActionRequired,
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

const API = "https://api.linkedin.com";

function classify(status: number, body: unknown, headers: Headers): PlatformApiError {
  const msg = (body as { message?: string })?.message ?? `LinkedIn API error ${status}`;
  if (status === 401) return new PlatformApiError(msg, status, "401", false, true);
  if (status === 429) return new PlatformApiError(msg, status, "429", true, false, retryAfter(headers) ?? 3600);
  return new PlatformApiError(msg, status, String(status), status >= 500);
}

const thirdPartyCommentsAllowed = () => process.env.LINKEDIN_ALLOW_THIRD_PARTY_COMMENTS === "true";

interface LiPost {
  id: string;
  commentary?: string;
  createdAt?: number;
  publishedAt?: number;
}

interface LiComment {
  id?: string;
  commentUrn?: string;
  actor?: string;
  message?: { text?: string };
  created?: { time?: number };
}

/**
 * LinkedIn: Sign In with LinkedIn (OIDC), Share on LinkedIn (w_member_social) and the
 * Community Management API for organisation pages (gated; requires LinkedIn approval).
 * There is no post search API, so outbound opportunities come from manual intake.
 */
export class LinkedInAdapter extends SocialPlatformAdapter {
  readonly platform = "linkedin" as const;
  readonly scopes = [
    "openid",
    "profile",
    "email",
    "w_member_social",
    "r_organization_social",
    "w_organization_social",
    "rw_organization_admin",
  ];

  get capabilities(): PlatformCapabilities {
    return {
      connect: { status: "supported", note: "Member and organisation pages (Community Management API approval required)" },
      discoverByHashtag: { status: "unsupported", note: "No post search API; use manual intake" },
      discoverByKeyword: { status: "unsupported", note: "No post search API; use manual intake" },
      monitorProfiles: { status: "unsupported" },
      ownPostComments: { status: "supported", note: "Comments on the organisation's own posts" },
      mentions: { status: "unsupported" },
      getAuthor: { status: "unsupported", note: "Other members' profiles are not available via API" },
      publishReplyOnOwnPost: { status: "supported" },
      publishOnOwnPost: { status: "supported" },
      publishMentionReply: { status: "manual" },
      publishOnThirdPartyPost: thirdPartyCommentsAllowed()
        ? { status: "limited", note: "Enabled by LINKEDIN_ALLOW_THIRD_PARTY_COMMENTS; must be within your approved product use" }
        : { status: "manual", note: "Disabled until confirmed within your LinkedIn developer app's approved use" },
      commentMetrics: { status: "limited" },
      profileMetrics: { status: "limited", note: "Organisation follower count" },
    };
  }

  readonly commentRules: CommentRules = {
    maxLength: 1250,
    linksClickable: true,
    maxHashtags: 0,
    maxMentions: 1,
    styleNotes: "Professional and substantive, 2–4 sentences. Add a specific insight; no hashtags in comments.",
  };

  private headers(): Record<string, string> {
    return {
      "LinkedIn-Version": process.env.LINKEDIN_API_VERSION || "202509",
      "X-Restli-Protocol-Version": "2.0.0",
    };
  }

  private api<T>(path: string, token: string, opts: Omit<HttpOptions, "bearer" | "headers"> = {}) {
    return requestJson<T>(this.fetchImpl, `${API}${path}`, { ...opts, bearer: token, headers: this.headers() }, classify);
  }

  authorizationUrl(p: { state: string; redirectUri: string; codeChallenge: string; config: OAuthConfig }) {
    const u = new URL("https://www.linkedin.com/oauth/v2/authorization");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", p.config.clientId);
    u.searchParams.set("redirect_uri", p.redirectUri);
    u.searchParams.set("state", p.state);
    u.searchParams.set("scope", this.scopes.join(" "));
    return u.toString();
  }

  async connectAccount(p: { code: string; redirectUri: string; codeVerifier: string; config: OAuthConfig }) {
    const t = await requestJson<{
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
      refresh_token_expires_in?: number;
      scope?: string;
    }>(
      this.fetchImpl,
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        form: {
          grant_type: "authorization_code",
          code: p.code,
          redirect_uri: p.redirectUri,
          client_id: p.config.clientId,
          client_secret: p.config.clientSecret,
        },
      },
      classify,
    );
    const token: TokenSet = {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? null,
      expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
      refreshExpiresAt: t.refresh_token_expires_in ? new Date(Date.now() + t.refresh_token_expires_in * 1000) : null,
      scopes: (t.scope ?? "").split(/[ ,]/).filter(Boolean),
    };
    const me = await requestJson<{ sub: string; name?: string }>(
      this.fetchImpl,
      `${API}/v2/userinfo`,
      { bearer: token.accessToken },
      classify,
    );
    const out: ConnectableAccount[] = [
      {
        platform: "linkedin",
        externalAccountId: `urn:li:person:${me.sub}`,
        handle: null,
        displayName: me.name ?? "LinkedIn member",
        accountType: "member",
        token,
        metadata: { actor: `urn:li:person:${me.sub}` },
      },
    ];
    const acls = await this.api<{ elements?: { organization?: string; organizationTarget?: string }[] }>(
      "/rest/organizationAcls",
      token.accessToken,
      { query: { q: "roleAssignee", role: "ADMINISTRATOR", state: "APPROVED" } },
    ).catch(() => ({ elements: [] }));
    for (const acl of acls.elements ?? []) {
      const urn = acl.organization ?? acl.organizationTarget;
      if (!urn) continue;
      const id = urn.split(":").pop();
      const org = await this.api<{ localizedName?: string; vanityName?: string }>(`/rest/organizations/${id}`, token.accessToken).catch(
        () => null,
      );
      out.push({
        platform: "linkedin",
        externalAccountId: urn,
        handle: org?.vanityName ?? null,
        displayName: org?.localizedName ?? urn,
        accountType: "organization",
        token,
        metadata: { actor: urn },
      });
    }
    return out;
  }

  async refreshToken(refreshToken: string, config: OAuthConfig): Promise<TokenSet | null> {
    const t = await requestJson<{ access_token: string; expires_in?: number; refresh_token?: string }>(
      this.fetchImpl,
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        form: {
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: config.clientId,
          client_secret: config.clientSecret,
        },
      },
      classify,
    );
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? refreshToken,
      expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
      scopes: this.scopes,
    };
  }

  async getAccount(creds: AccountCredentials): Promise<AccountProfile> {
    const isOrg = creds.externalAccountId.startsWith("urn:li:organization:");
    if (isOrg) {
      const id = creds.externalAccountId.split(":").pop();
      const org = await this.api<{ localizedName?: string; vanityName?: string }>(`/rest/organizations/${id}`, creds.accessToken);
      const followers = await this.getProfileMetrics(creds).then((m) => m.followers).catch(() => null);
      return {
        externalAccountId: creds.externalAccountId,
        handle: org.vanityName ?? null,
        displayName: org.localizedName ?? null,
        accountType: "organization",
        followers,
      };
    }
    const me = await requestJson<{ sub: string; name?: string }>(
      this.fetchImpl,
      `${API}/v2/userinfo`,
      { bearer: creds.accessToken },
      classify,
    );
    return { externalAccountId: `urn:li:person:${me.sub}`, handle: null, displayName: me.name ?? null, accountType: "member", followers: null };
  }

  async discoverContent(creds: AccountCredentials, q: DiscoveryQuery): Promise<DiscoveredItem[]> {
    if (!creds.externalAccountId.startsWith("urn:li:organization:")) return []; // members: manual intake only
    const posts = await this.api<{ elements?: LiPost[] }>("/rest/posts", creds.accessToken, {
      query: { author: creds.externalAccountId, q: "author", count: 10 },
    });
    const items: DiscoveredItem[] = [];
    for (const post of posts.elements ?? []) {
      const comments = await this.api<{ elements?: LiComment[] }>(
        `/rest/socialActions/${encodeURIComponent(post.id)}/comments`,
        creds.accessToken,
        { query: { count: 50 } },
      ).catch(() => ({ elements: [] as LiComment[] }));
      for (const c of comments.elements ?? []) {
        const created = c.created?.time ? new Date(c.created.time) : null;
        if (created && created < q.since) continue;
        if (c.actor === creds.externalAccountId) continue;
        items.push({
          externalPostId: post.id,
          url: `https://www.linkedin.com/feed/update/${post.id}/`,
          authorHandle: null,
          authorName: null,
          authorExternalId: c.actor ?? null,
          authorBio: null,
          authorFollowers: null,
          authorIsBusiness: c.actor?.startsWith("urn:li:organization:") ?? null,
          content: post.commentary ?? "",
          media: [],
          metrics: {},
          postedAt: post.publishedAt ? new Date(post.publishedAt) : post.createdAt ? new Date(post.createdAt) : null,
          opportunityType: "own_post_comment",
          replyToExternalId: c.commentUrn ?? null,
          replyToText: c.message?.text ?? "",
          replyToAuthor: null,
          publishCapability: "api",
          discoveredVia: "own-post-comments",
        });
      }
    }
    return items;
  }

  async getPost(creds: AccountCredentials, urn: string): Promise<DiscoveredItem | null> {
    const p = await this.api<LiPost & { author?: string }>(`/rest/posts/${encodeURIComponent(urn)}`, creds.accessToken).catch(() => null);
    if (!p) return null;
    const own = p.author === creds.externalAccountId;
    return {
      externalPostId: p.id,
      url: `https://www.linkedin.com/feed/update/${p.id}/`,
      authorHandle: null,
      authorName: null,
      authorExternalId: p.author ?? null,
      authorBio: null,
      authorFollowers: null,
      authorIsBusiness: null,
      content: p.commentary ?? "",
      media: [],
      metrics: {},
      postedAt: p.publishedAt ? new Date(p.publishedAt) : null,
      opportunityType: own ? "own_post_comment" : "third_party_post",
      publishCapability: this.publishCapabilityFor(own ? "own_post_comment" : "third_party_post"),
      discoveredVia: "lookup",
    };
  }

  async getAuthor(): Promise<AuthorProfile | null> {
    return null;
  }

  async publishComment(creds: AccountCredentials, t: PublishTarget): Promise<PublishResult> {
    const actor = (creds.metadata.actor as string | undefined) ?? creds.externalAccountId;
    const own = t.opportunityType === "own_post_comment";
    if (!own && !thirdPartyCommentsAllowed()) {
      throw new ManualActionRequired(
        "Commenting on LinkedIn posts outside the client's own page is not enabled for this app. Post this approved comment from the client's LinkedIn and record the link.",
      );
    }
    if (!/^urn:li:(share|ugcPost|activity):/.test(t.externalPostId)) {
      throw new ManualActionRequired("This LinkedIn post has no API identifier (URN). Post the approved comment manually.");
    }
    const target = t.replyToExternalId ?? t.externalPostId;
    const body: Record<string, unknown> = { actor, object: t.externalPostId, message: { text: t.text } };
    if (t.replyToExternalId) body.parentComment = t.replyToExternalId;
    const r = await this.api<{ id?: string; commentUrn?: string; $URN?: string }>(
      `/rest/socialActions/${encodeURIComponent(target)}/comments`,
      creds.accessToken,
      { method: "POST", body },
    );
    return {
      externalCommentId: r.commentUrn ?? r.$URN ?? r.id ?? "",
      url: `https://www.linkedin.com/feed/update/${t.externalPostId}/`,
    };
  }

  async getCommentMetrics(creds: AccountCredentials, commentUrn: string): Promise<CommentMetrics | null> {
    const r = await this.api<{ reactionSummaries?: Record<string, { count?: number }>; commentSummary?: { count?: number } }>(
      `/rest/socialMetadata/${encodeURIComponent(commentUrn)}`,
      creds.accessToken,
    ).catch(() => null);
    if (!r) return null;
    const likes = Object.values(r.reactionSummaries ?? {}).reduce((n, s) => n + (s.count ?? 0), 0);
    return { likes, replies: r.commentSummary?.count ?? 0 };
  }

  async getProfileMetrics(creds: AccountCredentials): Promise<ProfileMetrics> {
    if (!creds.externalAccountId.startsWith("urn:li:organization:")) return { followers: null, profileVisits: null };
    const r = await this.api<{ firstDegreeSize?: number }>(
      `/rest/networkSizes/${encodeURIComponent(creds.externalAccountId)}`,
      creds.accessToken,
      { query: { edgeType: "COMPANY_FOLLOWED_BY_MEMBER" } },
    ).catch(() => null);
    return { followers: r?.firstDegreeSize ?? null, profileVisits: null };
  }
}
