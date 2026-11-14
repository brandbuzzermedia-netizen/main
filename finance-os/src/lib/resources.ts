import type { Permission } from "@/lib/workspace";

/**
 * Config-driven record screens. Each resource names a table, the permission to see it, the
 * permission to add to it, its columns and its create form. Server code is the only consumer:
 * the table name and columns are never taken from the request, and organization_id is always
 * set from the resolved company, so a forged form cannot write elsewhere. RLS checks again.
 */

export type FieldType = "text" | "textarea" | "number" | "money" | "date" | "datetime" | "select" | "checkbox" | "email" | "phone" | "ref";
export type Field = {
  name: string; label: string; type: FieldType; required?: boolean; hint?: string;
  options?: [string, string][]; ref?: { table: string; label: string; filter?: Record<string, string> };
  max?: number; default?: string;
};
export type Column = { key: string; label: string; format?: "money" | "date" | "datetime" | "bool" | "status"; ref?: { table: string; label: string } };
export type Resource = {
  key: string; table: string; title: string; description: string;
  read: Permission;
  write: Permission;
  columns: Column[]; fields: Field[]; order: { column: string; ascending: boolean }; search: string[];
  /** Columns set on insert from the session, never from the form. */
  owner?: "owner_id" | "created_by";
};

const opt = (...xs: string[]): [string, string][] => xs.map((x) => [x, x.replace(/_/g, " ")]);

