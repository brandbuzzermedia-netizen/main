import { z } from "zod";

/**
 * Get Bee Seen proposal document: the content of one proposal in the GBS format (cover, growth
 * opportunity, phases, scope, investment, commitment, why us, closing). The page at
 * /proposal-doc/[slug]/[id] lays it out in the GBS brand; this file only holds the content.
 */

export const GLYPHS = ["people", "phone", "chat", "target", "shield", "chart", "building", "pin", "layers", "flag", "check", "info", "gear"] as const;
const glyph = z.enum(GLYPHS).catch("target");
const text = (max: number) => z.string().trim().max(max);

export const ResearchSchema = z.object({
  about: text(800).describe("Two or three plain sentences on what the company does, from the sources only"),
  industry: text(120),
  city: text(120).describe("City or region, empty if unknown"),
  audience: text(300).describe("Who they sell to, empty if unknown"),
  website: text(300).describe("Their website URL if found, else empty"),
  observations: z.array(text(240)).max(6).describe("Specific, checkable observations about their current marketing or online presence"),
  sources: z.array(text(300)).max(8).describe("URLs the facts came from"),
});
export type Research = z.infer<typeof ResearchSchema>;

const card = z.object({ title: text(60), body: text(220), glyph });
const stage = z.object({ title: text(50), subtitle: text(80) });
export const PriceRow = z.object({ service: text(80), scope: text(160), amount: z.number().min(0).max(1e9), billing: z.enum(["Monthly", "One-Time"]) });
export type PriceRow = z.infer<typeof PriceRow>;

export const ProposalDocSchema = z.object({
  tags: z.array(text(30)).min(1).max(5),
  prepared_for: z.array(text(80)).max(3).describe("Short lines under the client name on the cover, e.g. 'Salon · Bengaluru'"),
  subtitle: text(80).describe("Header line on inner pages, e.g. 'Lead Generation · Performance Marketing'"),
  opportunity: z.object({
    headline: text(90), intro: text(600), cards: z.array(card).length(3), callout: text(300), approach: z.array(stage).min(3).max(5),
  }),
  phases: z.array(z.object({
    title: text(70), eyebrow: text(70), headline: text(90), body: text(600),
    groups: z.array(z.object({ label: text(60), items: z.array(text(120)).min(1).max(6) })).min(1).max(4),
    outcome: text(300),
  })).min(1).max(4),
  scope: z.object({ items: z.array(text(140)).min(2).max(10), chain: z.array(text(30)).min(3).max(5) }),
  pricing: z.object({ intro: text(400), rows: z.array(PriceRow).min(1).max(8) }),
  terms: z.array(text(160)).min(2).max(8),
  commitment: text(500),
  why_us: z.array(card).length(3),
  closing: z.object({ headline: text(80), body: text(500), checklist: z.array(text(80)).min(3).max(6) }),
});
export type ProposalDoc = z.infer<typeof ProposalDocSchema>;

/** The services GBS pitches; the form lists these and the template drafts from them. */
export const SERVICES = {
  performance: { label: "Performance marketing (Meta + Google Ads)", short: "Performance Marketing", billing: "Monthly", scope: "Strategy, Meta + Google Ads, creative testing, monthly reporting" },
  social: { label: "Social media management", short: "Social Media", billing: "Monthly", scope: "Content calendar, posts and reels, community replies" },
  seo: { label: "SEO and Google Business Profile", short: "SEO", billing: "Monthly", scope: "On-page SEO, Google Business Profile, local listings, monthly report" },
  website: { label: "Website design and build", short: "Website", billing: "One-Time", scope: "Design, build, mobile-ready pages, enquiry forms, launch" },
  automation: { label: "Lead automation (WhatsApp, CRM, routing)", short: "Lead Automation", billing: "One-Time", scope: "Lead capture, routing, WhatsApp follow-ups for opted-in leads, setup" },
  branding: { label: "Branding and creative", short: "Branding", billing: "One-Time", scope: "Logo refresh, brand kit, ad and social templates" },
} as const;
export type ServiceKey = keyof typeof SERVICES;
export const SERVICE_KEYS = Object.keys(SERVICES) as ServiceKey[];

