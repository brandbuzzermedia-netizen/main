"use client";

import { useId, useMemo, useState } from "react";

export interface Series {
  key: string;
  label: string;
  /** CSS variable for the series colour (fixed order: --series-1, --series-2, --series-3). */
  color: string;
}

const H = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 36 };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** Multi-series line chart with crosshair + tooltip, legend, and an accessible table fallback. */
export function LineChart({ data, series, xKey, title }: { data: Record<string, number | string>[]; series: Series[]; xKey: string; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(640);
  const id = useId();
  const max = useMemo(() => niceMax(Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)))), [data, series]);
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <figure className="relative" aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="sr-only">
        {title}
      </figcaption>
      <Legend series={series} />
      <div
        className="relative"
        ref={(el) => {
          if (el && Math.abs(el.clientWidth - width) > 4) setWidth(el.clientWidth);
        }}
      >
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          aria-label={title}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * width;
            const i = Math.round(((px - PAD.left) / innerW) * (data.length - 1));
            setHover(Math.max(0, Math.min(data.length - 1, i)));
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--ink-3)" className="tabular">
                {Math.round(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            i % labelEvery === 0 || i === data.length - 1 ? (
              <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-3)">
                {shortDate(String(d[xKey]))}
              </text>
            ) : null,
          )}
          {series.map((s) => (
            <polyline
              key={s.key}
              fill="none"
              stroke={`var(${s.color})`}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={data.map((d, i) => `${x(i)},${y(Number(d[s.key]) || 0)}`).join(" ")}
            />
          ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--ink-3)" strokeDasharray="3 3" />
              {series.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(Number(data[hover][s.key]) || 0)} r={4} fill={`var(${s.color})`} stroke="var(--surface)" strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
        {hover != null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[140px] rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(x(hover) / width, 0.12), 0.78) * 100 + "%", transform: "translateX(-50%)" }}
          >
            <div className="mb-1 font-medium text-ink">{shortDate(String(data[hover][xKey]))}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="h-0.5 w-3 rounded" style={{ background: `var(${s.color})` }} />
                  {s.label}
                </span>
                <span className="tabular font-medium text-ink">{data[hover][s.key]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <DataTable data={data} series={series} xKey={xKey} title={title} format={shortDate} />
    </figure>
  );
}

/** Horizontal grouped bars per category (one axis, values labelled at the bar end). */
export function BarList({ rows, series, title }: { rows: { label: string; values: Record<string, number> }[]; series: Series[]; title: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => series.map((s) => r.values[s.key] ?? 0)));
  const [hover, setHover] = useState<string | null>(null);
  if (!rows.length) return <p className="py-6 text-center text-sm text-ink-3">No data for this period.</p>;
  return (
    <figure aria-label={title}>
      {series.length > 1 && <Legend series={series} />}
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="mb-1 truncate text-xs font-medium text-ink-2">{r.label}</div>
            <div className="flex flex-col gap-[2px]">
              {series.map((s) => {
                const v = r.values[s.key] ?? 0;
                const k = `${r.label}:${s.key}`;
                return (
                  <div key={s.key} className="flex items-center gap-2" onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} title={`${s.label}: ${v}`}>
                    <div className="h-3 flex-1">
                      <div
                        className="h-3 rounded-r-[4px] transition-opacity"
                        style={{ width: `${(v / max) * 100}%`, minWidth: v ? 3 : 0, background: `var(${s.color})`, opacity: hover && hover !== k ? 0.55 : 1 }}
                      />
                    </div>
                    <span className="tabular w-10 text-right text-xs text-ink-2">{v}</span>
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `var(${s.color})` }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function DataTable({
  data,
  series,
  xKey,
  title,
  format,
}: {
  data: Record<string, number | string>[];
  series: Series[];
  xKey: string;
  title: string;
  format: (v: string) => string;
}) {
  return (
    <details className="mt-2 text-xs text-ink-3">
      <summary className="cursor-pointer select-none hover:text-ink-2">View as table</summary>
      <div className="mt-2 max-h-56 overflow-auto">
        <table className="w-full text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th className="py-1 pr-3 font-medium">Date</th>
              {series.map((s) => (
                <th key={s.key} className="py-1 pr-3 text-right font-medium">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={String(d[xKey])} className="border-t border-line">
                <td className="py-1 pr-3">{format(String(d[xKey]))}</td>
                {series.map((s) => (
                  <td key={s.key} className="tabular py-1 pr-3 text-right text-ink-2">
                    {d[s.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