export const RESOURCES: Record<string, Resource> = {
  contacts: {
    key: "contacts", table: "contacts", title: "Leads & contacts", description: "People and companies. Duplicates by email or phone are rejected. Outreach needs a lawful basis.",
    read: "crm.read_assigned", write: "crm.write", owner: "owner_id",
    order: { column: "created_at", ascending: false }, search: ["full_name", "company_name", "email"],
    columns: [{ key: "full_name", label: "Name" }, { key: "company_name", label: "Company" }, { key: "email", label: "Email" }, { key: "lead_status", label: "Status", format: "status" },
      { key: "consent_basis", label: "Lawful basis", format: "status" }, { key: "do_not_contact", label: "Do not contact", format: "bool" }, { key: "source", label: "Source" }],
    fields: [
      { name: "full_name", label: "Name", type: "text", required: true, max: 200 }, { name: "company_name", label: "Company", type: "text", max: 200 },
      { name: "email", label: "Email", type: "email" }, { name: "phone_e164", label: "Phone", type: "phone", hint: "With country code, e.g. +919800000000" },
      { name: "country", label: "Country (ISO, e.g. IN)", type: "text", max: 2 }, { name: "timezone", label: "Time zone", type: "text", hint: "e.g. Asia/Kolkata" },
      { name: "source", label: "Source", type: "text", max: 80 },
      { name: "lead_status", label: "Status", type: "select", options: opt("new", "contacted", "qualified", "disqualified", "customer"), default: "new" },
      { name: "consent_basis", label: "Lawful basis for outreach", type: "select", options: opt("none", "consent", "contract", "legitimate_interest"), default: "none" },
      { name: "consent_note", label: "Consent evidence", type: "text", hint: "Where and how consent was given" },
      { name: "nda_restricted", label: "NDA-restricted (excluded from AI)", type: "checkbox" },
    ],
  },
  suppression: {
    key: "suppression", table: "suppression_records", title: "Suppression list", description: "Addresses that must never be contacted. Unsubscribes and bounces are added automatically.",
    read: "crm.write", write: "crm.write", owner: "created_by", order: { column: "created_at", ascending: false }, search: ["value_normalized"],
    columns: [{ key: "channel", label: "Channel" }, { key: "value_normalized", label: "Address" }, { key: "reason", label: "Reason", format: "status" }, { key: "created_at", label: "Added", format: "datetime" }],
    fields: [{ name: "channel", label: "Channel", type: "select", options: opt("email", "phone", "whatsapp", "linkedin", "all"), required: true },
      { name: "value_normalized", label: "Email or phone (+91…)", type: "text", required: true }, { name: "reason", label: "Reason", type: "select", options: opt("requested", "unsubscribed", "bounced", "complaint", "legal", "other"), required: true }],
  },
  sequences: {
    key: "sequences", table: "outreach_sequences", title: "Outreach sequences", description: "Sequences are records here; sending runs through approved providers via automation (phase 8) and every bulk send needs approval.",
    read: "crm.write", write: "crm.manage", owner: "created_by", order: { column: "created_at", ascending: false }, search: ["name"],
    columns: [{ key: "name", label: "Sequence" }, { key: "status", label: "Status", format: "status" }, { key: "requires_approval", label: "Needs approval", format: "bool" }, { key: "stop_on_reply", label: "Stops on reply", format: "bool" }],
    fields: [{ name: "name", label: "Name", type: "text", required: true }, { name: "status", label: "Status", type: "select", options: opt("draft", "active", "paused"), default: "draft" },
      { name: "stop_on_reply", label: "Stop when the contact replies", type: "checkbox", default: "on" }, { name: "requires_approval", label: "Require approval before sending", type: "checkbox", default: "on" }],
  },
  legal_entities: {
    key: "legal_entities", table: "legal_entities", title: "Legal entities", description: "Who legally owns the books. Every ledger row and rental unit belongs to one.",
    read: "finance.read", write: "finance.approve", order: { column: "created_at", ascending: true }, search: ["name"],
    columns: [{ key: "name", label: "Entity" }, { key: "kind", label: "Kind", format: "status" }, { key: "gstin", label: "GSTIN" }, { key: "pan_masked", label: "PAN (masked)" }, { key: "is_default", label: "Default", format: "bool" }],
    fields: [{ name: "name", label: "Legal name", type: "text", required: true }, { name: "kind", label: "Kind", type: "select", required: true, options: opt("private_limited", "llp", "partnership", "proprietorship", "individual", "huf", "trust", "foreign_company", "other") },
      { name: "gstin", label: "GSTIN", type: "text", max: 15 }, { name: "pan_masked", label: "PAN, masked (ABCDE1234F → ABCDEXXXXF)", type: "text", max: 10, hint: "Store the full PAN only in your accountant's records." }],
  },
  rental_units: {
    key: "rental_units", table: "rental_units", title: "Rental units", description: "Salon, Tower and any future unit. Nothing is assumed from the label.",
    read: "rental.read", write: "rental.write", order: { column: "label", ascending: true }, search: ["label", "address"],
    columns: [{ key: "label", label: "Unit" }, { key: "legal_entity_id", label: "Legal owner", ref: { table: "legal_entities", label: "name" } }, { key: "use_type", label: "Use", format: "status" }, { key: "address", label: "Address" }],
    fields: [{ name: "label", label: "Label", type: "text", required: true }, { name: "legal_entity_id", label: "Legal owner", type: "ref", required: true, ref: { table: "legal_entities", label: "name" } },
      { name: "use_type", label: "Use", type: "select", options: opt("residential", "commercial", "retail", "office", "industrial", "land", "other") }, { name: "address", label: "Address", type: "textarea" }, { name: "co_owners", label: "Co-owners", type: "text" }],
  },
  tenants: {
    key: "tenants", table: "tenants", title: "Tenants", description: "Tenant details are visible only to finance and rental roles.",
    read: "rental.read", write: "rental.write", order: { column: "name", ascending: true }, search: ["name"],
    columns: [{ key: "name", label: "Tenant" }, { key: "contact_name", label: "Contact" }, { key: "phone_e164", label: "Phone" }, { key: "email", label: "Email" }],
    fields: [{ name: "name", label: "Tenant", type: "text", required: true }, { name: "contact_name", label: "Contact person", type: "text" }, { name: "phone_e164", label: "Phone", type: "phone" }, { name: "email", label: "Email", type: "email" }],
  },
  leases: {
    key: "leases", table: "leases", title: "Leases", description: "One active lease per unit. Rent charges are generated from leases.",
    read: "rental.read", write: "rental.write", order: { column: "start_date", ascending: false }, search: [],
    columns: [{ key: "unit_id", label: "Unit", ref: { table: "rental_units", label: "label" } }, { key: "tenant_id", label: "Tenant", ref: { table: "tenants", label: "name" } }, { key: "rent_minor", label: "Rent", format: "money" },
      { key: "frequency", label: "Every" }, { key: "due_day", label: "Due day" }, { key: "deposit_minor", label: "Deposit", format: "money" }, { key: "start_date", label: "Start", format: "date" }, { key: "end_date", label: "End", format: "date" }, { key: "status", label: "Status", format: "status" }],
    fields: [{ name: "unit_id", label: "Unit", type: "ref", required: true, ref: { table: "rental_units", label: "label" } }, { name: "tenant_id", label: "Tenant", type: "ref", required: true, ref: { table: "tenants", label: "name" } },
      { name: "start_date", label: "Start", type: "date", required: true }, { name: "end_date", label: "End", type: "date" }, { name: "rent_minor", label: "Rent", type: "money", required: true },
      { name: "frequency", label: "Frequency", type: "select", options: opt("monthly", "quarterly", "yearly"), default: "monthly" }, { name: "due_day", label: "Due day (1-28)", type: "number", default: "5" },
      { name: "escalation_pct", label: "Escalation %", type: "number" }, { name: "escalation_every_months", label: "Escalate every (months)", type: "number" },
      { name: "lock_in_months", label: "Lock-in (months)", type: "number" }, { name: "notice_days", label: "Notice (days)", type: "number" },
      { name: "deposit_minor", label: "Security deposit", type: "money" }, { name: "deposit_terms", label: "Deposit refund terms", type: "textarea" }],
  },
  suppliers: {
    key: "suppliers", table: "suppliers", title: "Suppliers", description: "Suppliers, white-label partners, weavers and vendors.",
    read: "operations.read", write: "operations.write", order: { column: "name", ascending: true }, search: ["name"],
    columns: [{ key: "name", label: "Supplier" }, { key: "kind", label: "Kind", format: "status" }, { key: "contact_name", label: "Contact" }, { key: "gstin", label: "GSTIN" }],
    fields: [{ name: "name", label: "Name", type: "text", required: true }, { name: "kind", label: "Kind", type: "select", options: opt("supplier", "white_label", "weaver", "vendor", "franchisor"), default: "supplier" },
      { name: "contact_name", label: "Contact", type: "text" }, { name: "phone_e164", label: "Phone", type: "phone" }, { name: "gstin", label: "GSTIN", type: "text", max: 15 }, { name: "notes", label: "Notes", type: "textarea" }],
  },
  products: {
    key: "products", table: "products", title: "Products & SKUs", description: "Toys that need BIS cannot be listed until an authorised person verifies current evidence.",
    read: "operations.read", write: "operations.write", order: { column: "sku", ascending: true }, search: ["sku", "name"],
    columns: [{ key: "sku", label: "SKU" }, { key: "name", label: "Product" }, { key: "price_minor", label: "Price", format: "money" }, { key: "fulfilment", label: "Fulfilment", format: "status" }, { key: "stock_qty", label: "Stock" },
      { key: "requires_bis", label: "Needs BIS", format: "bool" }, { key: "bis_status", label: "BIS", format: "status" }, { key: "listed", label: "Listed", format: "bool" }],
    fields: [{ name: "sku", label: "SKU", type: "text", required: true }, { name: "name", label: "Name", type: "text", required: true }, { name: "variant", label: "Variant", type: "text" },
      { name: "price_minor", label: "Price (MRP)", type: "money" }, { name: "dealer_price_minor", label: "Dealer price", type: "money" }, { name: "cost_minor", label: "Cost", type: "money" },
      { name: "fulfilment", label: "Fulfilment", type: "select", options: opt("stock_held", "supplier_direct", "digital"), default: "stock_held" }, { name: "stock_qty", label: "Stock on hand", type: "number" },
      { name: "supplier_id", label: "Supplier", type: "ref", ref: { table: "suppliers", label: "name" } }, { name: "requires_bis", label: "Needs BIS certification (toys)", type: "checkbox" }],
  },
  orders: {
    key: "orders", table: "orders", title: "Orders & quotes", description: "B2B orders cannot reach a supplier PO until the advance (default 50%) is recorded.",
    read: "operations.read", write: "operations.write", owner: "created_by", order: { column: "created_at", ascending: false }, search: ["order_number", "customer_name"],
    columns: [{ key: "order_number", label: "Order" }, { key: "customer_name", label: "Customer" }, { key: "kind", label: "Kind" }, { key: "channel", label: "Channel" }, { key: "status", label: "Status", format: "status" },
      { key: "total_minor", label: "Total", format: "money" }, { key: "advance_received_minor", label: "Advance in", format: "money" }],
    fields: [{ name: "order_number", label: "Order / quote no.", type: "text", required: true }, { name: "customer_name", label: "Customer", type: "text" },
      { name: "kind", label: "Kind", type: "select", options: opt("b2b", "b2c"), default: "b2c" }, { name: "channel", label: "Channel", type: "select", required: true, options: opt("direct", "whatsapp", "instagram", "shopify", "dealer", "exhibition", "website", "other") },
      { name: "status", label: "Status", type: "select", options: opt("enquiry", "quoted", "accepted", "advance_received", "supplier_po", "packed", "dispatched", "delivered", "cancelled", "returned"), default: "enquiry" },
      { name: "total_minor", label: "Total", type: "money" }, { name: "advance_required_pct", label: "Advance required %", type: "number", default: "50" }, { name: "advance_received_minor", label: "Advance received", type: "money" },
      { name: "tracking_reference", label: "Tracking", type: "text" }],
  },
  properties: {
    key: "properties", table: "properties", title: "Properties & listings", description: "Ads for a property need a verified K-RERA registration.",
    read: "operations.read", write: "operations.write", order: { column: "created_at", ascending: false }, search: ["title", "location"],
    columns: [{ key: "title", label: "Property" }, { key: "kind", label: "Type", format: "status" }, { key: "location", label: "Location" }, { key: "price_minor", label: "Price", format: "money" }, { key: "status", label: "Status", format: "status" },
      { key: "rera_registration", label: "K-RERA no." }, { key: "rera_verified", label: "Verified", format: "bool" }],
    fields: [{ name: "title", label: "Title", type: "text", required: true }, { name: "kind", label: "Type", type: "select", options: opt("residential", "land", "commercial"), default: "residential" },
      { name: "listing_side", label: "Listing", type: "select", options: opt("sale", "rent", "mandate"), default: "sale" }, { name: "location", label: "Location", type: "text" }, { name: "price_minor", label: "Asking price", type: "money" },
      { name: "broker_name", label: "Broker", type: "text" }, { name: "rera_registration", label: "K-RERA registration (verified separately)", type: "text" }],
  },
  ads: {
    key: "ads", table: "ad_approvals", title: "Ad approvals", description: "Regulated ads (property, toys) need the compliance check before approval.",
    read: "operations.read", write: "operations.write", owner: "created_by", order: { column: "created_at", ascending: false }, search: ["headline"],
    columns: [{ key: "headline", label: "Ad" }, { key: "channel", label: "Channel" }, { key: "status", label: "Status", format: "status" }, { key: "property_id", label: "Property", ref: { table: "properties", label: "title" } }, { key: "product_id", label: "Product", ref: { table: "products", label: "name" } }],
    fields: [{ name: "headline", label: "Headline", type: "text", required: true }, { name: "body", label: "Copy", type: "textarea" }, { name: "channel", label: "Channel", type: "select", required: true, options: opt("meta", "google", "instagram", "whatsapp", "print", "other") },
      { name: "property_id", label: "Property", type: "ref", ref: { table: "properties", label: "title" } }, { name: "product_id", label: "Product", type: "ref", ref: { table: "products", label: "name" } }],
  },
  site_visits: {
    key: "site_visits", table: "site_visits", title: "Site visits", description: "Viewings and feedback.",
    read: "operations.read", write: "operations.write", owner: "created_by", order: { column: "visit_at", ascending: false }, search: ["feedback"],
    columns: [{ key: "visit_at", label: "When", format: "datetime" }, { key: "property_id", label: "Property", ref: { table: "properties", label: "title" } }, { key: "contact_id", label: "Buyer", ref: { table: "contacts", label: "full_name" } }, { key: "feedback", label: "Feedback" }],
    fields: [{ name: "property_id", label: "Property", type: "ref", required: true, ref: { table: "properties", label: "title" } }, { name: "contact_id", label: "Buyer", type: "ref", ref: { table: "contacts", label: "full_name" } },
      { name: "visit_at", label: "When (IST)", type: "datetime", required: true }, { name: "feedback", label: "Feedback", type: "textarea" }],
  },
  outlet_sales: {
    key: "outlet_sales", table: "outlet_daily_sales", title: "Outlet daily sales", description: "Entered manually until a POS integration is confirmed. Platform commissions are recorded separately from gross sales.",
    read: "operations.read", write: "operations.write", owner: "created_by", order: { column: "sale_date", ascending: false }, search: ["outlet"],
    columns: [{ key: "sale_date", label: "Date", format: "date" }, { key: "outlet", label: "Outlet" }, { key: "channel", label: "Channel", format: "status" }, { key: "orders_count", label: "Orders" }, { key: "gross_minor", label: "Gross", format: "money" }, { key: "platform_commission_minor", label: "Platform commission", format: "money" }, { key: "source", label: "Source" }],
    fields: [{ name: "sale_date", label: "Date", type: "date", required: true }, { name: "outlet", label: "Outlet", type: "text", default: "Main outlet" },
      { name: "channel", label: "Channel", type: "select", required: true, options: opt("dine_in", "takeaway", "zomato", "swiggy", "whatsapp", "bulk", "other") }, { name: "orders_count", label: "Orders", type: "number" },
      { name: "gross_minor", label: "Gross sales", type: "money" }, { name: "platform_commission_minor", label: "Platform commission", type: "money" }],
  },
  commission_agreements: {
    key: "commission_agreements", table: "commission_agreements", title: "Commission agreements", description: "No percentage is assumed. Commission income is recorded only under a signed agreement with the document on file.",
    read: "finance.sensitive", write: "finance.approve", order: { column: "created_at", ascending: false }, search: ["partner_name"],
    columns: [{ key: "partner_name", label: "Partner" }, { key: "basis", label: "Basis", format: "status" }, { key: "rate_pct", label: "Rate %" }, { key: "fixed_minor", label: "Fixed", format: "money" }, { key: "status", label: "Status", format: "status" }, { key: "signed_on", label: "Signed", format: "date" }],
    fields: [{ name: "partner_name", label: "Partner", type: "text", required: true }, { name: "basis", label: "Basis", type: "select", options: opt("unconfirmed", "percent_of_deal", "fixed_per_deal", "per_disbursal_percent"), default: "unconfirmed" },
      { name: "rate_pct", label: "Rate %", type: "number" }, { name: "fixed_minor", label: "Fixed amount", type: "money" }, { name: "notes", label: "Notes", type: "textarea" }],
  },
};

/** Which resources each module shows, by business model. */
export function operationsResources(model: string): string[] {
  switch (model) {
    case "product_b2b": return ["products", "suppliers", "orders", "ads"];
    case "retail": return ["products", "suppliers", "orders", "ads"];
    case "ecommerce_services": return ["products", "orders"];
    case "real_estate": return ["properties", "site_visits", "ads", "commission_agreements"];
    case "partner_channel": return ["commission_agreements"];
    case "restaurant": return ["outlet_sales", "suppliers"];
    default: return ["suppliers", "orders"];
  }
}

/** crm.read_assigned resources are also visible to anyone who reads all CRM records. */
export function canReadResource(r: Resource, can: (p: Permission) => boolean): boolean {
  return can(r.read) || (r.read === "crm.read_assigned" && can("crm.read_all"));
}
