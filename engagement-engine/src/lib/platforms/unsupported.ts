import { SocialPlatformAdapter } from "./adapter";
import {
  UnsupportedCapabilityError,
  type AccountProfile,
  type AuthorProfile,
  type CommentMetrics,
  type CommentRules,
  type DiscoveredItem,
  type PlatformCapabilities,
  type ProfileMetrics,
  type PublishResult,
} from "./types";

/** Base for platforms whose official APIs don't support this product's engagement use case. */
abstract class DeclaredOnlyAdapter extends SocialPlatformAdapter {
  readonly scopes: string[] = [];

  async getAccount(): Promise<AccountProfile> {
    throw new UnsupportedCapabilityError(this.platform, "account lookup");
  }
  async discoverContent(): Promise<DiscoveredItem[]> {
    throw new UnsupportedCapabilityError(this.platform, "content discovery", this.capabilities.discoverByKeyword.note);
  }
  async getPost(): Promise<DiscoveredItem | null> {
    return null;
  }
  async getAuthor(): Promise<AuthorProfile | null> {
    return null;
  }
  async publishComment(): Promise<PublishResult> {
    throw new UnsupportedCapabilityError(this.platform, "publishing comments", this.capabilities.publishOnThirdPartyPost.note);
  }
  async getCommentMetrics(): Promise<CommentMetrics | null> {
    return null;
  }
  async getProfileMetrics(): Promise<ProfileMetrics> {
    return { followers: null, profileVisits: null };
  }
}

/** X API v2: search needs a paid tier, and X's automation rules prohibit unsolicited automated replies. */
export class XAdapter extends DeclaredOnlyAdapter {
  readonly platform = "x" as const;
  readonly capabilities: PlatformCapabilities = {
    connect: { status: "unsupported", note: "Not enabled" },
    discoverByHashtag: { status: "limited", note: "Recent search requires a paid API tier" },
    discoverByKeyword: { status: "limited", note: "Recent search requires a paid API tier" },
    monitorProfiles: { status: "limited", note: "Paid API tier" },
    ownPostComments: { status: "limited", note: "Paid API tier" },
    mentions: { status: "limited", note: "Paid API tier" },
    getAuthor: { status: "limited" },
    publishReplyOnOwnPost: { status: "limited", note: "Not enabled" },
    publishOnOwnPost: { status: "limited", note: "Not enabled" },
    publishMentionReply: { status: "limited", note: "Not enabled" },
    publishOnThirdPartyPost: {
      status: "prohibited",
      note: "X automation rules prohibit automated, unsolicited replies to posts found by keyword search",
    },
    commentMetrics: { status: "limited" },
    profileMetrics: { status: "limited" },
  };
  readonly commentRules: CommentRules = { maxLength: 280, linksClickable: true, maxHashtags: 1, maxMentions: 1, styleNotes: "" };
}

/** TikTok: no official API for discovering others' content or commenting for this use case. */
export class TikTokAdapter extends DeclaredOnlyAdapter {
  readonly platform = "tiktok" as const;
  readonly capabilities: PlatformCapabilities = {
    connect: { status: "unsupported", note: "Not enabled" },
    discoverByHashtag: { status: "unsupported", note: "The Research API is limited to academic researchers" },
    discoverByKeyword: { status: "unsupported", note: "The Research API is limited to academic researchers" },
    monitorProfiles: { status: "unsupported" },
    ownPostComments: { status: "unsupported" },
    mentions: { status: "unsupported" },
    getAuthor: { status: "unsupported" },
    publishReplyOnOwnPost: { status: "unsupported" },
    publishOnOwnPost: { status: "unsupported" },
    publishMentionReply: { status: "unsupported" },
    publishOnThirdPartyPost: { status: "unsupported", note: "No official comment publishing API for this use case" },
    commentMetrics: { status: "unsupported" },
    profileMetrics: { status: "unsupported" },
  };
  readonly commentRules: CommentRules = { maxLength: 150, linksClickable: false, maxHashtags: 0, maxMentions: 0, styleNotes: "" };
}
