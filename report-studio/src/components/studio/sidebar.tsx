"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Icons are the prototype's own strokes, kept for visual parity.
const ICONS: Record<string, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>,
  clients: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14c2.5 0 4 1.5 4.5 5" /></>,
  reports: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  create: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  templates: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 9h18M9 9v11" /></>,
  brand: <><circle cx="12" cy="12" r="9" /><circle cx="8.5" cy="10" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="15.5" cy="10" r="1" /><path d="M12 21c-1.5 0-2-1-1.5-2s2-1.5 2-3-1-2-3-2" /></>,
  analytics: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
};

const NAV: [string, string, string][] = [
  ["/", "dashboard", "Dashboard"],
  ["/clients", "clients", "Clients"],
  ["/reports", "reports", "Reports"],
  ["/create", "create", "Create report"],
  ["/templates", "templates", "Templates"],
  ["/brand", "brand", "Brand assets"],
  ["/analytics", "analytics", "Analytics"],
  ["/settings", "settings", "Settings"],
];

export function SidebarNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1.5 max-[860px]:flex-row max-[860px]:flex-wrap max-[860px]:gap-0.5" aria-label="Studio">
      {NAV.map(([href, icon, label]) => {
        const on = href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex items-center gap-[11px] rounded-full px-2.5 py-[9px] font-medium text-sidebar-muted hover:bg-gbs-cream/12 hover:text-sidebar-foreground max-[860px]:px-[9px] max-[860px]:py-[7px]",
              on && "bg-gbs-cream/18 text-white after:ml-auto after:size-[9px] after:rounded-full after:bg-gbs-gold after:content-[''] max-[860px]:after:hidden",
            )}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] flex-none fill-none stroke-current" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              {ICONS[icon]}
            </svg>
            <span className="max-[860px]:sr-only">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
