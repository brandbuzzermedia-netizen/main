import type { Metadata } from "next";
import { getCompanyContext, ROLE_LABELS } from "@/lib/workspace";
import { dpCompanyNav } from "@/lib/dp-nav";
import { companyApprovals, wsOptions } from "@/lib/dp-chrome";
import { companyTheme } from "@/components/dp/theme";
import { DemoBanner, DpShell, StopBanner } from "@/components/dp/shell";
import { toggleStopAction } from "./actions";

export async function generateMetadata({ params }: LayoutProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  return { title: { default: ctx.company.name, template: `%s · ${ctx.company.short_name ?? ctx.company.name}` } };
}

/** Company workspace in the Company OS frame. Entering requires explicit membership of this company. */
export default async function CompanyLayout({ children, params }: LayoutProps<"/c/[slug]">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const c = ctx.company;
  const theme = companyTheme(c);
  const ap = await companyApprovals(ctx);
  return (
    <DpShell theme={theme} wsId={c.id} homeHref={`/c/${slug}`}
      nav={dpCompanyNav(c, (p) => ctx.can(p as never), { role: ctx.role, approvals: ap.automation })}
      stop={{ slug, on: c.emergency_stop, can: ctx.can("company.emergency_stop"), action: toggleStopAction.bind(null, slug) }}
      note={c.is_demo ? "Demo data only. Never mixed with production." : "Figures come from approved records only."}
      switcher={{ options: wsOptions(ctx.group?.name ?? null, ctx.memberships), current: slug }}
      search={{ placeholder: `Search in ${c.name} only…`, action: `/c/${slug}/search` }}
      bell={{ href: ap.automation ? `/c/${slug}/automation` : `/c/${slug}/finance/ledger`, count: ap.automation + ap.ledger }}
      user={{ initials: ctx.initials, name: ctx.displayName, role: ROLE_LABELS[ctx.role] ?? ctx.role }}
      banner={<>{c.emergency_stop && <StopBanner name={c.name} />}{c.is_demo && <DemoBanner />}</>}>
      {children}
    </DpShell>
  );
}
