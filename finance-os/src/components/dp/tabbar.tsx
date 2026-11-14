"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DpNavItem } from "./sidebar";

/** Phone-only bottom tabs: the four places used most, plus More (opens the full menu). */
export function TabBar({ nav }: { nav: DpNavItem[] }) {
  const path = usePathname();
  const pick = ["home", "pipeline", "outreach", "finance"].map((k) => nav.find((n) => n.key === k)).filter(Boolean) as DpNavItem[];
  const items = pick.length >= 3 ? pick : nav.slice(0, 4);
  const active = (n: DpNavItem) => (n.key === "home" ? path === n.href : path === n.href || path.startsWith(`${n.href}/`) || path.startsWith(`${n.href}?`));
  return (
    <nav className="dp-tabbar" aria-label="Quick navigation">
      {items.map((n) => (
        <Link key={n.key} href={n.href} aria-current={active(n) ? "page" : undefined} className="dp-tab">
          <span aria-hidden className="dp-tab-ic">{n.icon}</span>
          <span>{n.key === "home" ? "Home" : n.label}</span>
          {n.badge && <span className="dp-tab-badge">{n.badge}</span>}
        </Link>
      ))}
      <button type="button" className="dp-tab" onClick={() => window.dispatchEvent(new Event("dp:toggle-nav"))}>
        <span aria-hidden className="dp-tab-ic">☰</span><span>More</span>
      </button>
    </nav>
  );
}
