import { getContext } from "@/lib/auth";
import { getCompanyContext, getWorkspaceUser, ROLE_LABELS } from "@/lib/workspace";
import { dpCompanyNav } from "@/lib/dp-nav";
import { companyApprovals, wsOptions } from "@/lib/dp-chrome";
import { companyTheme } from "@/components/dp/theme";
import { DemoBanner, DpShell, StopBanner } from "@/components/dp/shell";
import { Dashed } from "@/components/dp/ui";
import { FinanceTabs } from "@/components/shell/finance-tabs";
import { toggleStopAction } from "../c/[slug]/actions";

/**
 * Receivables ledger pages. They act on the active company chosen through /switch (validated
 * there and again by RLS on every query), shown inside that company's Company OS frame.
 */
export default async function FinanceLayout({ children }: LayoutProps<"/">) {
  const [fin, u] = await Promise.all([getContext(), getWorkspaceUser()]);
  const active = u.memberships.find((m) => m.company.id === fin.org.id)!;
  const ctx = await getCompanyContext(active.company.slug);
  const c = ctx.company;
  const slug = c.slug;
  const ap = await companyApprovals(ctx);
  return (
    <DpShell theme={companyTheme(c)} wsId={c.id} homeHref={`/c/${slug}`}
      nav={dpCompanyNav(c, (p) => ctx.can(p as never), { role: ctx.role, approvals: ap.automation })}
      stop={{ slug, on: c.emergency_stop, can: ctx.can("company.emergency_stop"), action: toggleStopAction.bind(null, slug) }}
      note={c.is_demo ? "Demo data only. Never mixed with production." : "Figures come from approved records only."}
      switcher={{ options: wsOptions(ctx.group?.name ?? null, ctx.memberships), current: slug }}
      search={{ placeholder: `Search in ${c.name} only…`, action: `/c/${slug}/search` }}
      bell={{ href: ap.automation ? `/c/${slug}/automation` : `/c/${slug}/finance/ledger`, count: ap.automation + ap.ledger }}
      user={{ initials: ctx.initials, name: ctx.displayName, role: ROLE_LABELS[ctx.role] ?? ctx.role }}
      banner={<>{c.emergency_stop && <StopBanner name={c.name} />}{c.is_demo && <DemoBanner />}</>}>
      {ctx.can("finance.read") ? (
        <>
          <FinanceTabs companyName={c.name} financeHref={`/c/${slug}/finance`} />
          {children}
        </>
      ) : (
        <Dashed title="No finance access" msg={`Your role in ${c.name} does not include finance. Ask the company owner if you need it.`} />
      )}
    </DpShell>
  );
}
