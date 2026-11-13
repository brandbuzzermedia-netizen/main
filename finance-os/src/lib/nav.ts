import { moduleInfo, type ModuleKey } from "@/domain/registry";

export type NavItem = { key: string; label: string; icon: string; href?: string; disabledReason?: string; badge?: string };

/** Minimal shape so this stays pure and unit-testable. */
type CompanyLike = { slug: string; enabled_modules: ModuleKey[] };

/**
 * Company navigation for one viewer. Modules the viewer has no permission for are left out
 * entirely (so an employee's menu is genuinely different from the owner's). Modules not yet
 * built are shown disabled with the phase they arrive in, never as dead links.
 */
export function companyNav(company: CompanyLike, can: (p: string) => boolean): NavItem[] {
  const base = `/c/${company.slug}`;
  const crm = can("crm.read_all") || can("crm.read_assigned") || can("crm.read_shared");
  const built: Partial<Record<ModuleKey, { href: string; allowed: boolean }>> = {
    home: { href: base, allowed: true },
    pipeline: { href: `${base}/pipeline`, allowed: crm },
    meetings: { href: `${base}/meetings`, allowed: can("crm.read_all") || can("crm.read_assigned") },
    tasks: { href: `${base}/tasks`, allowed: can("tasks.write") || can("tasks.read_all") },
    finance: { href: `/switch?to=${encodeURIComponent(company.slug)}&next=/finance`, allowed: can("finance.read") },
    team: { href: `${base}/team`, allowed: can("members.manage") || can("dashboard.owner") },
    settings: { href: `${base}/settings`, allowed: can("company.settings") },
  };
  // Unbuilt modules are only advertised to people who would manage them.
  const showPlanned = can("dashboard.owner");
  const items: NavItem[] = [];
  for (const key of company.enabled_modules) {
    const info = moduleInfo(key);
    const b = built[key];
    if (b) {
      if (b.allowed) items.push({ key, label: info.label, icon: info.icon, href: b.href });
    } else if (showPlanned) {
      items.push({ key, label: info.label, icon: info.icon, disabledReason: `Arrives in build phase ${info.phase}` });
    }
  }
  return items;
}

export function groupNav(isGroupOwner: boolean): NavItem[] {
  return [
    { key: "home", label: "Command Centre", icon: "◧", href: "/group" },
    { key: "companies", label: "Businesses", icon: "▦", href: "/group/companies" },
    { key: "pipeline", label: "Group pipeline", icon: "▥", disabledReason: "Arrives in build phase 3" },
    { key: "calendar", label: "Calendar", icon: "◷", disabledReason: "Arrives in build phase 3" },
    { key: "finance", label: "Group finance", icon: "₹", disabledReason: "Arrives in build phase 4" },
    { key: "rental", label: "Rental income", icon: "⌂", disabledReason: "Arrives in build phase 5" },
    { key: "vault", label: "Document vault", icon: "▣", disabledReason: "Arrives in build phase 6" },
    { key: "tax", label: "Tax & GST", icon: "§", disabledReason: "Arrives in build phase 7" },
    { key: "automation", label: "Automation", icon: "⚡", disabledReason: "Arrives in build phase 8" },
    ...(isGroupOwner ? [{ key: "people", label: "People & access", icon: "☷", href: "/group/people" }] : []),
  ];
}

/** Only same-site relative paths may be used as redirect targets. */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next)) return fallback;
  return next;
}