export type DraftInput = {
  company: string; industry: string; city: string; contact: string; notes: string;
  services: { key: ServiceKey; amount: number }[];
  research: Research | null;
};

const PHASES: Record<ServiceKey, ProposalDoc["phases"][number]> = {
  performance: { title: "Performance Marketing", eyebrow: "Reach the right buyers", headline: "Campaigns Built Around Qualified Enquiries", body: "We run Meta and Google campaigns aimed at people most likely to buy, then shift budget to what brings real enquiries, not just clicks.",
    groups: [{ label: "Campaigns", items: ["Meta Ads setup and management", "Google Search campaigns for high-intent buyers", "Audience and location targeting"] }, { label: "Optimisation", items: ["Creative testing every month", "Budget moved to the best ad sets", "Monthly spend, leads and cost-per-lead report"] }],
    outcome: "Phase outcome: a steady flow of enquiries with a known cost per lead." },
  social: { title: "Social Media", eyebrow: "Stay visible every week", headline: "A Social Presence That Builds Trust", body: "A planned calendar of posts and reels that shows the work, the people and the results, so buyers who find you see an active brand.",
    groups: [{ label: "Content", items: ["Monthly content calendar", "Posts and reels", "Captions and hashtags"] }, { label: "Community", items: ["Replies to comments and messages", "Monthly performance summary"] }],
    outcome: "Phase outcome: a consistent, trusted brand on the channels customers check before buying." },
  seo: { title: "SEO & Local Search", eyebrow: "Be found when people search", headline: "Show Up When Customers Look For You", body: "We improve how the business appears on Google search and Maps so nearby customers find it first.",
    groups: [{ label: "Search", items: ["On-page SEO for key pages", "Keyword and competitor review"] }, { label: "Local", items: ["Google Business Profile optimisation", "Local listings and reviews plan"] }],
    outcome: "Phase outcome: more organic and Maps enquiries over time." },
  website: { title: "Website", eyebrow: "A site that converts", headline: "A Website Built To Turn Visitors Into Enquiries", body: "A fast, mobile-ready website with clear offers and simple enquiry forms, built to support every campaign.",
    groups: [{ label: "Build", items: ["Design and copy structure", "Mobile-ready pages", "Enquiry and WhatsApp buttons"] }, { label: "Launch", items: ["Speed and SEO basics", "Analytics and conversion tracking"] }],
    outcome: "Phase outcome: a website that turns ad and search traffic into enquiries." },
  automation: { title: "Lead Automation", eyebrow: "Respond faster", headline: "No Enquiry Left Waiting", body: "Every enquiry is captured in one place, assigned to the right person and followed up on time, with WhatsApp messages only to people who opted in.",
    groups: [{ label: "System", items: ["Lead capture from ads, site and forms", "Automatic routing to the team", "Follow-up reminders"] }, { label: "Messaging", items: ["WhatsApp templates for opted-in leads", "Simple reporting on response time"] }],
    outcome: "Phase outcome: faster responses and fewer lost enquiries." },
  branding: { title: "Branding & Creative", eyebrow: "Look the part", headline: "A Brand That Looks As Good As The Work", body: "A refreshed brand kit and ready templates so every ad, post and document looks consistent.",
    groups: [{ label: "Brand", items: ["Logo refresh", "Colours and type", "Brand kit"] }, { label: "Templates", items: ["Ad and social templates", "Proposal and offer templates"] }],
    outcome: "Phase outcome: a consistent, recognisable brand across every channel." },
};

