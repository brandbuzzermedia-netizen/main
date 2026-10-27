"use client";

import { useState } from "react";

export type Point = { key: string; label: string; value: number };

/**
 * Single-series column chart (one value per day). No legend: the card title names the series.
 * Hover or focus a column for its exact value; a table view is available underneath.
 */
export function ColumnChart({ points, unit, height = 160 }: { points: Point[]; unit: string; height?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  const nice = niceMax(max);
  const n = points.length;
  const tickIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
  const a = active !== null ? points[active] : null;

  return (
    <figure className="m-0">
      <div className="relative" style={{ height }}>
        {/* Recessive gridlines at 0, half and max */}
        {[0, 0.5, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${f * 100}%` }} aria-hidden>
            <span className="tabular absolute -top-2 right-0 bg-surface pl-1 text-[10px] text-muted">{Math.round(nice * f)}</span>
          </div>
        ))}
        <div className="absolute inset-0 right-8 flex items-end gap-[2px]" onMouseLeave={() => setActive(null)}>
          {points.map((p, i) => (
            <button
              key={p.key}
              type="button"
              aria-label={`${p.label}: ${p.value} ${unit}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="group relative flex h-full flex-1 items-end focus:outline-none"
            >
              <span
                className="block w-full rounded-t-[4px] bg-chart-1 transition-opacity group-hover:opacity-80 group-focus-visible:outline-2 group-focus-visible:outline-brand"
                style={{ height: p.value === 0 ? 0 : `max(${(p.value / nice) * 100}%, 2px)` }}
              />
            </button>
          ))}
        </div>
        {a && active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `calc(${((active + 0.5) / n) * 100}% - ${((active + 0.5) / n) * 2}rem)` }}
          >
            <div className="text-muted">{a.label}</div>
            <div className="tabular font-semibold">{a.value.toLocaleString()} {unit}</div>
          </div>
        )}
      </div>
      <div className="relative mt-1.5 mr-8 h-4 text-[10px] text-muted" aria-hidden>
        {tickIdx.map((i) => (
          <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((i + 0.5) / n) * 100}%` }}>{points[i]?.label}</span>
        ))}
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted">Show as table</summary>
        <table className="mt-2 w-full max-w-xs">
          <tbody>
            {points.map((p) => (
              <tr key={p.key} className="border-t border-line"><td className="py-0.5">{p.label}</td><td className="tabular py-0.5 text-right">{p.value}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Rounds an axis maximum up to 1, 2 or 5 × a power of ten. */
export function niceMax(v: number): number {
  if (v <= 5) return Math.max(1, Math.ceil(v));
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/** Horizontal bars for a ranked list (one series). Values are printed beside each bar. */
export function BarList({ rows }: { rows: { key: string; label: React.ReactNode; value: number; display: string; title: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,9rem)_1fr_minmax(3rem,auto)] items-center gap-3 text-sm" title={r.title}>
          <span className="truncate">{r.label}</span>
          <span className="h-2 rounded-r-[4px] bg-surface-2" aria-hidden>
            <span className="block h-2 rounded-r-[4px] bg-chart-1" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="tabular text-right text-muted">{r.display}</span>
        </li>
      ))}
    </ul>
  );
}
