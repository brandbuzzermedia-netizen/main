import { requestJson, retryAfter, type FetchLike, type HttpOptions } from "./http";
import { PlatformApiError, type ConnectableAccount, type TokenSet } from "./types";
import type { OAuthConfig } from "./adapter";

/** Shared Graph API plumbing for the Instagram and Facebook adapters. */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_manage_engagement",
  "instagram_basic",
  "instagram_manage_comments",
  "business_management",
];

export function graphVersion(): string {
  return process.env.META_GRAPH_VERSION || "v23.0";
}

export function graphUrl(path: string): string {
  return `https://graph.facebook.com/${graphVersion()}/${path.replace(/^\//, "")}`;
}

// Graph API error codes: https://developers.facebook.com/docs/graph-api/guides/error-handling
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80006]);

export function classifyMetaError(status: number, body: unknown, headers: Headers): PlatformApiError {
  const err = (body as { error?: { message?: string; code?: number; error_subcode?: number } })?.error;
  const code = err?.code ?? null;
  const message = err?.message ?? `Graph API error ${status}`;
  if (code === 190 || status === 401) {
    return new PlatformApiError(message, status, String(code), false, true);
  }
  const rateLimited = (code !== null && RATE_LIMIT_CODES.has(code)) || status === 429;
  return new PlatformApiError(
    message,
    status,
    code === null ? null : String(code),
    rateLimited || status >= 500,
    false,
    rateLimited ? (retryAfter(headers) ?? 3600) : null,
  );
}

export function graph<T>(fetchImpl: FetchLike, path: string, token: string, opts: Omit<HttpOptions, "bearer"> = {}) {
  return requestJson<T>(fetchImpl, graphUrl(path), { ...opts, bearer: token }, classifyMetaError);
}

export function metaAuthorizationUrl(p: { state: string; redirectUri: string; config: OAuthConfig }): string {
  const u = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
  u.searchParams.set("client_id", p.config.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("state", p.state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", META_SCOPES.join(","));
  return u.toString();
}

interface PageRow {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string; name?: string };
}

/**
 * Code → short-lived user token → long-lived user token → Page tokens.
 * Page tokens derived from a long-lived user token do not expire; the IG API uses the Page token.
 */
export async function metaConnectableAccounts(
  fetchImpl: FetchLike,
  p: { code: string; redirectUri: string; config: OAuthConfig },
): Promise<ConnectableAccount[]> {
  const short = await requestJson<{ access_token: string }>(
    fetchImpl,
    graphUrl("oauth/access_token"),
    {
      query: {
        client_id: p.config.clientId,
        client_secret: p.config.clientSecret,
        redirect_uri: p.redirectUri,
        code: p.code,
      },
    },
    classifyMetaError,
  );
  const long = await requestJson<{ access_token: string; expires_in?: number }>(
    fetchImpl,
    graphUrl("oauth/access_token"),
    {
      query: {
        grant_type: "fb_exchange_token",
        client_id: p.config.clientId,
        client_secret: p.config.clientSecret,
        fb_exchange_token: short.access_token,
      },
    },
    classifyMetaError,
  );
  const pages = await graph<{ data: PageRow[] }>(fetchImpl, "me/accounts", long.access_token, {
    query: { fields: "id,name,access_token,instagram_business_account{id,username,name}", limit: 100 },
  });
  const out: ConnectableAccount[] = [];
  for (const page of pages.data ?? []) {
    const token: TokenSet = { accessToken: page.access_token, scopes: META_SCOPES, expiresAt: null };
    out.push({
      platform: "facebook",
      externalAccountId: page.id,
      handle: null,
      displayName: page.name,
      accountType: "page",
      token,
      metadata: { page_id: page.id },
    });
    const ig = page.instagram_business_account;
    if (ig) {
      out.push({
        platform: "instagram",
        externalAccountId: ig.id,
        handle: ig.username ?? null,
        displayName: ig.name ?? ig.username ?? null,
        accountType: "business",
        token,
        metadata: { page_id: page.id, page_name: page.name },
      });
    }
  }
  return out;
}
