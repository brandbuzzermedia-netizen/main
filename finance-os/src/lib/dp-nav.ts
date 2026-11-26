import { designFor, GROUP_DESIGN } from "@/domain/design";
import { moduleInfo, type ModuleKey } from "@/domain/registry";
import type { DpNavItem } from "@/components/dp/sidebar";
import { receivablesOn } from "@/lib/phases";

type CompanyLike = { slug: string; enabled_modules: ModuleKey[] };
/** Sidebar sections, in the More of Us OS layout. */
const SECTION: Partial<Record<ModuleKey, string>> = {
  home: "Overview", leads: "Sales", outreach: "Sales", pipeline: "Sales", meetings: "Sales", customers: "Sales",
  operations: "Operations", marketing: "Operations", automation: "Operations",
  finance: "Finance", rental: "Finance", expenses: "Finance", tax: "Finance",
  team: "People & insight", reports: "People & insight", vault: "System", settings: "System",
};
const GROUP_SECTION: Partial<Record<ModuleKey, string>> = { ...SECTION, automation: "System" };
const COMPANY_ORDER: ModuleKey[] = ["home", "outreach", "leads", "pipeline", "meetings", "customers", "operations", "marketing", "automation", "finance", "team", "reports", "vault", "settings"];
const GROUP_ORDER: ModuleKey[] = ["home", "pipeline", "outreach", "meetings", "finance", "rental", "expenses", "tax", "team", "reports", "automation", "vault", "settings"];

/**
 * Company menu in the design's order with the company's own names (e.g. Tan O' Fun "Quotes & orders").
 * Items the viewer has no permission for are left out; the database enforces the same rules.
 */
export function dpCompanyNav(c: CompanyLike, can: (p: string) => boolean, opts: { role?: string; approvals?: number } = {}): DpNavItem[] {
  const d = designFor(c.slug);
  const base = `/c/${c.slug}`;
  const allowed: Partial<Record<ModuleKey, boolean>> = {
    home: true,
    leads: can("crm.read_all") || can("crm.read_assigned"),
    pipeline: can("crm.read_all") || can("crm.read_assigned") || can("crm.read_shared"),
    outreach: can("crm.write"),
    meetings: can("crm.read_all") || can("crm.read_assigned") || can("tasks.write"),
    customers: can("crm.read_all") || can("crm.read_assigned"),
    operations: d.ext.length > 0 && (can("operations.read") || can("dashboard.owner")),
    automation: can("automation.manage") || can("automation.approve"),
    marketing: can("operations.read") || can("crm.read_all"),
    finance: can("finance.read") || can("documents.write") || can("rental.read") || opts.role === "accountant",
    team: can("members.manage") || can("dashboard.owner"),
    reports: can("finance.read") || can("crm.read_all"),
    vault: can("documents.read") || can("documents.write"),
    settings: can("company.settings") || can("company.emergency_stop"),
  };
  const items: DpNavItem[] = COMPANY_ORDER.filter((k) => c.enabled_modules.includes(k) || k === "home" || k === "settings")
    .filter((k) => allowed[k])
    .map((k) => ({
      key: k, label: k === "home" ? "Dashboard" : k === "team" ? "Team & targets" : d.ren[k] ?? moduleInfo(k).label, icon: moduleInfo(k).icon, section: SECTION[k],
      href: k === "home" ? base : `${base}/${k}`,
      badge: k === "automation" && opts.approvals ? String(opts.approvals) : undefined,
    }));
  // More of Us OS boards and documents, for every company.
  const after = (key: string, extra: DpNavItem[]) => {
    const i = items.findIndex((x) => x.key === key);
    items.splice(i >= 0 ? i + 1 : items.length, 0, ...extra);
  };
  const sales = c.enabled_modules.includes("pipeline");
  if (sales && can("crm.write")) after(items.some((x) => x.key === "meetings") ? "meetings" : "pipeline", [{ key: "research", label: "Research board", icon: "◫", section: "Sales", href: `${base}/research` }]);
  // Field sales: plan, navigate and log in-person visits (every company with sales).
  if (sales && can("crm.write")) after(items.some((x) => x.key === "outreach") ? "outreach" : "pipeline", [{ key: "field", label: "Field sales", icon: "◎", section: "Sales", href: `${base}/field` }]);
  if (sales && (can("tasks.write") || can("tasks.read_all"))) after(items.some((x) => x.key === "research") ? "research" : "pipeline", [{ key: "followups", label: "Follow-ups", icon: "✓", section: "Sales", href: `${base}/followups` }]);
  const money: DpNavItem[] = [];
  if (sales && (can("crm.write") || can("crm.read_all"))) money.push({ key: "proposals", label: "Proposals", icon: "▤", section: can("finance.read") ? "Finance" : "Sales", href: `${base}/proposals` });
  if (can("finance.read") && receivablesOn()) money.push({ key: "invoices", label: "Invoices", icon: "▭", section: "Finance", href: `${base}/receivables/invoices` });
  if (money.length) {
    const fi = items.findIndex((x) => x.key === "finance");
    const later = items.findIndex((x) => x.section === "People & insight" || x.section === "System");
    items.splice(fi >= 0 ? fi : later >= 0 ? later : items.length, 0, ...money);
  }
  return items;
}

export function dpGroupNav(disabled: string[], isOwner: boolean, approvals: number): DpNavItem[] {
  const href: Partial<Record<ModuleKey, string>> = { home: "/group", pipeline: "/group/pipeline", outreach: "/group/outreach", meetings: "/group/calendar", automation: "/group/automation", finance: "/group/finance",
    rental: "/group/rental", expenses: "/group/expenses", tax: "/group/tax", team: "/group/people", reports: "/group/reports", vault: "/group/vault", settings: "/group/settings" };
  return GROUP_ORDER.filter((k) => k === "home" || k === "settings" || !disabled.includes(k))
    .filter((k) => k !== "settings" || isOwner)
    .map((k) => ({ key: k, label: k === "home" ? "Command Centre" : GROUP_DESIGN.ren[k] ?? moduleInfo(k).label, icon: moduleInfo(k).icon, section: GROUP_SECTION[k], href: href[k]!, badge: k === "automation" && approvals ? String(approvals) : undefined } as DpNavItem))
    .concat(isOwner ? [{ key: "admin", label: "Admin console", icon: "⛨", section: "System", href: "/group/admin" }] : []);
}
