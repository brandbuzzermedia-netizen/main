/**
 * Company registry vocabulary, module catalogue and the starting templates for the
 * workspaces named in the founder's brief.
 *
 * Templates are configuration, not data: they carry names, ownership as described in the
 * brief, enabled modules, pipeline stages and brand colours. No figures, no people, no
 * commission rates. Everything here can be changed per company after creation.
 */

/** Module catalogue in the order and with the icons of the Company OS design. */
export const MODULES = [
  { key: "home", label: "Home", icon: "◧", phase: 0 },
  { key: "leads", label: "Leads", icon: "◎", phase: 0 },
  { key: "pipeline", label: "Pipeline", icon: "▥", phase: 0 },
  { key: "outreach", label: "Outreach", icon: "➶", phase: 0 },
  { key: "meetings", label: "Meetings", icon: "◷", phase: 0 },
  { key: "customers", label: "Customers", icon: "☺", phase: 0 },
  { key: "operations", label: "Operations", icon: "⚙", phase: 0 },
  { key: "automation", label: "Automation", icon: "⚡", phase: 0 },
  { key: "marketing", label: "Marketing", icon: "◈", phase: 0 },
  { key: "finance", label: "Finance", icon: "₹", phase: 0 },
  { key: "rental", label: "Rental income", icon: "⌂", phase: 0 },
  { key: "expenses", label: "Expenses & bills", icon: "▭", phase: 0 },
  { key: "tax", label: "Tax & GST", icon: "§", phase: 0 },
  { key: "team", label: "Team", icon: "☷", phase: 0 },
  { key: "reports", label: "Reports", icon: "▤", phase: 0 },
  { key: "vault", label: "Vault", icon: "▣", phase: 0 },
  { key: "settings", label: "Settings", icon: "✲", phase: 0 },
  { key: "tasks", label: "Tasks & follow-ups", icon: "✓", phase: 0 },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];
export const MODULE_KEYS = MODULES.map((m) => m.key) as ModuleKey[];
/** Modules every workspace keeps; they cannot be switched off. */
export const CORE_MODULES: ModuleKey[] = ["home", "settings"];
/** Company workspaces show every module; rental, expenses and tax appear as Finance tabs rather than menu items. */
export const COMPANY_MODULES: ModuleKey[] = ["home", "leads", "pipeline", "outreach", "meetings", "customers", "operations", "automation", "marketing", "finance", "rental", "expenses", "tax", "team", "reports", "vault", "settings"];

export function moduleInfo(key: ModuleKey) {
  return MODULES.find((m) => m.key === key)!;
}

export const OWNERSHIP_TYPES = {
  wholly_owned: "Wholly owned",
  director_partner_operated: "Director · partner-operated",
  partner_channel: "Partner channel",
  joint_venture: "Joint venture",
  family_owned: "Family-owned",
  proposed: "Proposed · pre-launch",
  unconfigured: "Not configured",
} as const;
export type OwnershipType = keyof typeof OWNERSHIP_TYPES;

export const CONSOLIDATION = {
  consolidated: "Consolidated in group totals",
  commission_only: "Only contracted commission is income",
  share_per_agreement: "Share per agreement",
  not_consolidated: "Not consolidated",
  needs_confirmation: "Consolidation needs confirmation",
} as const;
export type Consolidation = keyof typeof CONSOLIDATION;

export const BUSINESS_MODELS = {
  agency: "Agency",
  product_b2b: "Products · B2B first",
  ecommerce_services: "E-commerce and services",
  international_services: "International services",
  services: "Services",
  real_estate: "Real estate",
  partner_channel: "Partner referral channel",
  restaurant: "Restaurant franchise",
  retail: "Retail",
  general: "General",
} as const;
export type BusinessModel = keyof typeof BUSINESS_MODELS;

export const LIFECYCLE = { active: "Active", pre_launch: "Pre-launch", setup: "Setup needed", archived: "Archived" } as const;
export type Lifecycle = keyof typeof LIFECYCLE;

export const LOGO_KEYS = ["gbs", "tanofun", "iyp", "brightwire", "moreofus"] as const;
export type LogoKey = (typeof LOGO_KEYS)[number];

export type StageKind = "open" | "meeting" | "proposal" | "negotiation" | "won" | "lost";
export type StageTemplate = { name: string; kind: StageKind; probability_pct: number };

export type CompanyTemplate = {
  slug: string;
  name: string;
  short_name: string;
  ownership_type: OwnershipType;
  owner_label: string;
  consolidation: Consolidation;
  business_model: BusinessModel;
  lifecycle_status: Lifecycle;
  enabled_modules: ModuleKey[];
  sidebar_color: string;
  accent_color: string;
  logo_key: LogoKey | null;
  /** Probabilities are placeholders the owner is asked to confirm; 0 means "not set". */
  stages: StageTemplate[];
  setup: string[];
};

