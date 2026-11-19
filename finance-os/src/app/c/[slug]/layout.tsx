import type { Metadata } from "next";
import { getCompanyContext, ROLE_LABELS } from "@/lib/workspace";
import { dpCompanyNav } from "@/lib/dp-nav";
import { companyApprovals, wsOptions } from "@/lib/dp-chrome";
import { companyTheme } from "@/components/dp/theme";
import { DpShell, HoldBanner, StopBanner } from "@/components/dp/shell";
import { loadActivity, unreadActivity } from "@/lib/activity";
import { toBellItems } from "@/components/dp/activity";
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
  const [ap, activity, unread] = await Promise.all([companyApprovals(ctx), loadActivity(ctx.supabase, [{ id: c.id, name: c.name }], 10), unreadActivity(ctx.supabase, [c.id], ctx.userId)]);
  const { data: holds } = await ctx.supabase.from("work_holds").select("client:clients(legal_name)").eq("organization_id", c.id).eq("status", "active").limit(20);
  const onHold = ((holds ?? []) as unknown as { client: { legal_name: string } | null }[]).map((h) => h.client?.legal_name ?? "A client");
  return (
    <DpShell theme={theme} wsId={c.id} homeHref={`/c/${slug}`} plusHref={ctx.can("crm.write") ? `/c/${slug}/pipeline?add=1` : undefined}
      nav={dpCompanyNav(c, (p) => ctx.can(p as never), { role: ctx.role, approvals: ap.automation })}
      stop={{ slug, on: c.emergency_stop, can: ctx.can("company.emergency_stop"), action: toggleStopAction.bind(null, slug) }}
      note={c.is_demo ? "Demo data only. Never mixed with production." : "Figures come from approved records only."}
      switcher={{ options: wsOptions(ctx.group?.name ?? null, ctx.memberships), current: slug }}
      search={{ placeholder: `Search in ${c.name} only…`, action: `/c/${slug}/search` }}
      bell={{ href: ap.automation ? `/c/${slug}/automation` : `/c/${slug}/finance/ledger`, count: ap.automation + ap.ledger, items: toBellItems(activity), unread, allHref: `/c/${slug}#activity` }}
      user={{ initials: ctx.initials, name: ctx.displayName, role: ROLE_LABELS[ctx.role] ?? ctx.role }}
      banner={<>{c.emergency_stop && <StopBanner name={c.name} />}{onHold.length > 0 && <HoldBanner slug={slug} clients={onHold} />}</>}>
      {children}
    </DpShell>
  );
}
