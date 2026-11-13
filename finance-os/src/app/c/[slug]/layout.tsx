import type { Metadata } from "next";
import { getCompanyContext, ROLE_LABELS } from "@/lib/workspace";
import { companyNav } from "@/lib/nav";
import { AppShell, companyBrand, switchOptions } from "@/components/shell/app-shell";
import { CompanyBanners, CompanySidebarFooter } from "@/components/shell/company-chrome";
import { GROUP_BRAND } from "@/domain/registry";

export async function generateMetadata({ params }: LayoutProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  return { title: { default: ctx.company.name, template: `%s · ${ctx.company.short_name ?? ctx.company.name}` } };
}

/** Company workspace shell. Entering requires explicit membership of this company. */
export default async function CompanyLayout({ children, params }: LayoutProps<"/c/[slug]">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const c = ctx.company;
  return (
    <AppShell
      theme={{ side: c.sidebar_color ?? GROUP_BRAND.sidebar, hi: c.accent_color ?? GROUP_BRAND.accent }}
      brand={companyBrand(c)}
      nav={companyNav(c, (p) => ctx.can(p as never))}
      homeHref={`/c/${c.slug}`}
      switcher={{ options: switchOptions(ctx.groups, ctx.memberships), current: c.slug, accent: c.accent_color ?? GROUP_BRAND.accent }}
      user={{ name: ctx.displayName, initials: ctx.initials, roleLabel: ROLE_LABELS[ctx.role] ?? ctx.role }}
      footer={<CompanySidebarFooter ctx={ctx} />}
      banner={<CompanyBanners ctx={ctx} />}
    >
      {children}
    </AppShell>
  );
}
