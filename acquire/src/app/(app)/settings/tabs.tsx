"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export function SettingsTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line text-sm" aria-label="Settings">
      {tabs.map((t) => {
        const active = t.href === "/settings" ? pathname === "/settings" : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
            className={cx("-mb-px border-b-2 px-3 py-2 whitespace-nowrap", active ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-ink")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
