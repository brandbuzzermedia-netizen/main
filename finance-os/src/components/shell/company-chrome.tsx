import Link from "next/link";
import type { CompanyContext } from "@/lib/workspace";
import { formatDateTime } from "@/domain/dates";

/** Banners every company page shows: emergency stop and demo data. */
export function CompanyBanners({ ctx }: { ctx: CompanyContext }) {
  const c = ctx.company;
  return (
    <>
      {c.emergency_stop && (
        <div role="alert" className="mb-5 rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white">
          Emergency stop is ON for {c.name}
          {c.emergency_stop_at ? ` since ${formatDateTime(c.emergency_stop_at)}` : ""}. Reason: {c.emergency_stop_reason}.
          {" "}Outbound messages and workflow runs stay paused.
          {ctx.can("company.emergency_stop") && <> <Link className="underline" href={`/c/${c.slug}/settings#emergency-stop`}>Resume</Link></>}
        </div>
      )}
      {c.is_demo && (
        <div className="mb-5 rounded-xl border border-warn/30 bg-warn-soft px-4 py-2 text-sm text-warn">
          <strong>Demo workspace.</strong> Every name and figure here is made up for development. Never mixed with production.
        </div>
      )}
    </>
  );
}

export function CompanySidebarFooter({ ctx }: { ctx: CompanyContext }) {
  const c = ctx.company;
  return (
    <div className="flex flex-col gap-2.5">
      {ctx.can("company.emergency_stop") && (
        <Link href={`/c/${c.slug}/settings#emergency-stop`} title="Company emergency stop"
          className={c.emergency_stop
            ? "rounded-[9px] border border-co-hi bg-co-hi px-2.5 py-2 text-center text-[13px] font-semibold text-co-side"
            : "rounded-[9px] border border-white/35 px-2.5 py-2 text-center text-[13px] font-semibold"}>
          {c.emergency_stop ? "Resume company" : "Emergency stop"}
        </Link>
      )}
      <p className="text-[11.5px] leading-snug text-white/65">
        {c.is_demo ? "Demo data only. Never mixed with production." : "Figures come from recorded transactions only."}
      </p>
    </div>
  );
}
