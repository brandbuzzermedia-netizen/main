import type { FetchLike } from "./http";
import type { SocialPlatformAdapter, OAuthConfig } from "./adapter";
import { InstagramAdapter } from "./instagram";
import { FacebookAdapter } from "./facebook";
import { LinkedInAdapter } from "./linkedin";
import { YouTubeAdapter } from "./youtube";
import { TikTokAdapter, XAdapter } from "./unsupported";
import { PLATFORMS, type Platform } from "./types";

export function getAdapter(platform: Platform, fetchImpl?: FetchLike): SocialPlatformAdapter {
  switch (platform) {
    case "instagram":
      return new InstagramAdapter(fetchImpl);
    case "facebook":
      return new FacebookAdapter(fetchImpl);
    case "linkedin":
      return new LinkedInAdapter(fetchImpl);
    case "youtube":
      return new YouTubeAdapter(fetchImpl);
    case "x":
      return new XAdapter(fetchImpl);
    case "tiktok":
      return new TikTokAdapter(fetchImpl);
  }
}

export function isPlatform(v: string): v is Platform {
  return (PLATFORMS as readonly string[]).includes(v);
}

/** Which OAuth app credentials each platform uses. Facebook and Instagram share the Meta app. */
export function oauthConfigFor(platform: Platform): OAuthConfig | null {
  const pick = (id?: string, secret?: string) => (id && secret ? { clientId: id, clientSecret: secret } : null);
  switch (platform) {
    case "instagram":
    case "facebook":
      return pick(process.env.META_APP_ID, process.env.META_APP_SECRET);
    case "linkedin":
      return pick(process.env.LINKEDIN_CLIENT_ID, process.env.LINKEDIN_CLIENT_SECRET);
    case "youtube":
      return pick(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    default:
      return null;
  }
}
