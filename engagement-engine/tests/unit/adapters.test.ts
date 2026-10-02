import { describe, expect, it, vi } from "vitest";
import { getAdapter } from "@/lib/platforms/registry";
import { ManualActionRequired, PlatformApiError, UnsupportedCapabilityError, PLATFORMS } from "@/lib/platforms/types";
import { parsePostUrl } from "@/lib/engine/discovery";

const creds = { clientId: "c1", socialAccountId: "s1", externalAccountId: "17841400000000", accessToken: "tok", metadata: { handle: "wudgres" } };

function mockFetch(routes: Record<string, unknown>, calls: string[] = []) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push(`${init?.method ?? "GET"} ${u}`);
    const key = Object.keys(routes).find((k) => u.includes(k));
    if (!key) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    const v = routes[key];
    if (v instanceof Response) return v;
    return new Response(JSON.stringify(v), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("platform capabilities", () => {
  it("every platform has an adapter that declares every capability", () => {
    for (const p of PLATFORMS) {
      const a = getAdapter(p);
      expect(a.platform).toBe(p);
      expect(Object.keys(a.capabilities)).toHaveLength(13);
    }
  });

  it("never claims third-party publishing where the official API doesn't support it", () => {
    expect(getAdapter("instagram").capabilities.publishOnThirdPartyPost.status).toBe("manual");
    expect(getAdapter("facebook").capabilities.publishOnThirdPartyPost.status).toBe("manual");
    expect(getAdapter("x").capabilities.publishOnThirdPartyPost.status).toBe("prohibited");
    expect(getAdapter("tiktok").capabilities.publishOnThirdPartyPost.status).toBe("unsupported");
    expect(getAdapter("linkedin").capabilities.publishOnThirdPartyPost.status).toBe("manual");
  });
});

describe("InstagramAdapter", () => {
  it("discovers hashtag media, own-post comments and tags using Graph endpoints", async () => {
    const calls: string[] = [];
    const now = new Date().toISOString();
    const a = getAdapter(
      "instagram",
      mockFetch(
        {
          ig_hashtag_search: { data: [{ id: "h1" }] },
          "h1/recent_media": { data: [{ id: "m1", caption: "Luxury villa entrance", permalink: "https://instagram.com/p/1", timestamp: now }] },
          "/media?": { data: [{ id: "own1", caption: "Our new door", comments_count: 2, timestamp: now }] },
          "own1/comments": {
            data: [
              { id: "c1", text: "Is this teak?", username: "ar.meera", timestamp: now },
              { id: "c2", text: "Already answered", username: "x", timestamp: now, replies: { data: [{ username: "wudgres" }] } },
            ],
          },
          "/tags": { data: [{ id: "t1", caption: "Tagged @wudgres", username: "studio", timestamp: now }] },
        },
        calls,
      ),
    );
    const items = await a.discoverContent(creds, { keywords: [], hashtags: ["#villadesign"], targetHandles: [], locations: [], since: new Date(0), limit: 10 });
    expect(items.map((i) => [i.opportunityType, i.publishCapability])).toEqual([
      ["third_party_post", "manual"],
      ["own_post_comment", "api"],
      ["mention", "api"],
    ]);
    expect(items[1].replyToExternalId).toBe("c1");
    expect(calls.some((c) => c.includes("ig_hashtag_search") && c.includes("q=villadesign"))).toBe(true);
    expect(calls.every((c) => c.startsWith("GET https://graph.facebook.com/"))).toBe(true);
  });

  it("replies on own posts via /replies and refuses third-party comments", async () => {
    const calls: string[] = [];
    const a = getAdapter("instagram", mockFetch({ "/replies": { id: "r1" } }, calls));
    const r = await a.publishComment(creds, { opportunityType: "own_post_comment", externalPostId: "own1", replyToExternalId: "c1", text: "Yes, solid teak." });
    expect(r.externalCommentId).toBe("r1");
    expect(calls[0]).toMatch(/^POST https:\/\/graph\.facebook\.com\/v[\d.]+\/c1\/replies/);
    await expect(a.publishComment(creds, { opportunityType: "third_party_post", externalPostId: "m1", text: "hi" })).rejects.toBeInstanceOf(
      ManualActionRequired,
    );
  });

  it("classifies expired tokens and rate limits", async () => {
    const expired = getAdapter(
      "instagram",
      mockFetch({ "17841400000000": new Response(JSON.stringify({ error: { code: 190, message: "expired" } }), { status: 400 }) }),
    );
    const e1 = await expired.getAccount(creds).catch((e) => e);
    expect(e1).toBeInstanceOf(PlatformApiError);
    expect(e1.authExpired).toBe(true);
    const limited = getAdapter(
      "instagram",
      mockFetch({ "17841400000000": new Response(JSON.stringify({ error: { code: 4, message: "rate" } }), { status: 400 }) }),
    );
    const e2 = await limited.getAccount(creds).catch((e) => e);
    expect(e2.retryable).toBe(true);
    expect(e2.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("LinkedInAdapter", () => {
  it("sends versioned REST headers and comments as the organisation on its own posts", async () => {
    let headers: Headers | null = null;
    let body: unknown = null;
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      headers = new Headers(init?.headers);
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ commentUrn: "urn:li:comment:(urn:li:activity:1,2)" }), { status: 201 });
    }) as unknown as typeof fetch;
    const a = getAdapter("linkedin", f);
    const org = { ...creds, externalAccountId: "urn:li:organization:42", metadata: { actor: "urn:li:organization:42" } };
    const r = await a.publishComment(org, { opportunityType: "own_post_comment", externalPostId: "urn:li:share:9", text: "Thanks!" });
    expect(r.externalCommentId).toContain("urn:li:comment");
    expect(headers!.get("LinkedIn-Version")).toMatch(/^\d{6}$/);
    expect(headers!.get("X-Restli-Protocol-Version")).toBe("2.0.0");
    expect(body).toMatchObject({ actor: "urn:li:organization:42", object: "urn:li:share:9", message: { text: "Thanks!" } });
  });

  it("keeps third-party comments manual unless explicitly enabled", async () => {
    const a = getAdapter("linkedin", mockFetch({}));
    await expect(a.publishComment(creds, { opportunityType: "manual", externalPostId: "urn:li:activity:1", text: "x" })).rejects.toBeInstanceOf(
      ManualActionRequired,
    );
  });
});

describe("YouTubeAdapter", () => {
  it("posts top-level comments with commentThreads.insert", async () => {
    const calls: string[] = [];
    const a = getAdapter("youtube", mockFetch({ commentThreads: { id: "yt1" } }, calls));
    const r = await a.publishComment(creds, { opportunityType: "third_party_post", externalPostId: "vid123", text: "Useful breakdown of door hardware." });
    expect(r.externalCommentId).toBe("yt1");
    expect(calls[0]).toMatch(/^POST https:\/\/www\.googleapis\.com\/youtube\/v3\/commentThreads\?part=snippet/);
  });
});

describe("declared-only adapters", () => {
  it("X and TikTok refuse to publish", async () => {
    await expect(getAdapter("x").publishComment(creds, { opportunityType: "third_party_post", externalPostId: "1", text: "x" })).rejects.toBeInstanceOf(
      UnsupportedCapabilityError,
    );
    await expect(getAdapter("tiktok").discoverContent(creds, {} as never)).rejects.toBeInstanceOf(UnsupportedCapabilityError);
  });
});

describe("manual intake URL parsing", () => {
  it("extracts API identifiers where the URL carries them", () => {
    expect(parsePostUrl("youtube", "https://www.youtube.com/watch?v=abc123")).toEqual({ externalPostId: "abc123", apiPublishable: true });
    expect(parsePostUrl("linkedin", "https://www.linkedin.com/feed/update/urn:li:activity:7123/")).toEqual({
      externalPostId: "urn:li:activity:7123",
      apiPublishable: true,
    });
    const ig = parsePostUrl("instagram", "https://www.instagram.com/p/XYZ/");
    expect(ig.apiPublishable).toBe(false);
    expect(ig.externalPostId).toMatch(/^url:/);
  });
});
