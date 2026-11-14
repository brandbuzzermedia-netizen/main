import { getGroupContext } from "@/lib/workspace";
import { companiesWith, nameMap } from "@/lib/group-data";
import { GroupHead } from "@/lib/group-head";
import { loadOverview, loadRental } from "@/lib/finance-data";
import { includedInGroupTotals } from "@/domain/dashboard";
import { assessmentYearLabel, financialYear } from "@/domain/periods";
import { todayInBusinessTz } from "@/domain/dates";
import { fieldsNeedingReview, type BillExtraction } from "@/integrations/ai/claude";
import { Cta } from "@/components/dp/shell";
import { Modal } from "@/components/dp/modal";
import { C } from "@/components/dp/theme";
import { CoSelect } from "@/components/dp/co-select";
import { billFields } from "@/lib/bill-fields";
import { originalBox } from "@/views/finance";
import { FinanceExpenses, FinanceOverview, FinanceRental, FinanceTabs, FinanceTax } from "@/views/finance";

type Tab = "overview" | "expenses" | "rental" | "tax";
const TITLE: Record<Tab, string> = { overview: "Finance", expenses: "Expenses & bills", rental: "Rental income", tax: "Tax & GST" };
const go = (slug: string, next: string) => `/switch?to=${slug}&next=${encodeURIComponent(next)}`;
const UNIT_FIELDS = ["Address", "Legal owner / entity", "Co-owners", "Use (residential / commercial)", "Tenant", "Rent amount", "Due date", "Security deposit", "Lease start / end", "Escalation", "Notice / lock-in", "Documents"];

