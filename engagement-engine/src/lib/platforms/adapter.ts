import type { FetchLike } from "./http";
import {
  type AccountCredentials,
  type AccountProfile,
  type AuthorProfile,
  type CommentMetrics,
  type CommentRules,
  type ConnectableAccount,
  type DiscoveredItem,
  type DiscoveryQuery,
  type Platform,
  type PlatformCapabilities,
  type ProfileMetrics,
  type PublishResult,
  type PublishTarget,
  type TokenSet,
  UnsupportedCapabilityError,
} from "./types";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
}

export interface GenerateCommentRequest {
  rules: CommentRules;
  platform: Platform;
}

/** Anything that can write comments given platform rules (the AI generator implements this). */
export type CommentGeneratorFn<TIn, TOut> = (input: TIn & { platformRules: CommentRules; platform: Platform }) => Promise<TOut>;

/**
 * Common interface for every social platform.
 *
 * Adapters implement only what the platform's official API supports. Anything else
 * throws UnsupportedCapabilityError or ManualActionRequired. There is deliberately
 * no fallback to scraping, unofficial endpoints or browser automation.
 */
export abstract class SocialPlatformAdapter {
  abstract readonly platform: Platform;
  abstract readonly capabilities: PlatformCapabilities;
  abstract readonly commentRules: CommentRules;
  /** OAuth scopes requested at connect time. */
  abstract readonly scopes: string[];

  constructor(protected readonly fetchImpl: FetchLike = fetch) {}

  /** Build the provider's consent URL. */
  authorizationUrl(_p: { state: string; redirectUri: string; codeChallenge: string; config: OAuthConfig }): string {
    throw new UnsupportedCapabilityError(this.platform, "account connection");
  }

  /** Exchange the OAuth code and list the accounts the user can attach to the client. */
  async connectAccount(_p: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
    config: OAuthConfig;
  }): Promise<ConnectableAccount[]> {
    throw new UnsupportedCapabilityError(this.platform, "account connection");
  }

  /** Revoke access where the platform offers revocation. Local deletion happens regardless. */
  async disconnectAccount(_creds: AccountCredentials, _config?: OAuthConfig): Promise<void> {}

  async refreshToken(_refreshToken: string, _config: OAuthConfig): Promise<TokenSet | null> {
    return null;
  }

  abstract getAccount(creds: AccountCredentials): Promise<AccountProfile>;
  abstract discoverContent(creds: AccountCredentials, query: DiscoveryQuery): Promise<DiscoveredItem[]>;
  abstract getPost(creds: AccountCredentials, externalPostId: string): Promise<DiscoveredItem | null>;
  abstract getAuthor(creds: AccountCredentials, handle: string): Promise<AuthorProfile | null>;
  abstract publishComment(creds: AccountCredentials, target: PublishTarget): Promise<PublishResult>;
  abstract getCommentMetrics(creds: AccountCredentials, externalCommentId: string): Promise<CommentMetrics | null>;
  abstract getProfileMetrics(creds: AccountCredentials): Promise<ProfileMetrics>;

  /**
   * Generate comments that respect this platform's rules. The model call itself is
   * platform-neutral; the adapter contributes length limits and style constraints.
   */
  async generateComment<TIn, TOut>(input: TIn, generator: CommentGeneratorFn<TIn, TOut>): Promise<TOut> {
    return generator({ ...input, platformRules: this.commentRules, platform: this.platform });
  }

  /** Whether an opportunity of this type can be published by API on this platform. */
  publishCapabilityFor(type: DiscoveredItem["opportunityType"]): "api" | "manual" {
    const c =
      type === "own_post_comment"
        ? this.capabilities.publishReplyOnOwnPost
        : type === "mention"
          ? this.capabilities.publishMentionReply
          : this.capabilities.publishOnThirdPartyPost;
    return c.status === "supported" || c.status === "limited" ? "api" : "manual";
  }
}