const s = (name: string, kind: StageKind = "open", probability_pct = 0): StageTemplate => ({ name, kind, probability_pct });
const salesStages = (...open: string[]) => [...open.map((n) => s(n)), s("Won", "won", 100), s("Lost", "lost", 0)];

const BASE: ModuleKey[] = ["home", "pipeline", "meetings", "tasks", "team", "settings"];

/**
 * The workspaces named in the brief. Ownership follows the brief exactly; anything the brief
 * marks as unconfirmed is "needs_confirmation". The missing tenth business is NOT invented:
 * the group owner adds it from "Add a business" once it is confirmed.
 */
export const COMPANY_TEMPLATES: CompanyTemplate[] = [
  {
    slug: "gbs", name: "Get Bee Seen", short_name: "GBS", ownership_type: "wholly_owned", owner_label: "Mehul",
    consolidation: "consolidated", business_model: "agency", lifecycle_status: "active",
    enabled_modules: [...BASE, "leads", "outreach", "customers", "operations", "automation", "marketing", "finance", "reports", "vault"],
    sidebar_color: "#3E5E49", accent_color: "#F2E9CF", logo_key: "gbs",
    stages: salesStages("Lead", "Qualified", "Meeting", "Proposal", "Negotiation").map((st) =>
      st.name === "Meeting" ? { ...st, kind: "meeting" as const } : st.name === "Proposal" ? { ...st, kind: "proposal" as const } : st.name === "Negotiation" ? { ...st, kind: "negotiation" as const } : st),
    setup: ["Confirm stage probabilities for the weighted forecast", "Invite the sales team with scoped roles", "Import open deals"],
  },
  {
    slug: "tan-o-fun", name: "Tan O' Fun", short_name: "Tan O' Fun", ownership_type: "wholly_owned", owner_label: "Mehul",
    consolidation: "consolidated", business_model: "product_b2b", lifecycle_status: "active",
    enabled_modules: [...BASE, "leads", "customers", "operations", "automation", "finance", "reports", "vault"],
    sidebar_color: "#1A2BA6", accent_color: "#FFC71F", logo_key: "tanofun",
    stages: [s("Enquiry"), s("Quote sent", "proposal"), s("Accepted", "negotiation"), s("50% advance"), s("Supplier PO"), s("Dispatched"), s("Delivered", "won", 100), s("Lost", "lost")],
    setup: ["Add SKUs with BIS certification evidence before listing", "Add dealers and price tiers", "Confirm the B2B advance percentage"],
  },
  {
    slug: "iyp", name: "In Your Pocket", short_name: "IYP", ownership_type: "wholly_owned", owner_label: "Mehul",
    consolidation: "consolidated", business_model: "ecommerce_services", lifecycle_status: "active",
    enabled_modules: [...BASE, "leads", "customers", "operations", "automation", "marketing", "finance", "reports"],
    sidebar_color: "#111111", accent_color: "#DEDCDC", logo_key: "iyp",
    stages: [s("Enquiry"), s("Discovery", "meeting"), s("Proposal", "proposal"), s("Build"), s("Delivered", "won", 100), s("Lost", "lost")],
    setup: ["Connect Shopify (needs credentials)", "Add tech-service offerings", "Confirm separate legal entity details"],
  },
  {
    slug: "brightwire", name: "Brightwire", short_name: "Brightwire", ownership_type: "wholly_owned", owner_label: "Mehul",
    consolidation: "needs_confirmation", business_model: "international_services", lifecycle_status: "setup",
    enabled_modules: [...BASE, "leads", "outreach", "customers", "finance"],
    sidebar_color: "#0B4D32", accent_color: "#E0A91F", logo_key: "brightwire",
    stages: [s("Target account"), s("Researched"), s("Contacted"), s("Replied"), s("Meeting", "meeting"), s("Proposal", "proposal"), s("Contract", "negotiation"), s("Project", "won", 100), s("Lost", "lost")],
    setup: ["Add target countries and time zones", "Set base currency and FX source", "Record privacy and consent rules per country", "Import first target accounts"],
  },
  {
    slug: "more-of-us", name: "More of Us", short_name: "More of Us", ownership_type: "director_partner_operated", owner_label: "Mehul (director)",
    consolidation: "needs_confirmation", business_model: "services", lifecycle_status: "active",
    enabled_modules: [...BASE, "leads", "outreach", "customers", "operations", "finance", "reports", "vault"],
    sidebar_color: "#141414", accent_color: "#EDEAE0", logo_key: "moreofus",
    stages: salesStages("Lead", "Qualified", "Discovery call", "Proposal sent", "Negotiation").map((st) =>
      st.name === "Discovery call" ? { ...st, kind: "meeting" as const } : st.name === "Proposal sent" ? { ...st, kind: "proposal" as const } : st.name === "Negotiation" ? { ...st, kind: "negotiation" as const } : st),
    setup: ["Confirm consolidation treatment with partners", "Mark NDA-restricted accounts", "Grant directors only what they need"],
  },
  {
    slug: "real-estate", name: "Real Estate Firm (name pending)", short_name: "Real Estate", ownership_type: "proposed", owner_label: "Mehul",
    consolidation: "needs_confirmation", business_model: "real_estate", lifecycle_status: "pre_launch",
    enabled_modules: [...BASE, "leads", "customers", "operations", "finance"],
    sidebar_color: "#173F32", accent_color: "#C7A45A", logo_key: null,
    stages: [s("Buyer lead"), s("Qualified"), s("Shortlist"), s("Site visit", "meeting"), s("Offer", "proposal"), s("Milestones", "negotiation"), s("Closed", "won", 100), s("Lost", "lost")],
    setup: ["Enter the legal entity name", "Record K-RERA registration before any advertising", "Add first listing or mandate", "Add brokers"],
  },
  {
    slug: "ashwin-bhai", name: "Ashwin Bhai Channel", short_name: "Ashwin Bhai", ownership_type: "partner_channel", owner_label: "Partner (Ashwin)",
    consolidation: "commission_only", business_model: "partner_channel", lifecycle_status: "active",
    enabled_modules: [...BASE, "leads", "finance"],
    sidebar_color: "#173F32", accent_color: "#C7A45A", logo_key: null,
    stages: [s("Lead"), s("Handed off"), s("Site visit", "meeting"), s("Negotiation", "negotiation"), s("Closed (partner confirmed)", "won", 100), s("Lost", "lost")],
    setup: ["Record the signed commission agreement (no percentage is assumed)", "Record consent for each referred lead"],
  },
  {
    slug: "accent-spaces", name: "Accent Spaces Channel", short_name: "Accent Spaces", ownership_type: "partner_channel", owner_label: "Partner (Accent Spaces)",
    consolidation: "commission_only", business_model: "partner_channel", lifecycle_status: "active",
    enabled_modules: [...BASE, "leads", "finance"],
    sidebar_color: "#173F32", accent_color: "#C7A45A", logo_key: null,
    stages: [s("Lead"), s("Handed off"), s("Design brief", "meeting"), s("Quote", "proposal"), s("Closed (partner confirmed)", "won", 100), s("Lost", "lost")],
    setup: ["Record the signed commission agreement (no percentage is assumed)"],
  },
  {
    slug: "refresh-money", name: "Refresh Money Channel", short_name: "Refresh Money", ownership_type: "partner_channel", owner_label: "Partner (Refresh Money)",
    consolidation: "commission_only", business_model: "partner_channel", lifecycle_status: "active",
    enabled_modules: [...BASE, "leads", "finance"],
    sidebar_color: "#173F32", accent_color: "#C7A45A", logo_key: null,
    stages: [s("Lead"), s("Consent recorded"), s("Sent to provider"), s("Provider status"), s("Disbursed (verified)", "won", 100), s("Not eligible", "lost")],
    setup: ["Record consent before handoff; never collect OTPs or identity documents here", "Record the signed commission agreement"],
  },
  {
    slug: "la-pinoz", name: "La Pino'z Pizza", short_name: "La Pino'z", ownership_type: "joint_venture", owner_label: "Brother (with Mehul and a partner)",
    consolidation: "share_per_agreement", business_model: "restaurant", lifecycle_status: "active",
    enabled_modules: ["home", "tasks", "operations", "finance", "team", "settings"],
    sidebar_color: "#173F32", accent_color: "#C7A45A", logo_key: null,
    stages: [s("Bulk enquiry"), s("Quoted", "proposal"), s("Confirmed", "won", 100), s("Lost", "lost")],
    setup: ["Record ownership shares from the verified agreement", "Confirm Petpooja outlet access before any POS integration", "Grant the brother and partner their own access"],
  },
  {
    slug: "vyra-studio", name: "Vyra Studio", short_name: "Vyra Studio", ownership_type: "family_owned", owner_label: "Mother",
    consolidation: "needs_confirmation", business_model: "retail", lifecycle_status: "pre_launch",
    enabled_modules: [...BASE, "customers", "operations", "marketing", "finance"],
    sidebar_color: "#173F32", accent_color: "#C7A45A", logo_key: null,
    stages: [s("Enquiry"), s("Styling chat", "meeting"), s("Order", "proposal"), s("Reserved", "negotiation"), s("Delivered", "won", 100), s("Lost", "lost")],
    setup: ["Add first SKUs with fabric, weave, price and photos", "Set shipping and return policy", "Connect Instagram and WhatsApp enquiries"],
  },
];

// The design shows every module in every company; owners switch modules off in Settings.
for (const t of COMPANY_TEMPLATES) t.enabled_modules = [...COMPANY_MODULES];

/** Group shell identity. Restrained and separate from every company's brand. */
export const GROUP_BRAND = { sidebar: "#173F32", accent: "#C7A45A" } as const;

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,47}$/.test(slug);
}
