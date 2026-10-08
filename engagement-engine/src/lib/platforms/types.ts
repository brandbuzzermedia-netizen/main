export const PLATFORMS = ["instagram", "facebook", "linkedin", "youtube", "x", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  x: "X",
  tiktok: "TikTok",
};

/**
 * supported   — documented official endpoint, implemented
 * limited     — official endpoint with material restrictions (see note)
 * manual      — the API cannot do it; a person does it from the client's own account
 * unsupported — no official API for it
 * prohibited  — technically possible but against the platform's rules for this use case
 */
export type CapabilityStatus = "supported" | "limited" | "manual" | "unsupported" | "prohibited";

export interface Capability {
  status: CapabilityStatus;
  note?: string;
}

export interface PlatformCapabilities {
  connect: Capability;
  discoverByHashtag: Capability;
  discoverByKeyword: Capability;
  monitorProfiles: Capability;
  ownPostComments: Capability;
  mentions: Capability;
  getAuthor: Capability;
  publishReplyOnOwnPost: Capability;
  publishOnOwnPost: Capability;
  publishMentionReply: Capability;
  publishOnThirdPartyPost: Capability;
  commentMetrics: Capability;
  profileMetrics: Capability;
}

export type OpportunityType = "third_party_post" | "own_post_comment" | "mention" | "manual";

/** Decrypted credentials for one social account. Never leaves the server. */
export interface AccountCredentials {
  clientId: string;
  socialAccountId: string;
  externalAccountId: string;
  accessToken: string;
  metadata: Record<string, unknown>;
}

export interface DiscoveryQuery {
  keywords: string[];
  hashtags: string[];
  targetHandles: string[];
  locations: string[];
  /** Only return content newer than this. */
  since: Date;
  limit: number;
}

export interface DiscoveredItem {
  externalPostId: string;
  url: string | null;
  authorHandle: string | null;
  authorName: string | null;
  authorExternalId: string | null;
  authorBio: string | null;
  authorFollowers: number | null;
  authorIsBusiness: boolean | null;
  content: string;
  media: { type: string; url?: string }[];
  metrics: { likes?: number; comments?: number; shares?: number; views?: number };
  postedAt: Date | null;
  opportunityType: OpportunityType;
  replyToExternalId?: string | null;
  replyToText?: string | null;
  replyToAuthor?: string | null;
  publishCapability: "api" | "manual";
  /** Where the item came from, e.g. "hashtag:#villadesign". */
  discoveredVia: string;
}

export interface AuthorProfile {
  handle: string;
  name: string | null;
  bio: string | null;
  followers: number | null;
  isBusiness: boolean | null;
  url: string | null;
}

export interface AccountProfile {
  externalAccountId: string;
  handle: string | null;
  displayName: string | null;
  accountType: string;
  followers: number | null;
}

export interface PublishTarget {
  opportunityType: OpportunityType;
  externalPostId: string;
  replyToExternalId?: string | null;
  text: string;
}

export interface PublishResult {
  externalCommentId: string;
  url: string | null;
}

export interface CommentMetrics {
  likes: number;
  replies: number;
}

export interface ProfileMetrics {
  followers: number | null;
  profileVisits: number | null;
}

export interface CommentRules {
  maxLength: number;
  linksClickable: boolean;
  maxHashtags: number;
  maxMentions: number;
  styleNotes: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  refreshExpiresAt?: Date | null;
  scopes: string[];
}

/** An account the user can attach to a client after OAuth (e.g. a Page or an IG business account). */
export interface ConnectableAccount {
  platform: Platform;
  externalAccountId: string;
  handle: string | null;
  displayName: string | null;
  accountType: string;
  token: TokenSet;
  metadata: Record<string, unknown>;
}

// ───────────── Errors ─────────────

/** The official API cannot perform this; a person must do it from the client's own account. */
export class ManualActionRequired extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "ManualActionRequired";
  }
}

export class UnsupportedCapabilityError extends Error {
  constructor(platform: Platform, capability: string, note?: string) {
    super(`${PLATFORM_LABELS[platform]} does not support ${capability} through its official API${note ? `: ${note}` : ""}`);
    this.name = "UnsupportedCapabilityError";
  }
}

export class PlatformApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null,
    public readonly retryable: boolean,
    public readonly authExpired = false,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "PlatformApiError";
  }
}
