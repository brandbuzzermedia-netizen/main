import Link from "next/link";
import { cx } from "@/components/ui";

/** Date-range presets as links (no client JS), preserving other query params. */
export function RangePicker({ base, current, params = {} }: { base: string; current: number; params?: Record<string, string | undefined> }) {
  return (
    <div className="inline-flex rounded-full border-2 border-brand bg-surface p-0.5 text-xs shadow-hard-sm" role="group" aria-label="Date range">
      {[7, 14, 30, 90].map((d) => {
        const q = new URLSearchParams(Object.entries({ ...params, days: String(d) }).filter(([, v]) => v) as [string, string][]);
        return (
          <Link
            key={d}
            href={`${base}?${q}`}
            aria-current={current === d ? "true" : undefined}
            className={cx("rounded-full px-3 py-1 font-semibold", current === d ? "bg-brand text-brand-ink" : "text-brand hover:bg-sunken")}
          >
            {d}d
          </Link>
        );
      })}
    </div>
  );
}
