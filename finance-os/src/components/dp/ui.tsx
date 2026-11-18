import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { C } from "./theme";

/** Building blocks with the exact styles of the Company OS design. Colours that vary per company use --co-side / --co-hi / --co-acc / --co-font. */
export const side = "var(--co-side)";
export const hi = "var(--co-hi)";
export const font = "var(--co-font)";

export const card: CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: "22px 26px" };
export const mono = "var(--font-mono), ui-monospace, monospace";
/** Small uppercase label in the More of Us OS style. */
export const label: CSSProperties = { fontFamily: mono, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: C.muted };
export const rowTop: CSSProperties = { borderTop: `1px solid ${C.line2}` };

export function Card({ title, aside, children, style, titleSize = 22 }: { title?: ReactNode; aside?: ReactNode; children?: ReactNode; style?: CSSProperties; titleSize?: number }) {
  return (
    <section style={{ ...card, ...style }}>
      {(title || aside) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          {title && <h2 style={{ fontFamily: "var(--font-tight), sans-serif", fontSize: Math.min(titleSize, 22), fontWeight: 800, letterSpacing: "-.02em", margin: 0 }}>{title}</h2>}
          {aside && <div style={{ fontSize: 12.5, color: C.muted }}>{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Line({ left, right, sub, strong = true, rightColor, href }: { left: ReactNode; right?: ReactNode; sub?: ReactNode; strong?: boolean; rightColor?: string; href?: string }) {
  const body = (
    <>
      <span>{left}{sub && <><br /><span style={{ fontSize: 11.5, color: C.faint }}>{sub}</span></>}</span>
      {right !== undefined && (strong ? <b style={{ color: rightColor, textAlign: "right" }}>{right}</b> : <span style={{ color: rightColor ?? C.muted, textAlign: "right" }}>{right}</span>)}
    </>
  );
  const s: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 0", ...rowTop, fontSize: 14, color: "inherit", textDecoration: "none" };
  return href ? <Link href={href} style={s}>{body}</Link> : <div style={s}>{body}</div>;
}

export function Pill({ children, tone = "soft" }: { children: ReactNode; tone?: "soft" | "warn" | "red" | "plain" }) {
  const t = { soft: { background: C.soft, color: side }, warn: { background: C.warnBg, color: C.warnFg2 }, red: { background: C.redBg, color: C.red }, plain: { background: C.bg, color: C.ink } }[tone];
  return <span style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 500, borderRadius: 2, padding: "3px 8px", whiteSpace: "nowrap", ...t }}>{children}</span>;
}

export function Tile({ l, v, s, href }: { l: ReactNode; v: ReactNode; s?: ReactNode; href?: string }) {
  const body = (
    <>
      <div style={label}>{l}</div>
      <div style={{ fontFamily: "var(--font-tight), sans-serif", fontWeight: 800, fontSize: 32, letterSpacing: "-.03em", marginTop: 10 }}>{v}</div>
      {s && <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{s}</div>}
    </>
  );
  const st: CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: "16px 18px", color: "inherit", textDecoration: "none", display: "block" };
  return href ? <Link href={href} style={st}>{body}</Link> : <div style={st}>{body}</div>;
}

export function Btn({ children, href, primary, onDark, type, name, value, title, disabled, small }: {
  children: ReactNode; href?: string; primary?: boolean; onDark?: boolean; type?: "submit" | "button"; name?: string; value?: string; title?: string; disabled?: boolean; small?: boolean;
}) {
  const st: CSSProperties = primary
    ? { background: onDark ? hi : "var(--co-btn)", color: onDark ? side : "#fff", border: 0, fontWeight: 700 }
    : { background: onDark ? "transparent" : "#fff", color: onDark ? "#fff" : C.ink, border: `1px solid ${onDark ? "rgba(255,255,255,.4)" : C.btnLine}`, fontWeight: 600 };
  const s: CSSProperties = { ...st, borderRadius: 3, padding: small ? "5px 10px" : "9px 16px", fontSize: small ? 12.5 : 13.5, cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap", display: "inline-block", textDecoration: "none", fontFamily: "inherit", opacity: disabled ? 0.5 : 1 };
  return href ? <Link href={href} style={s} title={title}>{children}</Link> : <button type={type ?? "submit"} name={name} value={value} style={s} title={title} disabled={disabled}>{children}</button>;
}

export function Grid({ cols, gap = 20, children, style }: { cols: string; gap?: number; children: ReactNode; style?: CSSProperties }) {
  return <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: cols, gap, ...style }}>{children}</div>;
}

export function Dashed({ title, msg, children, maxWidth = 720 }: { title: ReactNode; msg?: ReactNode; children?: ReactNode; maxWidth?: number }) {
  return (
    <div style={{ background: C.card, border: `1px dashed ${C.dashed}`, borderRadius: 6, padding: 36, maxWidth }}>
      <div style={{ fontFamily: "var(--font-tight), sans-serif", fontWeight: 800, letterSpacing: "-.02em", fontSize: 26 }}>{title}</div>
      {msg && <div style={{ color: C.body, margin: "8px 0 20px", lineHeight: 1.5 }}>{msg}</div>}
      {children}
    </div>
  );
}

export function Toggle({ on }: { on: boolean }) {
  return (
    <span aria-hidden style={{ width: 44, height: 24, borderRadius: 12, background: on ? "var(--co-btn)" : C.dashed, position: "relative", display: "inline-block", flex: "none" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
    </span>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>{children}</div>;
}

export const muted = { color: C.muted };

/** Form field in the More of Us OS style: small mono label over the input. */
export const inputStyle: CSSProperties = { width: "100%", border: `1px solid ${C.btnLine}`, borderRadius: 3, padding: "10px 12px", fontSize: 14.5, background: "#fff", color: C.ink, fontFamily: "inherit", boxSizing: "border-box" };
export function Field({ label: l, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={label}>{l}</span>
      {children}
      {hint && <span style={{ fontSize: 12, color: C.faint }}>{hint}</span>}
    </label>
  );
}
