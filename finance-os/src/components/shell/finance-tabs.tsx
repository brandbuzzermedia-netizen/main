"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/finance", label: "Receivables" },
  { href: "/clients", label: "Clients" },
  { href: "/invoices", label: "Invoices" },
  { href: "/payments", label: "Payments" },
  { href: "/tasks", label: "Finance tasks" },
  { href: "/settings/integrations", label: "Integrations" },
];

/** Receivables sub-navigation for the active company, in the Company OS tab style. */
export function FinanceTabs({ companyName, financeHref }: { companyName: string; financeHref: string }) {
  const pathname = usePathname();
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "#829487" }}>Receivables · {companyName}</span>
        <a href={financeHref} style={{ fontSize: 12.5, color: "#6d7a70" }}>← Back to Finance</a>
      </div>
      <nav aria-label="Receivables" style={{ display: "flex", gap: 6, borderBottom: "1px solid #e2dcc9", overflowX: "auto" }}>
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              style={{ padding: "10px 16px", fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap", textDecoration: "none", borderBottom: `3px solid ${active ? "var(--co-side)" : "transparent"}`, color: active ? "var(--co-side)" : "#6d7a70" }}>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
