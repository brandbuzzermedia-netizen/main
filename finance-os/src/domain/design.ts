/**
 * Presentation settings taken from the Company OS design (Company OS.dc.html): brand colours,
 * heading fonts, menu names, ownership wording, compliance gates, operations cards, workflow
 * library, setup checklists and the home KPI set. Keyed by the registry template slug; companies
 * added later fall back to the group look.
 */
import type { ModuleKey } from "./registry";

export type FontKey = "newsreader" | "caprasimo" | "outfit" | "baloo";
export type KpiSet = "agency" | "products" | "ecommerce" | "pipeline" | "partner" | "loans" | "restaurant";
export type ExtItem = { t: string; d: string; tag: string; to?: string };
export type Workflow = { n: string; trigger: string; mode: "Auto" | "Approval" | "Hard gate" };
export type CompanyDesign = {
  side: string; hi: string; acc: string; font: FontKey;
  logo?: { key: string; bg: string; size: string };
  own: string; treat: string;
  ren: Partial<Record<ModuleKey, string>>;
  gate: [title: string, state: string, note: string];
  ext: ExtItem[];
  wf: Workflow[];
  kpis: KpiSet;
  empty?: { title: string; msg: string; setup: string[] };
};

const BASEWF: Workflow[] = [
  { n: "Lead → dedupe, enrich, score, assign", trigger: "New lead", mode: "Auto" },
  { n: "Positive reply → meeting task", trigger: "Reply classified", mode: "Auto" },
  { n: "Meeting notes → tasks", trigger: "Meeting outcome", mode: "Auto" },
  { n: "Proposal → follow-up", trigger: "3 days no reply", mode: "Approval" },
];
const it = (t: string, d: string, tag: string, to?: string): ExtItem => ({ t, d, tag, to });
const G = { side: "#173F32", hi: "#C7A45A", font: "newsreader" as FontKey };

export const GROUP_DESIGN = { ...G, acc: "#C7A45A", own: "Group Command Centre", treat: "Authorised consolidated view",
  logo: { key: "diwani", bg: "#FBF8EE", size: "auto 135%" },
  ren: { team: "People", meetings: "Calendar", pipeline: "Group pipeline" } as Partial<Record<ModuleKey, string>>,
  stages: ["Lead", "Qualified", "Meeting", "Proposal", "Negotiation", "Won"] };

