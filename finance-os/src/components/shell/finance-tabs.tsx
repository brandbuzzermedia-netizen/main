"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/finance", label: "Overview" },
  { href: "/clients", label: "Clients" },
  { href: "/invoices", label: "Invoices" },
  { href: "/payments", label: "Payments" },
  { href: "/tasks", label: "Finance tasks" },
  { href: "/settings/integrations", label: "Integrations" },
];

/** Sub-navigation for the finance ledger of the active company. */
export function FinanceTabs({ companyName }: { companyName: string }) {
  const pathname = usePathname();
  return (
    <div className="mb-6">
      <div className="mb-2 text-xs font-semibold tracking-[.18em] text-muted uppercase">Finance · {companyName}</div>
      <nav aria-label="Finance" className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className={cx("-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap", active ? "border-co-side font-semibold text-ink" : "border-transparent text-muted hover:text-ink")}>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