/** Group finance in the design's layouts. Figures add only consolidated companies the viewer may read. */
export async function GroupFinance({ tab, tabs, add, co }: { tab: Tab; tabs: boolean; add?: boolean; co?: string }) {
  const g = await getGroupContext();
  const today = todayInBusinessTz();
  const fy = financialYear(today, g.group.fy_start_month);
  const fin = companiesWith(g, "finance.read");
  const cons = fin.filter((c) => includedInGroupTotals(c.consolidation));
  const names = nameMap(g.registry);
  const docCos = companiesWith(g, "documents.write");
  const rentCos = companiesWith(g, "rental.write");
  const cta = tab === "expenses" || tab === "overview" ? (docCos.length ? <Cta href="/group/expenses?add=1">Upload bill / receipt</Cta> : undefined)
    : tab === "rental" && rentCos.length ? <Cta href="/group/rental?add=1">+ Add</Cta> : undefined;
  let body: React.ReactNode = null;
  let taxPicker: React.ReactNode = null;
  if (tab === "overview") {
    body = <FinanceOverview vm={await loadOverview(g.supabase, cons.map((c) => c.id), today, g.group.fy_start_month, "pipeline",
      [<span key="i" style={{ color: C.muted }}>Included: {cons.map((c) => names.get(c.id)).join(", ") || "none"}. Shown separately: {fin.filter((c) => !includedInGroupTotals(c.consolidation)).map((c) => names.get(c.id)).join(", ") || "none"}.</span>], true)} />;
  } else if (tab === "expenses") {
    const read = companiesWith(g, "documents.read");
    const { data } = read.length ? await g.supabase.from("ocr_extractions").select("status, is_mock, fields, organization_id, document:documents(id, file_name)").in("organization_id", read.map((c) => c.id)).order("created_at", { ascending: false }).limit(40) : { data: [] };
    const slug = new Map(g.registry.map((c) => [c.id, c.slug]));
    const rows = (data ?? []) as unknown as { status: string; is_mock: boolean; fields: BillExtraction; organization_id: string; document: { id: string; file_name: string } }[];
    body = <FinanceExpenses vm={{
      upload: docCos.length ? (() => {
        const pick = docCos.find((c) => c.slug === co) ?? docCos[0];
        return (
          <>
            <div style={{ marginBottom: 12 }}><CoSelect options={docCos.map((c) => ({ slug: c.slug, name: c.name }))} value={pick.slug} label="Upload to" /></div>
            <a href={go(pick.slug, `/c/${pick.slug}/finance?tab=expenses`)} style={{ display: "block", border: "1.5px dashed #cfc8b5", borderRadius: 12, padding: 26, textAlign: "center", color: "#55605a", fontSize: 14, lineHeight: 1.6, textDecoration: "none" }}>
              <b style={{ color: "var(--co-side)" }}>Choose files</b> or drop here<br />Photos, scans, PDFs · multi-page · batch
            </a>
          </>
        );
      })() : null,
      queue: rows.map((x) => {
        const [s, c] = x.status === "reviewed" ? ["Submitted", "#2F5D4C"] : x.status === "rejected" ? ["Rejected, original kept", C.red] : x.is_mock || x.status === "failed" ? ["Manual entry", C.warnFg2] : fieldsNeedingReview(x.fields).length > 3 ? ["Low confidence", C.red] : ["Needs review", C.warnFg2];
        return { n: `${x.document.file_name} · ${names.get(x.organization_id)}`, s, c, href: go(slug.get(x.organization_id)!, `/c/${slug.get(x.organization_id)}/finance?tab=expenses&bill=${x.document.id}`) };
      }),
      review: (() => {
        const first = rows.find((x) => x.status !== "reviewed" && x.status !== "rejected");
        if (!first) return null;
        const sl = slug.get(first.organization_id)!;
        const open = go(sl, `/c/${sl}/finance?tab=expenses&bill=${first.document.id}`);
        const manual = first.is_mock || first.status === "failed";
        return {
          title: first.document.file_name, state: manual ? "Manual entry" : "Needs review", stateBg: C.warnBg, stateFg: C.warnFg,
          original: <div style={originalBox}>Original bill<br /><span style={{ fontSize: 11.5 }}>Opens beside the fields in {names.get(first.organization_id)}</span></div>,
          note: manual ? "Fields were not read automatically. Enter them by hand beside the original." : undefined,
          fields: billFields(first.fields),
          actions: <a href={open} style={{ display: "inline-block", background: "var(--co-side)", color: "#fff", borderRadius: 8, padding: "9px 16px", fontWeight: 600, fontSize: 13.5, textDecoration: "none" }}>Open review in {names.get(first.organization_id)} →</a>,
        };
      })(),
    }} />;
  } else if (tab === "rental") {
    const rc = companiesWith(g, "rental.read");
    const r = rc.length ? await loadRental(g.supabase, rc.map((c) => c.id), { start: fy.start, end: fy.end }, today) : null;
    const placeholder = { kpis: [["Rent billed", "Accrual"], ["Rent collected", "Cash"], ["Overdue", "—"], ["Arrears", "—"], ["Security deposits", "Liability, not income"], ["Occupancy", "Needs units"], ["Rental expenses", "—"], ["Net rental cashflow", "—"]].map(([l, s]) => ({ l, v: "₹0", s })),
      units: ["Salon", "Tower"].map((name) => ({ name, ok: false, state: "Needs setup", fields: UNIT_FIELDS.map((f) => [f, null] as [string, null]) })) };
    const vm = r && !r.vm.none ? r.vm : placeholder;
    body = <FinanceRental vm={{ ...vm, none: false, schedule: <div style={{ marginTop: 12, fontSize: 13, color: C.muted }}>{r && r.unpaid.length ? `${r.unpaid.length} rent charge(s) unpaid across units. Record receipts in the owning business's Finance → Rental income.` : "No dues yet. Add tenant and rent to generate a schedule."}</div> }} />;
  } else {
    const pick = fin.find((c) => c.slug === co) ?? fin[0];
    const [{ data }, docs, acct] = fin.length ? await Promise.all([
      g.supabase.from("tax_periods").select("organization_id, kind, label, due_on, status, period_start").in("organization_id", fin.map((c) => c.id)).order("due_on"),
      g.supabase.from("ocr_extractions").select("id", { count: "exact", head: true }).in("organization_id", fin.map((c) => c.id)).in("status", ["extracted", "failed"]),
      g.supabase.from("memberships").select("id", { count: "exact", head: true }).in("organization_id", fin.map((c) => c.id)).eq("role", "accountant"),
    ]) : [{ data: [] }, { count: 0 }, { count: 0 }];
    const ps = (data ?? []) as { organization_id: string; kind: string; label: string; due_on: string | null; status: string; period_start: string }[];
    const itr = ps.filter((p) => p.kind === "itr" && p.period_start >= fy.start);
    const filed = itr.length > 0 && itr.every((p) => p.status === "filed");
    const ex = (reg: string) => pick ? go(pick.slug, `/c/${pick.slug}/finance/tax/export?register=${reg}&fy=${fy.startYear}`) : undefined;
    const to = (next: string) => pick ? go(pick.slug, next.replace("@", `/c/${pick.slug}`)) : undefined;
    body = <FinanceTax vm={{
      rows: [
        { n: `ITR · ${assessmentYearLabel(fy.startYear)}`, d: `${fy.label} maps to ${assessmentYearLabel(fy.startYear)}`, s: filed ? "Filed" : "Not filed", c: filed ? "#2F5D4C" : C.red },
        { n: "GST return periods", d: "Monthly / quarterly per registration", s: ps.some((p) => p.kind.startsWith("gst")) ? `${ps.filter((p) => p.kind.startsWith("gst") && p.status === "filed").length} of ${ps.filter((p) => p.kind.startsWith("gst")).length} filed` : "Needs confirmation", c: C.muted },
        { n: "TDS references", d: "Where applicable, accountant decides", s: "Pending", c: C.muted },
        { n: "Accountant", d: acct.count ? `${acct.count} with granted periods` : "Not assigned", s: acct.count ? "Assigned" : "Assign", c: acct.count ? "#2F5D4C" : C.muted },
        { n: "Pending documents", d: "Bills awaiting approval", s: `${docs.count ?? 0} pending`, c: docs.count ? C.warnFg2 : C.muted },
      ],
      ack: <div style={{ marginTop: 14 }}>
        {pick && <a href={to("@/finance?tab=tax")} style={{ display: "inline-block", fontSize: 13.5, color: "var(--co-side)", fontWeight: 600 }}>Record a filing with its acknowledgement number in {pick.name} →</a>}
        {!filed && <div style={{ marginTop: 8, fontWeight: 700, fontSize: 14, color: C.red }}>Not marked filed. Needs a real acknowledgement number.</div>}
      </div>,
      pack: { links: [{ l: "CSV", href: ex("pack") }, { l: "XLSX", why: "Not built yet: the CSV opens in Excel" }, { l: "PDF", why: "Not built yet: use the CSV for now" }],
        reviewed: pick ? `For ${pick.name}. One pack per legal entity, reviewed per business.` : "No business with finance access." },
      ledgers: [
        { l: "Income / sales", href: ex("income") }, { l: "Rent", href: to("@/finance?tab=rental") }, { l: "Purchases & expenses", href: ex("expense") }, { l: "GST summary", href: ex("gst") },
        { l: "TDS references" }, { l: "Fixed assets & depreciation" }, { l: "Receivables / payables", href: to("@/finance/ledger") },
        { l: "Bank reconciliation vs statement", href: to("@/receivables/payments/import") }, { l: "Source-document index", href: to("@/vault") },
      ],
    }} />;
    if (fin.length > 1) taxPicker = <CoSelect options={fin.map((c) => ({ slug: c.slug, name: c.name }))} value={pick.slug} />;
  }
  return (
    <>
      <GroupHead title={TITLE[tab]} right={taxPicker ?? cta} />
      {tabs && <FinanceTabs current={tab} base="/group/finance" />}
      {body}
      {add && tab === "expenses" && <Modal title="Upload to which business?" closeHref="/group/expenses">{docCos.map((c) => <a key={c.id} href={go(c.slug, `/c/${c.slug}/finance?tab=expenses`)} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderTop: `1px solid ${C.line2}`, color: C.ink, textDecoration: "none" }}><span>{c.name}</span><span style={{ color: C.faint }}>→</span></a>)}</Modal>}
      {add && tab === "rental" && <Modal title="Which entity owns the unit?" closeHref="/group/rental"><p style={{ fontSize: 13.5, color: C.body, marginTop: 0 }}>A unit belongs to a business and its legal entity. Nothing about owner or tax treatment is assumed from the label.</p>{rentCos.map((c) => <a key={c.id} href={go(c.slug, `/c/${c.slug}/r/rental_units`)} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderTop: `1px solid ${C.line2}`, color: C.ink, textDecoration: "none" }}><span>{c.name}</span><span style={{ color: C.faint }}>→</span></a>)}</Modal>}
    </>
  );
}
