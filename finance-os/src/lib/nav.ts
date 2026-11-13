import { moduleInfo, type ModuleKey } from "@/domain/registry";

export type NavItem = { key: string; label: string; icon: string; href?: string; disabledReason?: string; badge?: string };

/** Minimal shape so this stays pure and unit-testable. */
type CompanyLike = { slug: string; enabled_modules: ModuleKey[] };

/**
 * Company navigation for one viewer. Modules the viewer has no permission for are left out
 * entirely, so an employee's menu is genuinely different from the owner's. The database checks
 * the same permissions again on every read and write.
 */
export function companyNav(company: CompanyLike, can: (p: string) => boolean, role?: string): NavItem[] {
  const base = `/c/${company.slug}`;
  const crm = can("crm.read_all") || can("crm.read_assigned") || can("crm.read_shared");
  const built: Record<ModuleKey, { href: string; allowed: boolean; label?: string }> = {
    home: { href: base, allowed: true },
    leads: { href: `${base}/r/contacts`, allowed: can("crm.read_all") || can("crm.read_assigned") },
    pipeline: { href: `${base}/pipeline`, allowed: crm },
    outreach: { href: `${base}/outreach`, allowed: can("crm.write") },
    meetings: { href: `${base}/meetings`, allowed: can("crm.read_all") || can("crm.read_assigned") },
    tasks: { href: `${base}/tasks`, allowed: can("tasks.write") || can("tasks.read_all") },
    customers: { href: `${base}/r/contacts?sort=lead_status`, allowed: can("crm.read_all") },
    operations: { href: `${base}/operations`, allowed: can("operations.read") },
    automation: { href: `${base}/automation`, allowed: can("automation.manage") || can("automation.approve") },
    marketing: { href: `${base}/r/ads`, allowed: can("operations.read") },
    finance: { href: `${base}/ledger`, allowed: can("finance.read") },
    rental: { href: `${base}/rental`, allowed: can("rental.read") },
    expenses: { href: `${base}/bills`, allowed: can("documents.write") || can("documents.read") },
    tax: { href: `${base}/tax`, allowed: can("finance.read") || role === "accountant" },
    team: { href: `${base}/team`, allowed: can("members.manage") || can("dashboard.owner") },
    reports: { href: `${base}/ledger?period=fy`, allowed: can("finance.read") },
    vault: { href: `${base}/vault`, allowed: can("documents.read") || can("documents.write") },
    settings: { href: `${base}/settings`, allowed: can("company.settings") || can("company.emergency_stop") },
  };
  const items: NavItem[] = [];
  for (const key of company.enabled_modules) {
    const b = built[key];
    if (!b?.allowed) continue;
    const info = moduleInfo(key);
    items.push({ key, label: info.label, icon: info.icon, href: b.href });
    if (key === "finance") items.push({ key: "receivables", label: "Receivables", icon: "⇲", href: `/switch?to=${encodeURIComponent(company.slug)}&next=/finance` });
    if (key === "outreach") items.push({ key: "assistant", label: "Assistant", icon: "✎", href: `${base}/assistant` });
  }
  return items;
}

export function groupNav(isGroupOwner: boolean): NavItem[] {
  return [
    { key: "home", label: "Command Centre", icon: "◧", href: "/group" },
    { key: "companies", label: "Businesses", icon: "▦", href: "/group/companies" },
    { key: "pipeline", label: "Group pipeline", icon: "▥", href: "/group/pipeline" },
    { key: "calendar", label: "Calendar", icon: "◷", href: "/group/calendar" },
    { key: "finance", label: "Group finance", icon: "₹", href: "/group/finance" },
    { key: "rental", label: "Rental income", icon: "⌂", href: "/group/rental" },
    { key: "tax", label: "Tax & filings", icon: "§", href: "/group/tax" },
    { key: "automation", label: "Automation", icon: "⚡", href: "/group/automation" },
    ...(isGroupOwner ? [{ key: "people", label: "People & access", icon: "☷", href: "/group/people" }] : []),
  ];
}

/** Only same-site relative paths may be used as redirect targets. */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next)) return fallback;
  return next;
}
