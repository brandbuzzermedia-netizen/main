"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { NavItem } from "@/lib/nav";
import { cx } from "@/components/ui";

export type BrandTile =
  | { kind: "logo"; src: string; bg: string; alt: string }
  | { kind: "text"; name: string; subtitle?: string };

const COLLAPSE_KEY = "dp_sidebar_collapsed";

export function Sidebar({ brand, items, footer, homeHref }: { brand: BrandTile; items: NavItem[]; footer?: ReactNode; homeHref: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a per-viewer preference after hydration
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable: keep the default */
    }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch { /* ignore */ }
      return !c;
    });
  };

  const isActive = (href: string) => {
    const path = href.split("?")[0];
    if (path === homeHref) return pathname === path;
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <>
      <div className="flex items-center justify-between bg-co-side px-4 py-3 text-[#E9E4D6] lg:hidden">
        <Link href={homeHref} className="font-display text-lg">{brand.kind === "text" ? brand.name : brand.alt}</Link>
        <button type="button" onClick={() => setMobileOpen((o) => !o)} aria-expanded={mobileOpen} aria-controls="main-nav"
          className="rounded-lg border border-white/30 px-3 py-1.5 text-sm">
          {mobileOpen ? "Close" : "Menu"}
        </button>
      </div>
      <aside
        id="main-nav"
        className={cx(
          "shrink-0 flex-col overflow-hidden bg-co-side text-[#E9E4D6] transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-screen",
          collapsed ? "lg:w-[72px]" : "lg:w-[252px]",
          mobileOpen ? "flex w-full" : "hidden",
        )}
      >
        <div className="px-3 pt-3.5 pb-2.5">
          <button type="button" onClick={toggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cx("block w-full overflow-hidden rounded-xl text-left", collapsed ? "h-12" : "h-[84px]")}
            style={brand.kind === "logo" ? { backgroundColor: brand.bg } : { backgroundColor: "rgba(255,255,255,.12)" }}>
            {brand.kind === "logo" ? (
              // eslint-disable-next-line @next/next/no-img-element -- small, pre-sized local brand asset
              <img src={brand.src} alt={brand.alt} className="h-full w-full object-contain" />
            ) : (
              <span className="flex h-full flex-col justify-center overflow-hidden px-3.5 font-display leading-tight whitespace-nowrap">
                <span className="text-xl">{collapsed ? brand.name.charAt(0) : brand.name}</span>
                {!collapsed && brand.subtitle && <span className="mt-1 font-sans text-[11.5px] opacity-75">{brand.subtitle}</span>}
              </span>
            )}
          </button>
        </div>
        <nav className="flex-1 overflow-x-hidden overflow-y-auto px-2.5 py-1" aria-label="Main">
          <ul>
            {items.map((n) => {
              const inner = (
                <>
                  <span className="w-[22px] flex-none text-center text-[15px]" aria-hidden>{n.icon}</span>
                  <span className={cx("flex-1 truncate", collapsed && "lg:sr-only")}>{n.label}</span>
                  {n.badge && !collapsed && <span className="rounded-full bg-co-hi px-1.5 text-[11px] font-bold text-co-side">{n.badge}</span>}
                  {n.disabledReason && !collapsed && <span className="text-[10px] uppercase tracking-wide opacity-60">Soon</span>}
                </>
              );
              const base = "mb-0.5 flex items-center gap-3 rounded-[9px] px-[11px] py-[9px] text-[14.5px] whitespace-nowrap";
              return (
                <li key={n.key}>
                  {n.href ? (
                    <Link href={n.href} onClick={() => setMobileOpen(false)} title={n.label}
                      aria-current={isActive(n.href) ? "page" : undefined}
                      className={cx(base, isActive(n.href) ? "bg-white/15 text-white" : "text-[#D5DCD1] hover:bg-white/10")}>
                      {inner}
                    </Link>
                  ) : (
                    <span title={`${n.label}: ${n.disabledReason}`} aria-disabled="true" className={cx(base, "cursor-not-allowed text-[#D5DCD1]/45")}>
                      {inner}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
        {footer && <div className={cx("border-t border-white/15 px-3 pt-3.5 pb-4", collapsed && "lg:hidden")}>{footer}</div>}
      </aside>
    </>
  );
}
