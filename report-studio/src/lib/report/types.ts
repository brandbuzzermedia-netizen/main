// The report document: everything the renderer needs for one client month.
// Numbers are null when they were not in the uploaded data. They are never
// estimated, and the renderer shows them as unavailable.

export type ContentType = "Reel" | "Post" | "Carousel";
export type Template = "premium" | "minimal" | "dark";
export type Confidence = "high" | "medium" | "low";

/** Where a figure came from. Only "screenshot" and "brief" are confirmed data. */
export type Provenance = "screenshot" | "brief" | "sample" | "manual";

export interface ContentItem {
  id: string;
  date: string; // ISO day
  type: ContentType;
  theme: string;
  caption: string;
  tags: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  /** Cover image URL. Placeholder art is drawn until one is uploaded. */
  img?: string | null;
  /** Default provenance of this piece's figures. */
  provenance: Provenance;
  /** Fields confirmed from the client brief, overriding `provenance`. */
  brief: string[];
}

export interface InstagramData {
  views: number | null;
  unique: number | null;
  nonFol: number | null;
  net: number | null;
  followers: number | null;
  growth: number | null;
  profileVisits: number | null;
  websiteClicks: number | null;
  messages: number | null;
  /** Followers on the first day of the period. Net change = end − start. */
  followersStart?: number | null;
  /** Accounts that interacted with the content. */
  engaged?: number | null;
  /** Account-level interaction totals from Insights. */
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  /** How many of each were published, as Insights reports them. */
  posts?: number | null;
  reels?: number | null;
  stories?: number | null;
}

/** What Meta counted as a result. Copy and labels follow it. */
export const RESULT_TYPES = ["Messaging conversations", "Leads", "Calls", "Link clicks", "Landing page views", "Purchases", "Other results"] as const;
export type ResultType = (typeof RESULT_TYPES)[number];

export interface MetaAdsData {
  campaign: string;
  objective: string;
  spend: number | null;
  /** Results, of the kind given by `resultType`. */
  conv: number | null;
  impr: number | null;
  reach: number | null;
  clicks: number | null;
  /** Missing on reports saved before result types existed: those were messaging campaigns. */
  resultType?: ResultType | "";
  /** Rates as Ads Manager reports them. Used only when they cannot be calculated. */
  ctr?: number | null;
  cpc?: number | null;
  cpm?: number | null;
}

export interface Outcomes {
  qualified: number | null;
  bookings: number | null;
  sales: number | null;
  revenue: number | null;
}

export interface PreviousMonth {
  views: number | null;
  unique: number | null;
  followers: number | null;
  net: number | null;
  posts: number | null;
  reels: number | null;
  spend: number | null;
  conv: number | null;
  impr: number | null;
  reach: number | null;
}

export interface ReportData {
  period: { start: string; end: string };
  ig: InstagramData;
  meta: MetaAdsData;
  outcomes: Outcomes;
  prev: PreviousMonth;
  content: ContentItem[];
}

export interface Brand {
  primary: string;
  accent: string;
  logo: string | null;
  /** Override for the GBS mark; defaults to the bee icon. */
  gbs: string | null;
  cover: string | null;
  /**
   * What the logo looks like, measured when it is uploaded: light marks need
   * a darker backing on light pages, dark marks a white one on dark pages,
   * and "boxed" logos carry their own background so need none.
   */
  logoTone?: LogoTone | null;
  /** Backing behind the logo: chosen from the tone ("auto"), always white, or never. */
  logoPlate?: "auto" | "white" | "none" | null;
  /** Industry drawing for covers and post placeholders; "auto" picks it from the industry. */
  art?: string | null;
}

export type LogoTone = "light" | "dark" | "boxed";

export const SECTION_KEYS = [
  "exec", "social", "calendar", "content", "ig", "meta", "google", "linkedin",
  "leads", "impact", "mom", "sources", "recs", "plan",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  exec: "Executive Summary", social: "What we worked on", calendar: "Content Calendar",
  content: "Content Performance", ig: "Instagram Analysis", meta: "Meta Ads", google: "Google Ads",
  linkedin: "LinkedIn Ads", leads: "Lead Generation", impact: "Business Impact",
  mom: "Month-over-month", sources: "Source Screenshots", recs: "Recommendations", plan: "Action Plan",
};

export type Platform = "instagram" | "meta" | "google" | "linkedin" | "ga" | "gbp" | "yt" | "other";

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram Insights", meta: "Meta Ads", google: "Google Ads", linkedin: "LinkedIn Ads",
  ga: "Google Analytics", gbp: "Google Business Profile", yt: "YouTube Analytics", other: "Other marketing screenshots",
};

/** An uploaded source screenshot, served only to signed-in staff. */
export interface SourceShot {
  /** Original file name, shown as the caption. */
  name: string;
  url: string;
  /** SHA-256 of the file, used to catch the same screenshot uploaded twice. */
  hash?: string;
}

export type Resolution = "reported" | "calculated";

/**
 * A metric where two sources disagree. The renderer never picks silently:
 * until a reviewer chooses (`chosen`), the metric is left out of the report.
 */
export interface DataConflict {
  metric: string;
  label: string;
  reported: number;
  calculated: number;
  chosen: Resolution | null;
}

export interface InternalNote {
  text: string;
  by: string;
  date: string;
}

export type ReportStatus = "Draft" | "Pending" | "Ready for review" | "Delivered";

/** The client details a report prints. Always the report's own client. */
export interface ReportClient {
  id: string;
  name: string;
  industry: string;
  location: string;
  company?: string | null;
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
}

export interface ReportDoc {
  id: string;
  status: ReportStatus;
  createdAt: string;
  client: ReportClient;
  brand: Brand;
  template: Template;
  sections: Record<SectionKey, boolean>;
  data: ReportData;
  /** Edited copy, keyed by block id ("exec", "t.0", "why.c1"). */
  texts: Record<string, string>;
  /** Which template variant each block uses. */
  variant: Record<string, number>;
  /** Edited page titles, keyed by page key. */
  titles: Record<string, string>;
  /** Edited action plan rows. Null means generated. */
  rows: string[][] | null;
  uploads: Partial<Record<Platform, SourceShot[]>>;
  /** Reviewer decisions on data conflicts, keyed by metric ("ig.growth"). */
  resolutions: Record<string, Resolution>;
  /** Admin only. Never rendered into a client report. */
  notes: InternalNote[];
  /** True while any figure is a placeholder rather than extracted data. */
  isDemo: boolean;
  /** Set when the report was copied from another report of the same client. */
  copiedFrom?: { id: string; kind: "next-month" | "duplicate" } | null;
}
