import type { ReactNode } from "react";
import { C } from "@/components/dp/theme";
import { Cta, PageHead } from "@/components/dp/shell";
import { font, side } from "@/components/dp/ui";

export type GroupHomeVM = {
  title: string; fyLabel: string; cta: { label: string; href: string };
  tiles: { l: string; v: ReactNode; s?: string; href?: string }[];
  income: { n: string; t: string; v: ReactNode }[]; expenses: { n: string; t: string; v: ReactNode }[]; rental: { n: string; t: string; v: ReactNode }[];
  portfolio: { name: string; own: string; treat: string; acc: string; status: string; pipe: ReactNode; alert: string; href: string | null }[];
  addHref: string | null;
};

function MoneyCard({ title, rows, footer }: { title: string; rows: GroupHomeVM["income"]; footer?: ReactNode }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px" }}>
      <div style={{ fontFamily: font, fontSize: 20, marginBottom: 6 }}>{title}</div>
      {rows.map((r) => (
        <div key={r.n} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 }}>
          <span>{r.n}<br /><span style={{ fontSize: 11.5, color: C.faint }}>{r.t}</span></span><b style={{ textAlign: "right" }}>{r.v}</b>
        </div>
      ))}
      {footer}
    </div>
  );
}

/** Group Command Centre, exactly as the Company OS design. */
export function GroupHome({ vm }: { vm: GroupHomeVM }) {
  return (
    <>
      <PageHead own="Group Command Centre" treat="Authorised consolidated view" title={vm.title} right={<Cta href={vm.cta.href}>{vm.cta.label}</Cta>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
        {vm.tiles.map((k) => {
          const body = <><div style={{ fontSize: 13, color: C.muted }}>{k.l}</div><div style={{ fontFamily: font, fontSize: 28, marginTop: 6 }}>{k.v}</div>{k.s && <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{k.s}</div>}</>;
          const st = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px 18px", color: "inherit", textDecoration: "none", display: "block" } as const;
          return k.href ? <a key={k.l} href={k.href} style={st}>{body}</a> : <div key={k.l} style={st}>{body}</div>;
        })}
      </div>
      <div style={{ fontFamily: font, fontSize: 24, margin: "28px 0 14px" }}>Money this month and {vm.fyLabel}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        <MoneyCard title="Income" rows={vm.income} />
        <MoneyCard title="Expenses" rows={vm.expenses} />
        <MoneyCard title="Rental income" rows={vm.rental} footer={<a href="/group/rental" style={{ marginTop: 12, display: "inline-block", fontWeight: 600, fontSize: 13.5, color: side, textDecoration: "none" }}>Open rental income →</a>} />
      </div>
      <div style={{ fontFamily: font, fontSize: 24, margin: "28px 0 14px" }}>Portfolio</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: 16 }}>
        {vm.portfolio.map((p) => {
          const body = (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontFamily: font, fontSize: 19, lineHeight: 1.2 }}>{p.name}</div>
                <span style={{ fontSize: 11.5, background: C.soft, color: side, borderRadius: 6, padding: "2px 8px", height: "fit-content", whiteSpace: "nowrap" }}>{p.status}</span>
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>{p.own} · {p.treat}</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 12, fontSize: 13.5 }}><span>Pipeline <b>{p.pipe}</b></span><span style={{ color: C.red, textAlign: "right" }}>{p.alert}</span></div>
            </>
          );
          const st = { background: "#fff", border: `1px solid ${C.line}`, borderTop: `4px solid ${p.acc}`, borderRadius: 14, padding: "18px 20px", color: "inherit", textDecoration: "none", display: "block", cursor: p.href ? "pointer" : "default" } as const;
          return p.href ? <a key={p.name} href={p.href} style={st}>{body}</a> : <div key={p.name} style={st} title="You are not a member of this company">{body}</div>;
        })}
        {vm.addHref && (
          <a href={vm.addHref} style={{ background: "#fff", border: `1px dashed ${C.dashed}`, borderTop: "4px solid #829487", borderRadius: 14, padding: "18px 20px", color: "inherit", textDecoration: "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div style={{ fontFamily: font, fontSize: 19 }}>Additional business (slot)</div><span style={{ fontSize: 11.5, background: C.soft, color: side, borderRadius: 6, padding: "2px 8px", height: "fit-content" }}>Add</span></div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>Not configured · Brief names 9 of 10 businesses</div>
            <div style={{ marginTop: 12, fontSize: 13.5 }}>Nothing is invented. Add it when confirmed →</div>
          </a>
        )}
      </div>
      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px 20px", marginTop: 18, fontSize: 13.5, color: C.body, lineHeight: 1.5 }}>
        Partner channel deal values are never group income; only contracted commission is. Internal transfers are eliminated in consolidated totals. Drill-down needs finance permission.
      </div>
    </>
  );
}
