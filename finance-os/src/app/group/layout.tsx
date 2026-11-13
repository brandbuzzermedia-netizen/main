import type { Metadata } from "next";
import { getGroupContext, ROLE_LABELS } from "@/lib/workspace";
import { groupNav } from "@/lib/nav";
import { AppShell, groupBrand, switchOptions } from "@/components/shell/app-shell";
import { GROUP_BRAND } from "@/domain/registry";

export const metadata: Metadata = { title: { default: "Command Centre", template: "%s · Diwani Parivaar OS" } };

/** Group shell. Requires a group membership; company figures still need company membership. */
export default async function GroupLayout({ children }: LayoutProps<"/group">) {
  const g = await getGroupContext();
  return (
    <AppShell
      theme={{ side: GROUP_BRAND.sidebar, hi: GROUP_BRAND.accent }}
      brand={groupBrand}
      nav={groupNav(g.group.role === "group_owner")}
      homeHref="/group"
      switcher={{ options: switchOptions(g.groups, g.memberships), current: "group", accent: GROUP_BRAND.accent }}
      user={{ name: g.displayName, initials: g.initials, roleLabel: ROLE_LABELS[g.group.role] }}
      footer={<p className="text-[11.5px] leading-snug text-white/65">{g.group.is_demo ? "Demo data only. Never mixed with production." : "Totals include only companies you are a member of."}</p>}
      banner={g.group.is_demo && (
        <div className="mb-5 rounded-xl border border-warn/30 bg-warn-soft px-4 py-2 text-sm text-warn">
          <strong>Demo group.</strong> Every company, name and figure here is made up for development.
        </div>
      )}
    >
      {children}
    </AppShell>
  );
}
