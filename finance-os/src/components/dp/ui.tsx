import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { C } from "./theme";

/** Building blocks with the exact styles of the Company OS design. Colours that vary per company use --co-side / --co-hi / --co-acc / --co-font. */
export const side = "var(--co-side)";
export const hi = "var(--co-hi)";
export const font = "var(--co-font)";

export const card: CSSProperties = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px" };
export const rowTop: CSSProperties = { borderTop: `1px solid ${C.line2}` };

export function Card({ title, aside, children, style, titleSize = 22 }: { title?: ReactNode; aside?: ReactNode; children?: ReactNode; style?: CSSProperties; titleSize?: number }) {
  return (
    <section style={{ ...card, ...style }}>
      {(title || aside) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          {title && <h2 style={{ fontFamily: font, fontSize: titleSize, fontWeight: 500, margin: 0 }}>{title}</h2>}
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
  return <span style={{ fontSize: 12, fontWeight: 600, borderRadius: 6, padding: "3px 9px", whiteSpace: "nowrap", ...t }}>{children}</span>;
}

export function Tile({ l, v, s, href }: { l: ReactNode; v: ReactNode; s?: ReactNode; href?: string }) {
  const body = (
    <>
      <div style={{ fontSize: 13, color: C.muted }}>{l}</div>
      <div style={{ fontFamily: font, fontSize: 28, marginTop: 6 }}>{v}</div>
      {s && <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{s}</div>}
    </>
  );
  const st: CSSProperties = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px 18px", color: "inherit", textDecoration: "none", display: "block" };
  return href ? <Link href={href} style={st}>{body}</Link> : <div style={st}>{body}</div>;
}

export function Btn({ children, href, primary, onDark, type, name, value, title, disabled, small }: {
  children: ReactNode; href?: string; primary?: boolean; onDark?: boolean; type?: "submit" | "button"; name?: string; value?: string; title?: string; disabled?: boolean; small?: boolean;
}) {
  const st: CSSProperties = primary
    ? { background: onDark ? hi : side, color: onDark ? side : "#fff", border: 0, fontWeight: onDark ? 700 : 600 }
    : { background: "transparent", color: onDark ? "#fff" : side, border: `1px solid ${onDark ? "rgba(255,255,255,.4)" : C.btnLine}`, fontWeight: 600 };
  const s: CSSProperties = { ...st, borderRadius: small ? 7 : 9, padding: small ? "5px 10px" : "9px 16px", fontSize: small ? 12.5 : 13.5, cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap", display: "inline-block", textDecoration: "none", fontFamily: "inherit", opacity: disabled ? 0.5 : 1 };
  return href ? <Link href={href} style={s} title={title}>{children}</Link> : <button type={type ?? "submit"} name={name} value={value} style={s} title={title} disabled={disabled}>{children}</button>;
}

export function Grid({ cols, gap = 20, children, style }: { cols: string; gap?: number; children: ReactNode; style?: CSSProperties }) {
  return <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: cols, gap, ...style }}>{children}</div>;
}

export function Dashed({ title, msg, children, maxWidth = 720 }: { title: ReactNode; msg?: ReactNode; children?: ReactNode; maxWidth?: number }) {
  return (
    <div style={{ background: "#fff", border: `1px dashed ${C.dashed}`, borderRadius: 16, padding: 36, maxWidth }}>
      <div style={{ fontFamily: font, fontSize: 28 }}>{title}</div>
      {msg && <div style={{ color: C.body, margin: "8px 0 20px", lineHeight: 1.5 }}>{msg}</div>}
      {children}
    </div>
  );
}

export function Toggle({ on }: { on: boolean }) {
  return (
    <span aria-hidden style={{ width: 44, height: 24, borderRadius: 12, background: on ? side : C.dashed, position: "relative", display: "inline-block", flex: "none" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
    </span>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>{children}</div>;
}

export const muted = { color: C.muted };
