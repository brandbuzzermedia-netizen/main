import type { CSSProperties, ReactNode } from "react";
import { Sidebar, type BrandTile } from "./sidebar";
import { WorkspaceSwitcher, type SwitchOption } from "./switcher";
import type { NavItem } from "@/lib/nav";
import { GROUP_BRAND, type LogoKey } from "@/domain/registry";
import type { Company, GroupRef, MembershipRef } from "@/lib/workspace";

/** Background behind each bundled logo, so the sidebar tile matches the artwork's own canvas. */
const LOGO_BG: Record<LogoKey | "diwani", string> = {
  diwani: "#FBF8EE", gbs: "#3E5D48", brightwire: "#FEFEFF", moreofus: "#FFFFFF", iyp: "#DFDDDE", tanofun: "#FFFFFF",
};

export function companyBrand(c: Pick<Company, "name" | "logo_key" | "owner_label">): BrandTile {
  return c.logo_key
    ? { kind: "logo", src: `/logos/${c.logo_key}.png`, bg: LOGO_BG[c.logo_key], alt: c.name }
    : { kind: "text", name: c.name, subtitle: c.owner_label ?? undefined };
}

export const groupBrand: BrandTile = { kind: "logo", src: "/logos/diwani.png", bg: LOGO_BG.diwani, alt: "Diwani Parivaar" };

export function switchOptions(groups: GroupRef[], memberships: MembershipRef[]): SwitchOption[] {
  return [
    ...groups.slice(0, 1).map((g) => ({ value: "group", label: `${g.name} · Command Centre` })),
    ...memberships.map((m) => ({ value: m.company.slug, label: m.company.name })),
  ];
}

export function AppShell({
  theme, brand, nav, homeHref, switcher, user, footer, banner, children,
}: {
  theme: { side: string; hi: string };
  brand: BrandTile;
  nav: NavItem[];
  homeHref: string;
  switcher: { options: SwitchOption[]; current: string; accent: string };
  user: { name: string; initials: string; roleLabel: string };
  footer?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const style = { "--co-side": theme.side || GROUP_BRAND.sidebar, "--co-hi": theme.hi || GROUP_BRAND.accent } as CSSProperties;
  return (
    <div style={style} className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar brand={brand} items={nav} footer={footer} homeHref={homeHref} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur sm:px-8">
          <WorkspaceSwitcher {...switcher} />
          <div className="flex-1" />
          <div className="flex items-center gap-2.5">
            <div className="grid size-[38px] place-items-center rounded-full bg-co-side text-[12.5px] font-bold text-[#F5F1E8]" aria-hidden>{user.initials}</div>
            <div className="hidden leading-tight sm:block">
              <div className="text-[13.5px] font-semibold">{user.name}</div>
              <div className="text-xs text-muted">{user.roleLabel}</div>
            </div>
            <form action="/auth/signout" method="post">
              <button className="ml-2 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2">Sign out</button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 pt-7 pb-16 sm:px-8">
          {banner}
          {children}
        </main>
      </div>
    </div>
  );
}
