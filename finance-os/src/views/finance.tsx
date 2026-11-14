import type { ReactNode } from "react";
import { C } from "@/components/dp/theme";
import { font, hi, side } from "@/components/dp/ui";

const card = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px" } as const;
const h = (t: ReactNode, mb = 6) => <div style={{ fontFamily: font, fontSize: 22, fontWeight: 500, marginBottom: mb }}>{t}</div>;
const row = { display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 } as const;
const btn = { border: `1px solid ${C.btnLine}`, borderRadius: 9, padding: "9px 16px", fontSize: 13.5, background: "transparent", cursor: "pointer", color: C.ink, textDecoration: "none", display: "inline-block" } as const;

export function FinanceTabs({ current, base, hide = [] }: { current: string; base: string; hide?: string[] }) {
  const tabs = ([["overview", "Overview"], ["expenses", "Expenses & bills"], ["rental", "Rental income"], ["tax", "Tax readiness"]] as [string, string][]).filter(([k]) => !hide.includes(k));
  return (
    <nav aria-label="Finance" style={{ display: "flex", gap: 6, borderBottom: `1px solid ${C.line}`, marginBottom: 22, flexWrap: "wrap" }}>
      {tabs.map(([k, l]) => (
        <a key={k} href={k === "overview" ? base : `${base}?tab=${k}`} aria-current={current === k ? "page" : undefined}
          style={{ padding: "10px 16px", fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap", textDecoration: "none", borderBottom: `3px solid ${current === k ? side : "transparent"}`, color: current === k ? side : "#6d7a70" }}>{l}</a>
      ))}
    </nav>
  );
}

export type OverviewVM = {
  note: string; fin: { l: string; v: ReactNode; s?: string; href?: string }[]; fyLabel: string;
  trend: { m: string; b: number; c: number }[]; inc: { n: string; v: ReactNode }[]; exp: { n: string; v: ReactNode }[];
  bal: { n: string; t: string; v: ReactNode }[]; links?: ReactNode;
};
const RULES = ["Internal transfers are eliminated in consolidated totals", "Refundable deposits are liabilities, never income", "Partner gross value is not income; contracted commission only", "Multi-currency keeps original amount, FX rate, FX date and converted value"];

export function FinanceOverview({ vm }: { vm: OverviewVM }) {
  const max = Math.max(1, ...vm.trend.flatMap((t) => [t.b, t.c]));
  const px = (n: number) => (n > 0 ? `${Math.max(3, Math.round((n / max) * 150))}px` : "3px");
  return (
    <>
      <div style={{ color: C.body, marginBottom: 18, lineHeight: 1.5, maxWidth: 820 }}>{vm.note}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
        {vm.fin.map((f) => {
          const body = <><div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.muted }}><span>{f.l}</span><span style={{ fontSize: 11, background: C.bg, borderRadius: 5, padding: "1px 7px", minWidth: 18 }}>{f.s ?? ""}</span></div><div style={{ fontFamily: font, fontSize: 32, marginTop: 8 }}>{f.v}</div></>;
          const st = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "18px 20px", color: "inherit", textDecoration: "none", display: "block" } as const;
          return f.href ? <a key={f.l} href={f.href} style={st}>{body}</a> : <div key={f.l} style={st}>{body}</div>;
        })}
      </div>
      <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: 20, marginTop: 20 }}>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontFamily: font, fontSize: 22, fontWeight: 500 }}>Month by month · {vm.fyLabel}</div>
            <div style={{ display: "flex", gap: 14, fontSize: 12.5 }}>
              <span><b style={{ display: "inline-block", width: 10, height: 10, background: side, borderRadius: 3 }} /> Booked (accrual)</span>
              <span><b style={{ display: "inline-block", width: 10, height: 10, background: hi, borderRadius: 3 }} /> Cash received</span>
            </div>
          </div>
          <div role="img" aria-label="Booked and cash received by month" style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 170, marginTop: 18, borderBottom: `1px solid ${C.line}` }}>
            {vm.trend.map((m) => (
              <div key={m.m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: "100%" }}>
                  <div title={`Booked ${m.b}`} style={{ width: 9, borderRadius: "3px 3px 0 0", background: side, height: px(m.b) }} />
                  <div title={`Cash ${m.c}`} style={{ width: 9, borderRadius: "3px 3px 0 0", background: hi, height: px(m.c) }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>{vm.trend.map((m) => <div key={m.m} style={{ flex: 1, textAlign: "center", fontSize: 11.5, color: C.muted }}>{m.m}</div>)}</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 12 }}>FY defaults to 1 Apr–31 Mar and is configurable in Settings. Open the ledger to drill into transactions.</div>
        </div>
        <div style={card}>
          {h("Income split")}{vm.inc.map((r) => <div key={r.n} style={row}><span>{r.n}</span><b>{r.v}</b></div>)}
          <div style={{ fontFamily: font, fontSize: 22, fontWeight: 500, margin: "18px 0 6px" }}>Expenses</div>
          {vm.exp.map((r) => <div key={r.n} style={row}><span>{r.n}</span><b>{r.v}</b></div>)}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20, marginTop: 20 }}>
        <div style={card}>{h("Net result & balances")}{vm.bal.map((r) => <div key={r.n} style={row}><span>{r.n} <span style={{ fontSize: 11, color: C.faint }}>{r.t}</span></span><b>{r.v}</b></div>)}</div>
        <div style={card}>{h("Consolidation rules")}{RULES.map((r) => <div key={r} style={{ padding: "9px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14, lineHeight: 1.45 }}>{r}</div>)}</div>
      </div>
      {vm.links && <div style={{ marginTop: 18, fontSize: 13.5, display: "flex", gap: 18, flexWrap: "wrap" }}>{vm.links}</div>}
    </>
  );
}

export type BillField = { l: string; v: string; c: "High" | "Check" | "Low" | "Missing" };
export type ExpensesVM = {
  upload: ReactNode | null; queue: { n: string; s: string; c: string; href: string }[];
  review: null | { title: string; state: string; stateBg: string; stateFg: string; original: ReactNode; duplicate?: string; fields: BillField[]; actions: ReactNode; note?: string };
};
const CONF: Record<BillField["c"], [string, string]> = { High: [C.soft, "var(--co-side)"], Check: [C.warnBg, C.warnFg], Low: [C.redBg, C.red], Missing: [C.redBg, C.red] };

export function FinanceExpenses({ vm }: { vm: ExpensesVM }) {
  return (
    <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {vm.upload && <div style={card}>{h("Upload Bill / Receipt", 12)}{vm.upload}<div style={{ fontSize: 12.5, color: C.muted, marginTop: 10 }}>Originals stay in private storage. Nothing posts without finance approval.</div></div>}
        <div style={card}>
          {h("Review queue")}
          {vm.queue.length === 0 && <div style={{ ...row, color: C.muted }}>No bills waiting. Upload one to start.</div>}
          {vm.queue.map((q, i) => <a key={i} href={q.href} style={{ ...row, padding: "11px 0", color: "inherit", textDecoration: "none" }}><span>{q.n}</span><span style={{ fontWeight: 600, color: q.c }}>{q.s}</span></a>)}
        </div>
      </div>
      <div style={card}>
        {vm.review ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontFamily: font, fontSize: 22, fontWeight: 500 }}>Review: {vm.review.title}</div>
              <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 9px", background: vm.review.stateBg, color: vm.review.stateFg }}>{vm.review.state}</span>
            </div>
            <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,.9fr) minmax(0,1.3fr)", gap: 18, marginTop: 16 }}>
              {vm.review.original}
              <div>
                {vm.review.duplicate && <div style={{ background: C.redBg, color: C.red, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 10 }}>{vm.review.duplicate}</div>}
                {vm.review.note && <div style={{ background: C.warnBg, color: C.warnFg, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 10 }}>{vm.review.note}</div>}
                {vm.review.fields.map((x) => (
                  <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${C.line2}`, fontSize: 13.5 }}>
                    <span style={{ width: 118, color: C.muted, flex: "none" }}>{x.l}</span><span style={{ flex: 1, fontWeight: 600 }}>{x.v}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, borderRadius: 5, padding: "2px 7px", background: CONF[x.c][0], color: CONF[x.c][1] }}>{x.c}</span>
                  </div>
                ))}
                <div style={{ fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>Category, entity and rental-unit are suggestions only, not tax advice. ITC and deductibility are decided by your accountant.</div>
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>{vm.review.actions}</div>
              </div>
            </div>
          </>
        ) : (
          <>{h("Review")}<div style={{ fontSize: 14, color: C.muted }}>Choose a bill from the queue, or upload one. Each bill opens here beside its original.</div></>
        )}
      </div>
    </div>
  );
}

export const billBtn = btn;
export const billPrimary = { ...btn, background: side, color: "#fff", border: 0, fontWeight: 600 } as const;
export const originalBox = { background: "repeating-linear-gradient(135deg,#F1ECDD,#F1ECDD 10px,#E9E3D0 10px,#E9E3D0 20px)", borderRadius: 12, minHeight: 340, display: "grid", placeItems: "center", textAlign: "center", padding: 16, fontSize: 13, color: C.body, lineHeight: 1.5 } as const;

export type RentalVM = {
  none?: boolean; kpis: { l: string; v: ReactNode; s: string }[];
  units: { name: string; state: string; ok: boolean; fields: [string, string | null][] }[];
  schedule: ReactNode; deposits?: ReactNode;
};
const RRULES = ["Refundable deposits sit as liabilities unless lawfully appropriated", "Billed rent is never counted as received", "Each unit has its own owner, tenant, rent, due date and expenses", "More units can be added beyond Salon and Tower"];

export function FinanceRental({ vm }: { vm: RentalVM }) {
  if (vm.none) {
    return (
      <div style={{ background: "#fff", border: `1px dashed ${C.dashed}`, borderRadius: 16, padding: 32, maxWidth: 640 }}>
        <div style={{ fontFamily: font, fontSize: 22, fontWeight: 500 }}>No rental units assigned to this entity</div>
        <div style={{ color: C.body, marginTop: 8, lineHeight: 1.5 }}>Rental units are assigned to an owning entity in the Group workspace. Nothing is assumed.</div>
      </div>
    );
  }
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14 }}>
        {vm.kpis.map((k) => <div key={k.l} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px 18px" }}><div style={{ fontSize: 13, color: C.muted }}>{k.l}</div><div style={{ fontFamily: font, fontSize: 28, marginTop: 6 }}>{k.v}</div><div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{k.s}</div></div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(360px,100%),1fr))", gap: 20, marginTop: 20 }}>
        {vm.units.map((u) => (
          <div key={u.name} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: font, fontSize: 26, fontWeight: 500 }}>{u.name}</div>
              <span style={{ fontSize: 12, background: u.ok ? C.soft : C.warnBg, color: u.ok ? "var(--co-side)" : C.warnFg2, borderRadius: 6, padding: "3px 9px", fontWeight: 600 }}>{u.state}</span>
            </div>
            {u.fields.map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderTop: `1px solid ${C.line2}`, fontSize: 13.5 }}><span style={{ color: C.muted }}>{k}</span><span style={{ color: v ? C.ink : C.faint, textAlign: "right" }}>{v ?? "Not set"}</span></div>)}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: 20, marginTop: 20 }}>
        <div style={card}>{h("Rent schedule & collections")}<div style={{ fontSize: 13.5, color: C.body, lineHeight: 1.5 }}>Monthly dues, invoices and receipts, part-payments, late payments, arrears, payment method, reconciliation. Billed is never counted as received.</div>{vm.schedule}</div>
        <div style={card}>{h("Deposits & rules")}{RRULES.map((r) => <div key={r} style={{ padding: "9px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14, lineHeight: 1.45 }}>{r}</div>)}{vm.deposits}</div>
        <div style={card}>{h("Expenses & reports")}<div style={{ fontSize: 13.5, color: C.body, lineHeight: 1.5 }}>Repairs, maintenance, property tax, association charges, insurance, utilities, brokerage, legal. Allocated per unit and entity. Statements by unit, entity, month and financial year.</div></div>
      </div>
    </>
  );
}

export type TaxVM = {
  rows: { n: string; d: string; s: string; c: string }[]; ack: ReactNode;
  pack: { links: { l: string; href?: string; why?: string }[]; reviewed: string };
  ledgers: { l: string; href?: string }[];
};

export function FinanceTax({ vm }: { vm: TaxVM }) {
  return (
    <>
      <div style={{ background: C.warnBg, color: C.warnFg, borderRadius: 10, padding: "12px 16px", fontSize: 13.5, lineHeight: 1.5, marginBottom: 18 }}>Not tax advice. The OS never claims ITC, decides deductibility, sets rental GST treatment, infers TDS, or auto-files. Every pack needs accountant review.</div>
      <div className="dp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 20 }}>
        <div style={card}>
          {h("Filing calendar & status")}
          {vm.rows.map((r, i) => <div key={i} style={{ ...row, padding: "11px 0" }}><span>{r.n}<br /><span style={{ fontSize: 12, color: C.muted }}>{r.d}</span></span><span style={{ fontWeight: 600, color: r.c, whiteSpace: "nowrap" }}>{r.s}</span></div>)}
          {vm.ack}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={card}>
            {h("Accountant pack")}
            <div style={{ fontSize: 13.5, color: C.body, lineHeight: 1.5, marginBottom: 10 }}>Every figure traces to approved ledger rows and original bills.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {vm.pack.links.map((l) => l.href ? <a key={l.l} href={l.href} style={{ border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "7px 14px", fontSize: 13.5, color: C.ink, textDecoration: "none" }}>{l.l}</a>
                : <span key={l.l} title={l.why} aria-disabled="true" style={{ border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "7px 14px", fontSize: 13.5, color: C.faint, cursor: "not-allowed" }}>{l.l}</span>)}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10 }}>{vm.pack.reviewed}</div>
          </div>
          <div style={card}>
            {h("Ledgers & reconciliation")}
            {vm.ledgers.map((r) => r.href ? <a key={r.l} href={r.href} style={{ display: "block", padding: "8px 0", borderTop: `1px solid ${C.line2}`, fontSize: 13.5, color: C.ink, textDecoration: "none" }}>{r.l} <span style={{ color: C.faint }}>→</span></a>
              : <div key={r.l} style={{ padding: "8px 0", borderTop: `1px solid ${C.line2}`, fontSize: 13.5 }}>{r.l}</div>)}
          </div>
        </div>
      </div>
    </>
  );
}
