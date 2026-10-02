import { describe, expect, it } from "vitest";
import { scoreOpportunity, scoreLabel, type ScoringContext } from "@/lib/engine/scoring";

const ctx: ScoringContext = {
  campaignKeywords: ["luxury villa", "wooden door", "interior design"],
  campaignHashtags: ["villadesign"],
  campaignLocations: ["Bangalore"],
  brandTerms: ["wooden doors", "main doors", "door"],
  excludedTopics: ["politics"],
  competitors: ["DoorKing"],
  targetHandles: ["@studio.ark"],
  segments: [
    {
      id: "seg-1",
      name: "Architects Bangalore",
      industries: ["Architecture"],
      jobTitles: ["Architect", "Principal Architect", "Interior Designer"],
      locations: ["Bangalore", "Bengaluru"],
      keywords: ["villa", "elevation"],
      hashtags: ["architecture"],
      negativeKeywords: ["hiring"],
    },
  ],
};

const now = new Date("2026-10-02T12:00:00Z");

describe("opportunity scoring", () => {
  it("scores a fresh, on-topic post from a target-audience author highly and explains why", () => {
    const r = scoreOpportunity(
      {
        content: "5 things architects should consider when designing luxury villas. The entrance and wooden door scale matter. What do you think?",
        authorHandle: "ar.meera",
        authorName: "Meera Rao",
        authorBio: "Principal Architect, Bangalore. Luxury residences.",
        authorFollowers: 4200,
        authorIsBusiness: true,
        postedAt: new Date("2026-10-02T09:00:00Z"),
        metrics: { likes: 120, comments: 14 },
        opportunityType: "third_party_post",
      },
      ctx,
      now,
    );
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.label).toBe("Strong opportunity");
    expect(r.explanation).toMatch(/luxury villa/i);
    expect(r.explanation).toMatch(/Architects Bangalore audience/);
    expect(r.bestSegmentId).toBe("seg-1");
  });

  it("scores unrelated content low", () => {
    const r = scoreOpportunity(
      {
        content: "Weekend brunch spots in Goa",
        authorHandle: "foodie",
        authorName: null,
        authorBio: "Food blogger",
        authorFollowers: 900,
        authorIsBusiness: false,
        postedAt: new Date("2026-09-20T09:00:00Z"),
        metrics: {},
        opportunityType: "third_party_post",
      },
      ctx,
      now,
    );
    expect(r.score).toBeLessThan(40);
    expect(r.label).toBe("Weak opportunity");
  });

  it("excludes excluded topics, negative keywords and competitors", () => {
    const base = {
      authorHandle: null,
      authorName: null,
      authorBio: null,
      authorFollowers: null,
      authorIsBusiness: null,
      postedAt: now,
      metrics: {},
      opportunityType: "third_party_post" as const,
    };
    expect(scoreOpportunity({ ...base, content: "Luxury villa and politics" }, ctx, now).label).toBe("Excluded");
    expect(scoreOpportunity({ ...base, content: "We are hiring for luxury villa projects" }, ctx, now).score).toBe(0);
    expect(scoreOpportunity({ ...base, content: "wooden door", authorHandle: "doorking" }, ctx, now).excludedReason).toMatch(/competitor/);
  });

  it("gives full author relevance for target profiles", () => {
    const r = scoreOpportunity(
      {
        content: "New villa elevation",
        authorHandle: "studio.ark",
        authorName: null,
        authorBio: null,
        authorFollowers: null,
        authorIsBusiness: null,
        postedAt: now,
        metrics: {},
        opportunityType: "third_party_post",
      },
      ctx,
      now,
    );
    expect(r.factors.authorRelevance).toBe(100);
    expect(r.factors.freshness).toBe(100);
  });

  it("labels by threshold", () => {
    expect(scoreLabel(94)).toBe("Strong opportunity");
    expect(scoreLabel(65)).toBe("Good opportunity");
    expect(scoreLabel(45)).toBe("Moderate opportunity");
    expect(scoreLabel(10)).toBe("Weak opportunity");
  });
});
