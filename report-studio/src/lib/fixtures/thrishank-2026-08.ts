// Seed fixture: Thrishank Doors, August 2026, as hard-coded in the prototype.
//
// Account-level Instagram and Meta Ads figures come from the client's
// platform screenshots. Per-piece figures are SAMPLE values, except the
// fields listed in `brief` (confirmed in the client brief). Every piece is
// marked so the review panel can flag them. Nothing here may be presented
// as extracted data once real extraction lands (build step 3).
import type { ReportDoc, SectionKey } from "../report/types.ts";
import { SECTION_KEYS } from "../report/types.ts";

const allSections = Object.fromEntries(SECTION_KEYS.map((k) => [k, true])) as Record<SectionKey, boolean>;

export function thrishankAugust2026(): ReportDoc {
  return {
    id: "thrishank-2026-08",
    status: "Ready for review",
    createdAt: "2026-09-03",
    client: {
      id: "thrishank",
      name: "Thrishank Doors",
      industry: "Doors and architectural hardware",
      location: "Bengaluru, India",
    },
    // Placeholder palette until the client supplies brand colours.
    brand: { primary: "#3B2A21", accent: "#C9974A", logo: null, gbs: null, cover: null },
    template: "premium",
    sections: allSections,
    data: {
      period: { start: "2026-08-01", end: "2026-08-31" },
      ig: {
        views: 81560, unique: 35217, nonFol: 98.4, net: 49, followers: 726, growth: 7.4,
        profileVisits: null, websiteClicks: null, messages: null,
      },
      meta: {
        campaign: "Thrishank – Messaging conversations", objective: "Messages",
        spend: 8474.59, conv: 363, impr: 115004, reach: 39030, clicks: null,
        resultType: "Messaging conversations",
      },
      outcomes: { qualified: null, bookings: null, sales: null, revenue: null },
      prev: {
        views: null, unique: null, followers: null, net: null, posts: null,
        reels: null, spend: null, conv: null, impr: null, reach: null,
      },
      content: [
        { id: "c1", date: "2026-08-14", type: "Reel", theme: "Product showcase", caption: "Serving straight perfection. Where precision engineering meets grand entrances. Every line aligned, every swing effortless.", tags: "#Thrishank #PremiumDoors #LuxuryInteriors #DoorDesign", views: 12900, reach: 9640, likes: 57, comments: 4, shares: 6, saves: 11, provenance: "sample", brief: ["views", "likes", "shares", "caption"] },
        { id: "c2", date: "2026-08-15", type: "Post", theme: "Festival", caption: "Freedom is the foundation of every home. Wishing you a happy Independence Day from all of us at Thrishank.", tags: "#IndependenceDay #Thrishank #HappyIndependenceDay", views: 6240, reach: 5120, likes: 74, comments: 6, shares: 3, saves: 5, provenance: "sample", brief: [] },
        { id: "c3", date: "2026-08-18", type: "Post", theme: "Product showcase", caption: "Solid wood. Solid finish. Meet the entrance range built to last generations, with details you feel every time you open it.", tags: "#SolidWood #Thrishank #EntranceDoors", views: 4870, reach: 4010, likes: 41, comments: 2, shares: 2, saves: 9, provenance: "sample", brief: [] },
        { id: "c4", date: "2026-08-20", type: "Reel", theme: "Behind the scenes", caption: "Behind every door, a process. Watch a Thrishank door take shape from raw timber to finished edge.", tags: "#BehindTheScenes #Craftsmanship #Thrishank", views: 11430, reach: 8700, likes: 49, comments: 5, shares: 4, saves: 8, provenance: "sample", brief: [] },
        { id: "c5", date: "2026-08-23", type: "Post", theme: "Engagement", caption: "Which finish suits your entrance? Walnut, teak or matte black. Tell us in the comments.", tags: "#DoorFinish #Thrishank #HomeDecor", views: 3910, reach: 3300, likes: 36, comments: 11, shares: 1, saves: 3, provenance: "sample", brief: [] },
        { id: "c6", date: "2026-08-26", type: "Reel", theme: "Educational", caption: "Three hinges, zero compromise. See why hardware matters as much as the door itself.", tags: "#DoorHardware #Thrishank #DidYouKnow", views: 9860, reach: 7480, likes: 44, comments: 3, shares: 5, saves: 14, provenance: "sample", brief: [] },
        { id: "c7", date: "2026-08-30", type: "Reel", theme: "Product showcase", caption: "Closing out the month with a close-up of the details you only notice when it is done right.", tags: "#Thrishank #Detail #PremiumDoors", views: 8120, reach: 6230, likes: 38, comments: 2, shares: 2, saves: 6, provenance: "sample", brief: [] },
      ],
    },
    texts: {},
    variant: {},
    titles: {},
    rows: null,
    uploads: {},
    // Insights reports 7.4% follower growth; +49 net on 726 total calculates
    // to 7.2%. The reference report was approved with the reported figure.
    resolutions: { "ig.growth": "reported" },
    notes: [
      { text: "Client asked for more dealer-focused content next month. Do not include in the client report.", by: "Mehul", date: "2026-09-02" },
    ],
    isDemo: true,
  };
}