/** A complete first draft from the chosen services, used when AI drafting is off; a person edits it before sending. */
export function templateDoc(input: DraftInput): ProposalDoc {
  const name = input.company;
  const keys = input.services.map((s) => s.key);
  const r = input.research;
  const where = input.city || r?.city || "";
  const what = input.industry || r?.industry || "";
  return {
    tags: keys.slice(0, 4).map((k) => SERVICES[k].short.toUpperCase()),
    prepared_for: [[what, where].filter(Boolean).join(" · "), input.contact ? `Attn: ${input.contact}` : ""].filter(Boolean),
    subtitle: keys.slice(0, 2).map((k) => SERVICES[k].short).join(" · "),
    opportunity: {
      headline: `Building Stronger Demand For ${name}`,
      intro: r?.about ? `${r.about} The next step is a predictable system that brings more of the right customers and responds to them faster.`
        : `${name} has built a strong product and customer base. The next opportunity is a predictable system that brings more of the right customers and responds to them faster.`,
      cards: [
        { title: "Reach New Customers", body: "Find and attract the customer segments most likely to buy.", glyph: "people" },
        { title: "More Direct Enquiries", body: "Turn attention into calls, messages and form enquiries.", glyph: "phone" },
        { title: "Faster Follow-Up", body: "Capture every lead and respond while interest is high.", glyph: "chat" },
      ],
      callout: "The objective is not simply more leads. It is a predictable acquisition system that grows with the business.",
      approach: [
        { title: "Research & Strategy", subtitle: "Customers, competitors, offers" },
        ...keys.slice(0, 2).map((k) => ({ title: SERVICES[k].short, subtitle: SERVICES[k].scope.split(",")[0] })),
        { title: "Optimise & Scale", subtitle: "Grow what performs" },
      ],
    },
    phases: keys.slice(0, 4).map((k) => PHASES[k]),
    scope: {
      items: keys.map((k) => `${SERVICES[k].short}: ${SERVICES[k].scope}`).concat("Monthly review call and written report").slice(0, 10),
      chain: ["Right Audience", "Relevant Enquiry", "Faster Response", "Better Conversion"],
    },
    pricing: {
      intro: "The engagement combines a monthly retainer for ongoing work with one-time fees for setup and builds. Taxes are extra as applicable.",
      rows: input.services.map((s) => ({ service: SERVICES[s.key].short, scope: SERVICES[s.key].scope, amount: s.amount, billing: SERVICES[s.key].billing })),
    },
    terms: ["Monthly fees are billed in advance at the start of each month", "One-time fees: 50% to start, 50% on delivery", "Ad spend is paid directly by the client to Meta and Google", "GST is charged extra as applicable", "Either side may end the retainer with 30 days' written notice"],
    commitment: `Our objective is not simply to run campaigns but to create real business opportunities for ${name}. We review results with you every month and change what is not working.`,
    why_us: [
      { title: "Built For Leads", body: "Every campaign is measured on enquiries and cost per lead.", glyph: "target" },
      { title: "One Team", body: "Strategy, creative, ads and automation in one place.", glyph: "layers" },
      { title: "Clear Reporting", body: "Simple monthly reports on spend, leads and next steps.", glyph: "chart" },
    ],
    closing: {
      headline: "Build The Demand. Scale The System.",
      body: `We look forward to partnering with ${name} to build a stronger, more predictable growth engine.`,
      checklist: ["More qualified enquiries", "Faster lead handling", "Better online visibility", "A system that scales"],
    },
  };
}

export const rupee = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export function totals(rows: PriceRow[]) {
  const once = rows.filter((r) => r.billing === "One-Time").reduce((s, r) => s + r.amount, 0);
  const monthly = rows.filter((r) => r.billing === "Monthly").reduce((s, r) => s + r.amount, 0);
  return { once, monthly, firstMonth: once + monthly };
}

