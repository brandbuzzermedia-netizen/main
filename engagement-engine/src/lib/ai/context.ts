import { createHash } from "node:crypto";
import type { Db } from "@/lib/db";

export class ContextIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextIsolationError";
  }
}

export interface BrandContext {
  company_name: string;
  website: string | null;
  industry: string | null;
  description: string | null;
  products: string[];
  services: string[];
  usp: string | null;
  target_market: string | null;
  location: string | null;
  business_model: string;
  brand_personality: string[];
  tone: string[];
  language: string;
  comment_length: "short" | "medium" | "long";
  cta_style: "none" | "soft" | "direct";
  emoji_policy: "none" | "sparing" | "allowed";
  words_to_use: string[];
  words_to_avoid: string[];
  topics_to_avoid: string[];
  competitors: string[];
  claims_requiring_approval: string[];
  keywords: string[];
  hashtags: string[];
}

export interface SegmentContext {
  id: string;
  name: string;
  description: string | null;
  industries: string[];
  job_titles: string[];
  locations: string[];
  interests: string[];
  keywords: string[];
  hashtags: string[];
  negative_keywords: string[];
}

export interface ClientAiContext {
  organizationId: string;
  clientId: string;
  campaignId: string;
  clientName: string;
  brand: BrandContext;
  documents: { kind: string; title: string; content: string }[];
  segments: SegmentContext[];
  campaign: {
    id: string;
    name: string;
    objective: string | null;
    platforms: string[];
    keywords: string[];
    hashtags: string[];
    locations: string[];
    min_score: number;
  };
  targetHandles: string[];
  approvedExamples: { text: string; type: string; platform: string }[];
  editFeedback: { before: string; after: string }[];
  /** Stable hash of everything above, stored with each generation for traceability. */
  hash: string;
}

const EMPTY_BRAND: BrandContext = {
  company_name: "",
  website: null,
  industry: null,
  description: null,
  products: [],
  services: [],
  usp: null,
  target_market: null,
  location: null,
  business_model: "b2b",
  brand_personality: [],
  tone: [],
  language: "English",
  comment_length: "medium",
  cta_style: "none",
  emoji_policy: "sparing",
  words_to_use: [],
  words_to_avoid: [],
  topics_to_avoid: [],
  competitors: [],
  claims_requiring_approval: [],
  keywords: [],
  hashtags: [],
};

const MAX_DOCUMENT_CHARS = Number(process.env.AI_MAX_DOCUMENT_CHARS ?? 60_000);

/** Throws unless every row belongs to the expected client. */
export function assertSingleClient(expected: string, rows: { client_id: string }[], what: string): void {
  for (const r of rows) {
    if (r.client_id !== expected) {
      throw new ContextIsolationError(`${what} row belongs to a different client; refusing to build AI context`);
    }
  }
}

/**
 * The only way AI context is assembled. Loads exclusively this client's brand profile,
 * documents, audience segments, campaign, target profiles, and approved/edited comments.
 * Every query filters by client_id; every row is then re-checked.
 */
export async function loadClientAiContext(db: Db, p: { clientId: string; campaignId: string }): Promise<ClientAiContext> {
  const { clientId, campaignId } = p;

  const client = await db.one<{ id: string; client_id: string; organization_id: string; name: string }>(
    "select id, id as client_id, organization_id, name from clients where id = $1",
    [clientId],
  );
  if (!client) throw new ContextIsolationError("client not found");

  const campaign = await db.one<ClientAiContext["campaign"] & { client_id: string }>(
    `select id, client_id, name, objective, platforms, keywords, hashtags, locations, min_score
     from campaigns where id = $1 and client_id = $2`,
    [campaignId, clientId],
  );
  if (!campaign) throw new ContextIsolationError("campaign does not belong to this client");

  const brandRow = await db.one<BrandContext & { client_id: string }>(
    `select client_id, company_name, website, industry, description, products, services, usp, target_market, location,
            business_model, brand_personality, tone, language, comment_length, cta_style, emoji_policy, words_to_use,
            words_to_avoid, topics_to_avoid, competitors, claims_requiring_approval, keywords, hashtags
     from brand_profiles where client_id = $1`,
    [clientId],
  );

  const docs = await db.query<{ client_id: string; kind: string; title: string; content_text: string }>(
    "select client_id, kind, title, content_text from brand_documents where client_id = $1 order by created_at",
    [clientId],
  );

  const segments = await db.query<SegmentContext & { client_id: string }>(
    `select s.id, s.client_id, s.name, s.description, s.industries, s.job_titles, s.locations, s.interests,
            coalesce(array_agg(k.keyword) filter (where k.kind = 'keyword'), '{}') as keywords,
            coalesce(array_agg(k.keyword) filter (where k.kind = 'hashtag'), '{}') as hashtags,
            coalesce(array_agg(k.keyword) filter (where k.kind = 'negative'), '{}') as negative_keywords
     from campaign_segments cs
     join audience_segments s on s.id = cs.segment_id and s.client_id = cs.client_id
     left join audience_keywords k on k.segment_id = s.id and k.client_id = s.client_id
     where cs.campaign_id = $1 and cs.client_id = $2
     group by s.id order by s.name`,
    [campaignId, clientId],
  );

  const targets = await db.query<{ client_id: string; handle: string }>(
    `select tp.client_id, tp.handle from campaign_target_profiles ctp
     join target_profiles tp on tp.id = ctp.target_profile_id and tp.client_id = ctp.client_id
     where ctp.campaign_id = $1 and ctp.client_id = $2`,
    [campaignId, clientId],
  );

  const approved = await db.query<{ client_id: string; current_text: string; comment_type: string; platform: string }>(
    `select client_id, current_text, comment_type, platform from comments
     where client_id = $1 and status in ('approved','queued','published')
     order by approved_at desc nulls last limit 8`,
    [clientId],
  );

  const edits = await db.query<{ client_id: string; previous_text: string; new_text: string }>(
    `select client_id, previous_text, new_text from comment_edits
     where client_id = $1 and kind = 'edit' order by created_at desc limit 6`,
    [clientId],
  );

  assertSingleClient(clientId, [client, campaign, ...(brandRow ? [brandRow] : []), ...docs, ...segments, ...targets, ...approved, ...edits], "context");

  let budget = MAX_DOCUMENT_CHARS;
  const documents = docs.map((d) => {
    const content = d.content_text.slice(0, Math.max(0, budget));
    budget -= content.length;
    return { kind: d.kind, title: d.title, content };
  }).filter((d) => d.content.length > 0);

  const { client_id: _b, ...brand } = brandRow ?? { ...EMPTY_BRAND, client_id: clientId, company_name: client.name };
  const { client_id: _c, ...campaignData } = campaign;
  void _b;
  void _c;

  const ctx: Omit<ClientAiContext, "hash"> = {
    organizationId: client.organization_id,
    clientId,
    campaignId,
    clientName: client.name,
    brand: { ...EMPTY_BRAND, ...brand, company_name: brand.company_name || client.name },
    documents,
    segments: segments.map(({ client_id: _s, ...s }) => {
      void _s;
      return s;
    }),
    campaign: campaignData,
    targetHandles: targets.map((t) => t.handle),
    approvedExamples: approved.map((a) => ({ text: a.current_text, type: a.comment_type, platform: a.platform })),
    editFeedback: edits.map((e) => ({ before: e.previous_text, after: e.new_text })),
  };
  return { ...ctx, hash: createHash("sha256").update(JSON.stringify(ctx)).digest("hex").slice(0, 32) };
}
