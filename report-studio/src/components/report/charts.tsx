// Report charts are hand-drawn SVG (not Recharts) so the PDF matches the
// reference exactly and renders without client-side JavaScript.
import { Fragment } from "react";
import { K, PCT, f0 } from "@/lib/format";

type Item = { l: string; v: number | null; c?: string };

export function BarsV({ items, h = 190, w = 470, fmt = K }: { items: Item[]; h?: number; w?: number; fmt?: (n: number | null) => string }) {
  const max = Math.max(...items.map((i) => i.v || 0), 1), n = items.length;
  const bw = Math.min(56, (w - 20) / n - 16), gap = (w - 20 - bw * n) / n;
  return (
    <svg viewBox={`0 0 ${w} ${h + 40}`} className="chart" role="img">
      {items.map((it, k) => {
        const x = 10 + gap / 2 + k * (bw + gap), bh = ((it.v || 0) / max) * h;
        return (
          <Fragment key={k}>
            <rect x={x} y={h + 16 - bh} width={bw} height={bh} fill={it.c || "var(--num)"} />
            <text x={x + bw / 2} y={h + 10 - bh} textAnchor="middle" className="cv">{fmt(it.v)}</text>
            <text x={x + bw / 2} y={h + 33} textAnchor="middle" className="cl">{it.l}</text>
          </Fragment>
        );
      })}
      <line x1="10" x2={w - 10} y1={h + 16} y2={h + 16} stroke="var(--rule)" />
    </svg>
  );
}

export function Donut({ p, size = 150 }: { p: number; size?: number }) {
  const r = size / 2 - 12, c = 2 * Math.PI * r, m = size / 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="chart" style={{ width: size }} role="img">
      <circle cx={m} cy={m} r={r} fill="none" stroke="var(--rule)" strokeWidth="14" />
      <circle cx={m} cy={m} r={r} fill="none" stroke="var(--num)" strokeWidth="14" strokeDasharray={`${(c * p) / 100} ${c}`} transform={`rotate(-90 ${m} ${m})`} />
      <text x={m} y={m + size * 0.07} textAnchor="middle" className="dv" style={{ fontSize: Math.round(size * 0.19) }}>{PCT(p)}</text>
    </svg>
  );
}

export function HBars({ items, fmt = f0 }: { items: Item[]; fmt?: (n: number | null) => string }) {
  const max = Math.max(...items.map((i) => i.v || 0), 1);
  return (
    <>
      {items.map((i, k) => (
        <div className="hb" key={k}>
          <span>{i.l}</span>
          <i style={{ width: `${((i.v || 0) / max) * 100}%` }} />
          <b>{fmt(i.v)}</b>
        </div>
      ))}
    </>
  );
}
