import { getContext } from "@/lib/auth";
import { getCompanyContext, getWorkspaceUser, ROLE_LABELS } from "@/lib/workspace";
import { companyNav } from "@/lib/nav";
import { AppShell, companyBrand, switchOptions } from "@/components/shell/app-shell";
import { CompanyBanners, CompanySidebarFooter } from "@/components/shell/company-chrome";
import { FinanceTabs } from "@/components/shell/finance-tabs";
import { GROUP_BRAND } from "@/domain/registry";
import { EmptyState } from "@/components/ui";

/**
 * Finance ledger pages. They act on the active company chosen through /switch (validated
 * there and again by RLS on every query), shown inside that company's branded shell.
 */
export default async function FinanceLayout({ children }: LayoutProps<"/">) {
  const [fin, u] = await Promise.all([getContext(), getWorkspaceUser()]);
  const active = u.memberships.find((m) => m.company.id === fin.org.id)!;
  const ctx = await getCompanyContext(active.company.slug);
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
      {ctx.can("finance.read") ? (
        <>
          <FinanceTabs companyName={c.name} />
          {children}
        </>
      ) : (
        <EmptyState title="No finance access">
          Your role in {c.name} does not include finance. Ask the company owner if you need it.
        </EmptyState>
      )}
    </AppShell>
  );
}
