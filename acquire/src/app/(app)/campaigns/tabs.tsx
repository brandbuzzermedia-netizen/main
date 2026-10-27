import Link from "next/link";
import { cx } from "@/components/ui";

export function CampaignTabs({ active }: { active: "sequences" | "templates" }) {
  return (
    <nav className="mb-6 flex gap-1 border-b border-line text-sm" aria-label="Campaigns">
      {([["sequences", "/campaigns", "Sequences"], ["templates", "/campaigns/templates", "Templates"]] as const).map(([key, href, label]) => (
        <Link key={key} href={href} aria-current={key === active ? "page" : undefined}
          className={cx("-mb-px border-b-2 px-3 py-2", key === active ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-ink")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
