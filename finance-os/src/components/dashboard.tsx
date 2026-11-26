import Link from "next/link";
import type { ReactNode } from "react";
import { PERIOD_TABS, type PeriodKey } from "@/domain/periods";
import { formatShort } from "@/domain/money";
import type { DeskItem, PipelineSummary } from "@/domain/dashboard";
import { CONSOLIDATION, OWNERSHIP_TYPES, type Consolidation, type OwnershipType } from "@/domain/registry";
import { cx } from "@/components/ui";

export function PeriodTabs({ current, basePath }: { current: PeriodKey; basePath: string }) {
  return (
    <nav aria-label="Period" className="flex gap-0.5 rounded-[10px] border border-line bg-surface p-[3px]">
      {PERIOD_TABS.map((p) => (
        <Link key={p.key} href={p.key === "month" ? basePath : `${basePath}?period=${p.key}`} aria-current={current === p.key ? "page" : undefined}
          className={cx("rounded-lg px-[13px] py-[7px] text-[13.5px] font-semibold whitespace-nowrap",
            current === p.key ? "bg-co-side text-white" : "hover:bg-surface-2")}>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

export function OwnershipEyebrow({ ownership, consolidation }: { ownership: OwnershipType; consolidation: Consolidation }) {
  return (
    <>
      <span className="rounded-md bg-brand-soft px-[9px] py-[3px] text-xs font-semibold text-co-side dark:text-brand">{OWNERSHIP_TYPES[ownership]}</span>
      <span className={cx("text-[12.5px]", consolidation === "needs_confirmation" ? "text-danger" : "text-muted")}>{CONSOLIDATION[consolidation]}</span>
    </>
  );
}

export function Panel({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl border border-line bg-surface px-[26px] py-[22px]", className)}>
      {(title || aside) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title && <h2 className="font-display text-[22px] font-medium">{title}</h2>}
          {aside && <div className="text-[13px] text-muted">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const DESK_TONE: Record<DeskItem["key"], string> = {
  meetings: "bg-co-side text-white",
  hot: "bg-co-hi text-co-side",
  proposals: "bg-brand-soft text-co-side dark:text-brand",
  overdue_followups: "bg-warn-soft text-warn",
  stalled: "bg-brand-soft text-co-side dark:text-brand",
  collections: "bg-danger text-white",
};

export function CloserDesk({ items, hrefFor, emptyHint }: { items: DeskItem[]; hrefFor: (k: DeskItem["key"]) => string; emptyHint: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface px-[26px] pt-1.5 pb-2.5" aria-labelledby="desk-h">
      <div className="flex items-baseline justify-between pt-5 pb-2">
        <h2 id="desk-h" className="font-display text-2xl font-medium">Closer Desk</h2>
        <div className="text-[13px] text-muted">Ranked by money at stake</div>
      </div>
      {items.length === 0 ? (
        <div className="border-t border-line-2 py-6 text-sm text-muted">{emptyHint}</div>
      ) : (
        <ol>
          {items.map((d, i) => (
            <li key={d.key} className="flex items-center gap-3.5 border-t border-line-2 py-3.5">
              <div className={cx("grid size-9 flex-none place-items-center rounded-[9px] text-[15px] font-bold", DESK_TONE[d.key])}>{i + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">{d.title} <span className="font-normal text-muted">· {d.count}</span></div>
                <div className="truncate text-[13px] text-muted">{d.detail}</div>
              </div>
              {d.atStakeMinor > 0 && <div className="tabular hidden text-right font-display text-lg sm:block">{formatShort(d.atStakeMinor)}</div>}
              <Link href={hrefFor(d.key)} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap text-co-side hover:bg-surface-2 dark:text-brand">{d.action}</Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const SHADES = ["var(--co-side)", "#2F5D4C", "#829487", "var(--co-hi)", "#D8C490", "#B9B4A3", "#DAD5C3", "#8C2F39"];

export function StageBar({ pipeline, href }: { pipeline: PipelineSummary; href: string }) {
  const stages = pipeline.byStage;
  const total = stages.reduce((s, b) => s + b.count, 0);
  return (
    <Panel title="Pipeline by stage" aside={<Link className="underline-offset-2 hover:underline" href={href}>Open pipeline</Link>}>
      {stages.length === 0 ? (
        <p className="text-sm text-muted">No stages configured for this company yet.</p>
      ) : (
        <>
          <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-[7px] bg-surface-2" role="img"
            aria-label={stages.map((b) => `${b.name}: ${b.count}`).join(", ")}>
            {total > 0 && stages.map((b, i) => b.count > 0 && <div key={b.stageId} style={{ flex: b.count, background: SHADES[i % SHADES.length] }} />)}
          </div>
          <ul className="mt-3.5 flex flex-wrap gap-x-[22px] gap-y-2">
            {stages.map((b, i) => (
              <li key={b.stageId} className="flex items-center gap-[7px] text-[13px]">
                <span className="size-[9px] rounded-[3px]" style={{ background: SHADES[i % SHADES.length] }} aria-hidden />
                {b.name} <b>{b.count}</b>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-faint">Open stages show current deals; won and lost show deals closed in the selected period.</p>
        </>
      )}
    </Panel>
  );
}

export type KpiRow = { label: string; sub?: ReactNode; value: ReactNode; href?: string; tone?: "danger" };

export function KpiList({ rows }: { rows: KpiRow[] }) {
  return (
    <section className="rounded-2xl border border-line bg-surface px-6 py-2">
      <ul>
        {rows.map((k, i) => (
          <li key={k.label} className={cx("flex items-center gap-3 py-[15px]", i > 0 && "border-t border-line-2")}>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-muted">{k.href ? <Link className="hover:underline" href={k.href}>{k.label}</Link> : k.label}</div>
              {k.sub && <div className="mt-0.5 text-xs text-faint">{k.sub}</div>}
            </div>
            <div className={cx("tabular font-display text-[30px] leading-none font-medium tracking-tight", k.tone === "danger" && "text-danger")}>{k.value}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Tile({ label, value, sub, href }: { label: string; value: ReactNode; sub?: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="tabular mt-1.5 font-display text-[28px] leading-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
    </>
  );
  const cls = "block rounded-[14px] border border-line bg-surface px-[18px] py-4";
  return href ? <Link href={href} className={cx(cls, "hover:border-faint")}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function MoneyRows({ title, rows, footer }: { title: string; rows: { name: string; basis: string; value: ReactNode }[]; footer?: ReactNode }) {
  return (
    <Panel title={title}>
      <ul>
        {rows.map((r) => (
          <li key={r.name} className="flex justify-between gap-2.5 border-t border-line-2 py-2.5 text-sm">
            <span>{r.name}<br /><span className="text-[11.5px] text-faint">{r.basis}</span></span>
            <b className="tabular text-right">{r.value}</b>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-3 text-[13.5px] font-semibold">{footer}</div>}
    </Panel>
  );
}

/** A value that is not available yet, with the reason in plain words. */
export function NotYet({ children }: { children: ReactNode }) {
  return <span className="font-sans text-sm font-normal text-faint">{children}</span>;
}