export const COMPANY_DESIGN: Record<string, CompanyDesign> = {
  gbs: { side: "#3E5E49", hi: "#F2E9CF", acc: "#3E5E49", font: "caprasimo", logo: { key: "gbs", bg: "#3E5E49", size: "auto 100%" },
    own: "Owned", treat: "Consolidated in group", ren: { operations: "Delivery", marketing: "Campaigns" },
    gate: ["Website 48-hour delivery promise", "Needs scope check", "Offered only when scope and capacity are validated"],
    ext: [it("Service catalogue & packages", "Basic, Growth, Premium. Three-month minimum where applicable.", "Configurable"),
      it("Client onboarding", "Access collection, kickoff booking, checklist.", "Workflow", "meetings"),
      it("Campaign performance", "Spend, leads, CPL per client. Client ad spend is pass-through, never agency revenue.", "Live", "r/ads"),
      it("Website production checklist", "Scope, design, build, QA, handover.", "Checklist", "meetings"),
      it("Partner delivery", "Social media via Grow Me Social: briefs, approvals, status.", "Partner"),
      it("Retainer MRR & renewals", "Recurring revenue and renewal dates.", "Finance", "finance"),
      it("Client reports", "Monthly draft, human-approved before sending.", "AI draft", "outreach")],
    wf: [...BASEWF, { n: "Qualified → book meeting", trigger: "Stage change", mode: "Auto" }, { n: "Invoice due → collection task", trigger: "Due date", mode: "Auto" },
      { n: "Client won → onboarding", trigger: "Stage = Won", mode: "Auto" }, { n: "Monthly report draft", trigger: "1st of month", mode: "Approval" }],
    kpis: "agency" },
  "tan-o-fun": { side: "#1A2BA6", hi: "#FFC71F", acc: "#2FB30F", font: "baloo", logo: { key: "tanofun", bg: "#FFFFFF", size: "auto 150%" },
    own: "Owned", treat: "Consolidated in group", ren: { pipeline: "Quotes & orders", customers: "Dealers & buyers", operations: "Catalogue & supply" },
    gate: ["BIS certification evidence", "Listing blocked if missing", "Only BIS-certified toys may be published or sold"],
    ext: [it("Products / SKUs", "Each toy SKU needs attached BIS evidence.", "BIS gate", "r/products"), it("Supplier catalogue", "Supplier-direct fulfilment with virtual stock.", "Live", "r/suppliers"),
      it("Dealers & territories", "Price tiers by dealer and territory.", "Configurable", "customers"), it("Quotes", "Bulk and corporate gifting quotes.", "Workflow", "r/orders"),
      it("50% advance gate", "B2B order cannot reach supplier PO until advance is verified.", "Hard gate", "r/orders"),
      it("Supplier acknowledgement & tracking", "PO, acknowledgement, dispatch, delivery.", "Workflow", "r/orders"), it("Balance collection", "Reminder on delivery.", "Auto", "r/orders")],
    wf: [{ n: "Enquiry → quote", trigger: "New enquiry", mode: "Approval" }, { n: "Accepted quote → verify 50% advance", trigger: "Quote accepted", mode: "Auto" },
      { n: "Advance → supplier PO", trigger: "Advance verified", mode: "Approval" }, { n: "Dispatch → tracking", trigger: "Supplier update", mode: "Auto" },
      { n: "Delivered → balance reminder", trigger: "Delivered", mode: "Auto" }, { n: "BIS evidence expiry → block listing", trigger: "30 days before", mode: "Auto" }],
    kpis: "products" },
  iyp: { side: "#111111", hi: "#DEDCDC", acc: "#111111", font: "outfit", logo: { key: "iyp", bg: "#DEDCDC", size: "auto 165%" },
    own: "Owned", treat: "Consolidated in group", ren: { pipeline: "Services CRM", operations: "Shopify & fulfilment" },
    gate: ["Relaunch checklist", "Target end-Dec 2026", "24 products, 5 collections, hero Gym Growth Content Kit"],
    ext: [it("Shopify products & orders", "Sync status and errors.", "Needs connection", "r/orders"), it("Digital entitlements", "Delivery released on paid order.", "Auto"),
      it("Payment exceptions", "Failed or mismatched payments, recovery drafts.", "Queue"), it("Funnel analytics", "CAC, ROAS, AOV.", "Live"),
      it("Tech-services projects", "Websites, dashboards, automation, dealer/order systems.", "Delivery", "pipeline"), it("Relaunch checklist", "Dated tasks to end-Dec 2026.", "Checklist", "meetings")],
    wf: [{ n: "Shopify paid order → digital fulfilment", trigger: "Order paid", mode: "Auto" }, { n: "Failed payment → recovery draft", trigger: "Payment failed", mode: "Approval" },
      { n: "Service enquiry → CRM & meeting", trigger: "Form", mode: "Auto" }, { n: "Campaign threshold → alert", trigger: "CAC / ROAS", mode: "Auto" }],
    kpis: "ecommerce" },
  brightwire: { side: "#0B4D32", hi: "#E0A91F", acc: "#E0A91F", font: "outfit", logo: { key: "brightwire", bg: "#FCFCFC", size: "auto 125%" },
    own: "Separate company", treat: "International · multi-currency", ren: { operations: "Accounts & compliance" },
    gate: ["Privacy compliance by country", "Needs confirmation", "Consent and opt-out rules differ per country"],
    ext: [it("Country, time zone, language", "Every contact scheduled in their local time.", "CRM", "leads"), it("International outreach", "LinkedIn-first; unsupported steps become human tasks.", "Outreach", "outreach"),
      it("Account research", "AI brief from approved sources.", "AI"), it("Proposals & contracts", "Drafts; legal documents need approval.", "Approval", "pipeline"),
      it("Multi-currency invoicing", "Original currency, FX rate and date, converted value.", "Finance", "finance"), it("Privacy compliance", "Consent log and suppression.", "Gate", "r/suppression")],
    wf: [{ n: "Target account → research brief", trigger: "Added", mode: "Auto" }, { n: "Reply → classify", trigger: "Inbound", mode: "Auto" },
      { n: "Positive reply → meeting", trigger: "Classified", mode: "Auto" }, { n: "Meeting → proposal draft", trigger: "Outcome", mode: "Approval" },
      { n: "Signed contract → project kickoff", trigger: "Signed", mode: "Auto" }],
    kpis: "pipeline",
    empty: { title: "No pipeline assumed. Start here.", msg: "Brightwire starts empty. Set up the basics and the OS builds the LinkedIn-first outreach flow around them.",
      setup: ["Add first target countries and time zones", "Define services and currencies", "Connect email and LinkedIn task queue", "Set privacy and consent rules per country", "Import first 20 target accounts"] } },
  "more-of-us": { side: "#141414", hi: "#EDEAE0", acc: "#E5392B", font: "newsreader", logo: { key: "moreofus", bg: "#FFFFFF", size: "auto 125%" },
    own: "Partner-owned (director)", treat: "Needs confirmation", ren: { operations: "Practices & delivery" },
    gate: ["NDA restriction", "Active", "NDA-tagged records are excluded from AI context. Never name competitors in drafts."],
    ext: [it("Four practices", "Strategy & Operations, Technology, Brand & Growth, Film & Content.", "Routing", "pipeline"), it("Referral sources", "Track who sends work.", "CRM", "leads"),
      it("Partner permissions", "Directors see only what they are granted.", "Roles", "team"), it("Research board", "Account notes and signals.", "Board", "customers"),
      it("Proposals & invoices", "Existing Pipeline OS records migrate carefully.", "Finance", "finance"), it("Delivery capacity", "Load per practice.", "Ops", "meetings"),
      it("NDA restrictions", "Tag blocks AI and exports.", "Gate", "leads")],
    wf: [{ n: "Lead → practice routing", trigger: "New lead", mode: "Auto" }, { n: "Meeting notes → tasks", trigger: "Notes saved", mode: "Auto" },
      { n: "Proposal → follow-up", trigger: "3 days", mode: "Approval" }, { n: "Won deal → delivery setup", trigger: "Stage = Won", mode: "Auto" },
      { n: "NDA tag → restricted AI context", trigger: "Tag added", mode: "Auto" }],
    kpis: "pipeline" },
  "real-estate": { ...G, acc: "#2F5D8A", own: "Proposed · pre-launch", treat: "Not yet consolidated", ren: { operations: "Listings & compliance" },
    gate: ["K-RERA approval", "Ads blocked", "Registration and approved number must be verified before any ad is approved"],
    ext: [it("Listings & mandates", "Residential first, land and commercial later.", "Property", "r/properties"), it("Buyer requirements", "Budget, area, timeline, matching.", "CRM", "leads"),
      it("Brokers", "Network, permissions, commissions.", "Network", "customers"), it("Viewings", "Scheduling and feedback tasks.", "Tasks", "r/site_visits"),
      it("Offers & milestones", "Deal stages with dates.", "Deals", "pipeline"), it("Commission ledger", "Agreements and receivables.", "Finance", "r/commission_agreements"),
      it("K-RERA ad gate", "Hard block on unverified ads.", "Hard gate", "r/ads")],
    wf: [{ n: "Buyer lead → qualification", trigger: "New lead", mode: "Auto" }, { n: "Property match → shortlist", trigger: "Match", mode: "Approval" },
      { n: "Viewing → feedback task", trigger: "Viewing done", mode: "Auto" }, { n: "Milestone → commission forecast", trigger: "Milestone", mode: "Auto" },
      { n: "Missing K-RERA → ad blocked", trigger: "Ad submitted", mode: "Hard gate" }],
    kpis: "pipeline",
    empty: { title: "Pre-launch workspace", msg: "Add the firm name and K-RERA details before any advertising can be approved.",
      setup: ["Enter legal entity name", "Record K-RERA registration and approved number", "Add first listing or mandate", "Add brokers to the network"] } },
  "ashwin-bhai": { ...G, acc: "#5E7A62", own: "Partner channel", treat: "Only commission is income", ren: { pipeline: "Handoffs", operations: "Commission" },
    gate: ["Commission terms", "Needs confirmation", "Terms pending signature. No percentage is assumed."],
    ext: [it("Lead attribution", "Which source sent which lead.", "Tracking", "leads"), it("Partner handoff", "Lead passed with timestamp.", "SLA", "pipeline"),
      it("Status SLA", "Overdue status triggers reminder.", "Auto", "automation"), it("Closed-won confirmation", "Partner confirms close.", "Proof", "pipeline"),
      it("Commission receivable", "Created only after signed basis and confirmed close.", "Finance", "r/commission_agreements")],
    wf: [{ n: "Handoff → SLA", trigger: "Handoff", mode: "Auto" }, { n: "Overdue status → reminder", trigger: "SLA breach", mode: "Auto" }, { n: "Confirmed close → commission checklist", trigger: "Confirmed", mode: "Approval" }],
    kpis: "partner" },
  "accent-spaces": { ...G, acc: "#A0724A", own: "Partner channel", treat: "Only commission is income", ren: { pipeline: "Handoffs", operations: "Commission" },
    gate: ["Commission terms", "Needs confirmation", "Terms pending. No percentage is assumed."],
    ext: [it("Project value & status", "Tracked as reference only.", "Tracking", "pipeline"), it("Partner handoff", "Lead passed with timestamp.", "SLA", "pipeline"),
      it("Agreed commission", "Signed basis required.", "Gate", "r/commission_agreements"), it("Commission receivable", "Created after confirmed close.", "Finance", "r/commission_agreements")],
    wf: [{ n: "Handoff → SLA", trigger: "Handoff", mode: "Auto" }, { n: "Overdue status → reminder", trigger: "SLA breach", mode: "Auto" }, { n: "Confirmed close → commission checklist", trigger: "Confirmed", mode: "Approval" }],
    kpis: "partner" },
  "refresh-money": { ...G, acc: "#2A7F62", own: "Partner channel", treat: "Only commission is income", ren: { pipeline: "Applicants", operations: "Consent & status" },
    gate: ["Consent & data minimisation", "Active", "Store consent and minimal status only. Never collect OTPs or identity documents here."],
    ext: [it("Consent log", "Who consented, when, to what.", "Gate", "leads"), it("Provider handoff", "Provider owns eligibility, documents, disbursal.", "Handoff", "pipeline"),
      it("Minimal status", "Status only; no documents.", "Tracking", "pipeline"), it("Receivable record", "Created on provider disbursal.", "Finance", "r/commission_agreements")],
    wf: [{ n: "Handoff → SLA", trigger: "Handoff", mode: "Auto" }, { n: "Provider disbursal → receivable record", trigger: "Disbursal", mode: "Approval" }],
    kpis: "loans" },
  "la-pinoz": { ...G, acc: "#C0392B", own: "Joint venture (franchise)", treat: "Share per agreement · needs confirmation", ren: { pipeline: "Order board", operations: "Kitchen & stock" },
    gate: ["Franchisor brand rules", "Active", "Menu, pricing and promotions follow franchisor rules. Confirm Petpooja before integration."],
    ext: [it("Unified order board", "Dine-in, takeaway, Zomato, Swiggy, WhatsApp, bulk.", "Live", "r/outlet_sales"), it("Kitchen display", "New, preparing, ready, dispatched.", "KDS"),
      it("Menu & modifiers", "Items, sizes, add-ons.", "Catalogue", "r/products"), it("Stock & recipes", "Usage against recipes; low-stock alerts.", "Inventory", "r/products"),
      it("Procurement & vendor ledger", "Purchase suggestions and payables.", "Finance", "r/suppliers"), it("Wastage", "Logged by reason.", "Ops", "finance"),
      it("Channel settlement", "Platform commissions reconciled.", "Finance", "r/outlet_sales"), it("Daily close & outlet P&L", "Reconcile before close.", "Finance", "r/outlet_sales")],
    wf: [{ n: "POS order → kitchen board", trigger: "New order", mode: "Auto" }, { n: "Stock threshold → purchase suggestion", trigger: "Low stock", mode: "Approval" },
      { n: "Daily close → reconciliation", trigger: "Close", mode: "Auto" }, { n: "Bulk enquiry → callback", trigger: "Enquiry", mode: "Auto" }],
    kpis: "restaurant" },
  "vyra-studio": { ...G, acc: "#A64D79", own: "Family-owned (mother)", treat: "Pre-launch · needs confirmation", ren: { operations: "Catalogue & sourcing" },
    gate: ["Stock reservation", "Active", "Paid order reserves the SKU. Mismatch raises an alert."],
    ext: [it("Saree catalogue", "SKU, fabric, weave, price, photos, stock.", "Catalogue", "r/products"), it("Sourcing batches", "Supplier, cost, arrival.", "Ops", "r/suppliers"),
      it("Stock reservations", "Reserved on payment.", "Auto", "r/orders"), it("Omnichannel orders", "Instagram, WhatsApp, Shopify later, exhibitions.", "Orders", "r/orders"),
      it("Styling preferences", "Per-customer notes.", "CRM", "customers"), it("Shipping & returns", "Tracking and return policy.", "Ops", "r/orders"),
      it("Exhibitions & content calendar", "Pop-ups, posts, broadcasts.", "Marketing", "marketing")],
    wf: [{ n: "Enquiry → lead", trigger: "Message", mode: "Auto" }, { n: "Payment → reserve SKU", trigger: "Paid", mode: "Auto" }, { n: "Shipment → tracking", trigger: "Dispatched", mode: "Auto" },
      { n: "Stock mismatch → alert", trigger: "Mismatch", mode: "Auto" }, { n: "Collection launch → broadcast draft", trigger: "Launch", mode: "Approval" }],
    kpis: "pipeline",
    empty: { title: "Pre-launch saree studio", msg: "Product mix, pricing, sourcing and policies are all configurable. Nothing is assumed.",
      setup: ["Add first SKUs with fabric, weave, price, photos", "Create a sourcing batch", "Connect Instagram and WhatsApp enquiries", "Set shipping and return policy"] } },
};

const FALLBACK: CompanyDesign = { ...G, acc: "#829487", own: "Not configured", treat: "Setup needed", ren: {},
  gate: ["Setup needed", "Not started", "Configure ownership and modules first"], ext: [], wf: BASEWF, kpis: "pipeline",
  empty: { title: "Empty workspace", msg: "Nothing is invented for this business. Set it up below.", setup: ["Set ownership and consolidation treatment", "Choose modules to enable", "Invite first team member"] } };

/** Design settings for a company slug (demo workspaces use the "demo-" prefix of their template). */
export function designFor(slug: string): CompanyDesign {
  return COMPANY_DESIGN[slug.replace(/^demo-/, "")] ?? FALLBACK;
}

export const FONT_VAR: Record<FontKey, string> = {
  newsreader: "var(--font-newsreader), Georgia, serif",
  caprasimo: "var(--font-caprasimo), Georgia, serif",
  outfit: "var(--font-outfit), system-ui, sans-serif",
  baloo: "'Baloo 2', system-ui, sans-serif",
};

/** Workflows shown in a company's Automation library, keyed so each maps to one definition row. */
export function workflowKey(name: string) {
  return "wf_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
}