/** Text helpers for the edit form: one item per line, prices as "Service | Scope | Amount | Monthly or One-Time". */
export const lines = (s: unknown) => String(s ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
export function parsePriceLines(s: string): PriceRow[] {
  return lines(s).map((l) => {
    const [service = "", scope = "", amount = "0", billing = "Monthly"] = l.split("|").map((x) => x.trim());
    return { service: service.slice(0, 80), scope: scope.slice(0, 160), amount: Math.max(0, Number(amount.replace(/[^\d.]/g, "")) || 0), billing: /one/i.test(billing) ? "One-Time" as const : "Monthly" as const };
  }).filter((r) => r.service);
}
export const priceLines = (rows: PriceRow[]) => rows.map((r) => `${r.service} | ${r.scope} | ${r.amount} | ${r.billing}`).join("\n");

type AiDoc = {
  tags: string[]; prepared_for: string[]; subtitle: string;
  opportunity: { headline: string; intro: string; cards: { title: string; body: string; glyph: string }[]; callout: string; approach: { title: string; subtitle: string }[] };
  phases: ProposalDoc["phases"]; scope: { items: string[]; chain: string[] }; pricing_intro: string; terms: string[]; commitment: string;
  why_us: { title: string; body: string; glyph: string }[]; closing: { headline: string; body: string; checklist: string[] };
};

/**
 * Combines an AI draft with the template: AI text where it fits the format, the template wherever
 * the AI left a gap, and always the prices GBS typed (the AI never sets prices).
 */
export function mergeAiDraft(ai: AiDoc | null, base: ProposalDoc): ProposalDoc {
  if (!ai) return base;
  const fill = <T,>(xs: T[] | undefined, fallback: T[], min: number, max: number) => (xs && xs.length >= min ? xs.slice(0, max) : fallback);
  const cards = (xs: AiDoc["why_us"], fb: ProposalDoc["why_us"]) => xs?.length >= 3 ? xs.slice(0, 3).map((c) => ({ ...c, glyph: (GLYPHS as readonly string[]).includes(c.glyph) ? c.glyph : "target" })) : fb;
  const candidate = {
    tags: fill(ai.tags, base.tags, 1, 4),
    prepared_for: fill(ai.prepared_for, base.prepared_for, 1, 2),
    subtitle: ai.subtitle || base.subtitle,
    opportunity: {
      headline: ai.opportunity?.headline || base.opportunity.headline, intro: ai.opportunity?.intro || base.opportunity.intro,
      cards: cards(ai.opportunity?.cards, base.opportunity.cards), callout: ai.opportunity?.callout || base.opportunity.callout,
      approach: fill(ai.opportunity?.approach, base.opportunity.approach, 3, 5),
    },
    phases: fill(ai.phases?.filter((p) => p.groups?.length && p.groups.every((g) => g.items?.length)).map((p) => ({ ...p, groups: p.groups.slice(0, 4).map((g) => ({ ...g, items: g.items.slice(0, 6) })) })), base.phases, 1, 4),
    scope: { items: fill(ai.scope?.items, base.scope.items, 2, 10), chain: fill(ai.scope?.chain, base.scope.chain, 3, 5) },
    pricing: { intro: ai.pricing_intro || base.pricing.intro, rows: base.pricing.rows },
    terms: base.terms, // commercial terms stay GBS's own, never AI-written
    commitment: ai.commitment || base.commitment,
    why_us: cards(ai.why_us, base.why_us),
    closing: { headline: ai.closing?.headline || base.closing.headline, body: ai.closing?.body || base.closing.body, checklist: fill(ai.closing?.checklist, base.closing.checklist, 3, 6) },
  };
  const ok = ProposalDocSchema.safeParse(candidate);
  return ok.success ? ok.data : base;
}

/** Companies with the Get Bee Seen proposal format. */
export const hasBrandedProposals = (slug: string) => slug === "gbs" || slug === "demo-gbs";

/** Get Bee Seen's own details on every proposal (from the GBS proposal format). */
export const GBS_CONTACT = {
  signer: "Mehul Patel",
  email: "info@getbeeseen.com",
  phone: "+91 81474 52427",
  web: "www.getbeeseen.com",
  address: "2nd Floor, 475, RBI Layout Main Rd, JP Nagar 7th Phase, Bengaluru 560078",
};
