"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cx } from "./ui";

type Item = { href: string; label: string; phase?: number };

const NAV: { heading?: string; items: Item[] }[] = [
  { items: [{ href: "/", label: "Overview" }] },
  {
    heading: "Receivables",
    items: [
      { href: "/clients", label: "Clients" },
      { href: "/invoices", label: "Invoices" },
      { href: "/payments", label: "Payments" },
      { href: "/tasks", label: "Tasks" },
    ],
  },
  {
    heading: "Money in & out",
    items: [
      { href: "/ad-budgets", label: "Ad budgets", phase: 4 },
      { href: "/expenses", label: "Expenses", phase: 4 },
      { href: "/cash-flow", label: "Cash flow", phase: 4 },
    ],
  },
  {
    heading: "System",
    items: [
      { href: "/automation", label: "Automation logs", phase: 5 },
      { href: "/settings/integrations", label: "Integrations" },
    ],
  },
];

export function Sidebar({ orgName, email, role, isDemo }: { orgName: string; email: string | null; role: string; isDemo: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Image src="/bee.svg" alt="" width={24} height={24} /> Finance OS
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="sidebar-nav"
          className="rounded-lg border border-line px-3 py-1.5 text-sm"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>
      <aside
        id="sidebar-nav"
        className={cx(
          "w-full shrink-0 border-r border-line bg-surface lg:sticky lg:top-0 lg:block lg:h-screen lg:w-60",
          open ? "block" : "hidden",
        )}
      >
        <div className="flex h-full flex-col">
          <Link href="/" className="hidden items-center gap-2.5 px-5 pt-5 pb-4 lg:flex">
            <Image src="/bee.svg" alt="" width={28} height={28} />
            <span className="leading-tight">
              <span className="block text-sm font-semibold">Get Bee Seen</span>
              <span className="block text-xs text-muted">Finance OS</span>
            </span>
          </Link>
          <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
            {NAV.map((group, gi) => (
              <div key={gi} className="mt-3">
                {group.heading && <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{group.heading}</div>}
                <ul>
                  {group.items.map((item) =>
                    item.phase ? (
                      <li key={item.href}>
                        <span className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-muted/70" title={`Arrives in build phase ${item.phase}`}>
                          {item.label}
                          <span className="text-[10px] uppercase tracking-wide">Phase {item.phase}</span>
                        </span>
                      </li>
                    ) : (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={isActive(item.href) ? "page" : undefined}
                          className={cx(
                            "block rounded-lg px-2 py-1.5 text-sm",
                            isActive(item.href) ? "bg-brand-soft font-medium text-brand" : "hover:bg-surface-2",
                          )}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </nav>
          <div className="border-t border-line px-5 py-4 text-xs">
            <div className="truncate font-medium">{orgName}</div>
            {isDemo && <div className="mt-0.5 font-semibold text-warn">Demo data</div>}
            <div className="mt-0.5 truncate text-muted">{email} · {role.replace("_", " ")}</div>
            <form action="/auth/signout" method="post" className="mt-2">
              <button className="text-muted underline-offset-2 hover:underline">Sign out</button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
