import { getGroupContext } from "@/lib/workspace";
import { companiesWith, nameMap } from "@/lib/group-data";
import { GroupHead } from "@/lib/group-head";
import { loadOverview, loadRental } from "@/lib/finance-data";
import { includedInGroupTotals } from "@/domain/dashboard";
import { assessmentYearLabel, financialYear } from "@/domain/periods";
import { formatDate, todayInBusinessTz } from "@/domain/dates";
import { fieldsNeedingReview, type BillExtraction } from "@/integrations/ai/claude";
import { Cta } from "@/components/dp/shell";
import { Modal } from "@/components/dp/modal";
import { C } from "@/components/dp/theme";
import { FinanceExpenses, FinanceOverview, FinanceRental, FinanceTabs, FinanceTax } from "@/views/finance";

type Tab = "overview" | "expenses" | "rental" | "tax";
const TITLE: Record<Tab, string> = { overview: "Finance", expenses: "Expenses & bills", rental: "Rental income", tax: "Tax & GST" };
const go = (slug: string, next: string) => `/switch?to=${slug}&next=${encodeURIComponent(next)}`;
const UNIT_FIELDS = ["Address", "Legal owner / entity", "Co-owners", "Use (residential / commercial)", "Tenant", "Rent amount", "Due date", "Security deposit", "Lease start / end", "Escalation", "Notice / lock-in", "Documents"];

/** Group finance in the design's layouts. Figures add only consolidated companies the viewer may read. */
export async function GroupFinance({ tab, tabs, add }: { tab: Tab; tabs: boolean; add?: boolean }) {
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
  if (tab === "overview") {
    body = <FinanceOverview vm={await loadOverview(g.supabase, cons.map((c) => c.id), today, g.group.fy_start_month, "pipeline",
      [<span key="i" style={{ color: C.muted }}>Included: {cons.map((c) => names.get(c.id)).join(", ") || "none"}. Shown separately: {fin.filter((c) => !includedInGroupTotals(c.consolidation)).map((c) => names.get(c.id)).join(", ") || "none"}.</span>], true)} />;
  } else if (tab === "expenses") {
    const read = companiesWith(g, "documents.read");
    const { data } = read.length ? await g.supabase.from("ocr_extractions").select("status, is_mock, fields, organization_id, document:documents(id, file_name)").in("organization_id", read.map((c) => c.id)).order("created_at", { ascending: false }).limit(40) : { data: [] };
    const slug = new Map(g.registry.map((c) => [c.id, c.slug]));
    const rows = (data ?? []) as unknown as { status: string; is_mock: boolean; fields: BillExtraction; organization_id: string; document: { id: string; file_name: string } }[];
    body = <FinanceExpenses vm={{
      upload: docCos.length ? <div style={{ fontSize: 14, color: C.body, lineHeight: 1.6 }}>{docCos.map((c) => <a key={c.id} href={go(c.slug, `/c/${c.slug}/finance?tab=expenses`)} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${C.line2}`, color: C.ink, textDecoration: "none" }}><span>Upload to {c.name}</span><b style={{ color: "var(--co-side)" }}>Choose files →</b></a>)}</div> : null,
      queue: rows.map((x) => {
        const [s, c] = x.status === "reviewed" ? ["Submitted", "#2F5D4C"] : x.status === "rejected" ? ["Rejected, original kept", C.red] : x.is_mock || x.status === "failed" ? ["Manual entry", C.warnFg2] : fieldsNeedingReview(x.fields).length > 3 ? ["Low confidence", C.red] : ["Needs review", C.warnFg2];
        return { n: `${x.document.file_name} · ${names.get(x.organization_id)}`, s, c, href: go(slug.get(x.organization_id)!, `/c/${slug.get(x.organization_id)}/finance?tab=expenses&bill=${x.document.id}`) };
      }),
      review: null,
    }} />;
  } else if (tab === "rental") {
    const rc = companiesWith(g, "rental.read");
    const r = rc.length ? await loadRental(g.supabase, rc.map((c) => c.id), { start: fy.start, end: fy.end }, today) : null;
    const placeholder = { kpis: [["Rent billed", "Accrual"], ["Rent collected", "Cash"], ["Overdue", "—"], ["Arrears", "—"], ["Security deposits", "Liability, not income"], ["Occupancy", "Needs units"], ["Rental expenses", "—"], ["Net rental cashflow", "—"]].map(([l, s]) => ({ l, v: "₹0", s })),
      units: ["Salon", "Tower"].map((name) => ({ name, ok: false, state: "Needs setup", fields: UNIT_FIELDS.map((f) => [f, null] as [string, null]) })) };
    const vm = r && !r.vm.none ? r.vm : placeholder;
    body = <FinanceRental vm={{ ...vm, none: false, schedule: <div style={{ marginTop: 12, fontSize: 13, color: C.muted }}>{r && r.unpaid.length ? `${r.unpaid.length} rent charge(s) unpaid across units. Record receipts in the owning business's Finance → Rental income.` : "No dues yet. Add tenant and rent to generate a schedule."}</div> }} />;
  } else {
    const { data } = fin.length ? await g.supabase.from("tax_periods").select("organization_id, kind, label, due_on, status, period_start").in("organization_id", fin.map((c) => c.id)).order("due_on") : { data: [] };
    const ps = (data ?? []) as { organization_id: string; kind: string; label: string; due_on: string | null; status: string; period_start: string }[];
    const itr = ps.filter((p) => p.kind === "itr" && p.period_start >= fy.start);
    body = <FinanceTax vm={{
      rows: [
        { n: `ITR · ${assessmentYearLabel(fy.startYear)}`, d: `${fy.label} maps to ${assessmentYearLabel(fy.startYear)}`, s: itr.length && itr.every((p) => p.status === "filed") ? "Filed" : "Not filed", c: itr.length && itr.every((p) => p.status === "filed") ? "#2F5D4C" : C.red },
        { n: "GST return periods", d: "Monthly / quarterly per registration", s: ps.some((p) => p.kind.startsWith("gst")) ? `${ps.filter((p) => p.kind.startsWith("gst") && p.status === "filed").length} of ${ps.filter((p) => p.kind.startsWith("gst")).length} filed` : "Needs confirmation", c: C.muted },
        { n: "TDS references", d: "Where applicable, accountant decides", s: "Pending", c: C.muted },
        ...ps.filter((p) => p.status !== "filed").slice(0, 6).map((p) => ({ n: `${p.label} · ${names.get(p.organization_id)}`, d: `Due ${formatDate(p.due_on)}`, s: p.status.replace(/_/g, " "), c: p.due_on && p.due_on < today ? C.red : C.muted })),
      ],
      ack: <div style={{ marginTop: 14, fontSize: 13.5, color: C.body }}>Filings are recorded per business, with the real acknowledgement number, in that business&apos;s Finance → Tax readiness.</div>,
      pack: { links: fin.map((c) => ({ l: `${c.short_name ?? c.name} CSV`, href: go(c.slug, `/c/${c.slug}/finance/tax/export?register=pack&fy=${fy.startYear}`) })), reviewed: "One pack per legal entity. Reviewed and approved per business." },
      ledgers: fin.map((c) => ({ l: `${c.name}: ledgers & reconciliation`, href: go(c.slug, `/c/${c.slug}/finance?tab=tax`) })),
    }} />;
  }
  return (
    <>
      <GroupHead title={TITLE[tab]} right={cta} />
      {tabs && <FinanceTabs current={tab} base="/group/finance" />}
      {body}
      {add && tab === "expenses" && <Modal title="Upload to which business?" closeHref="/group/expenses">{docCos.map((c) => <a key={c.id} href={go(c.slug, `/c/${c.slug}/finance?tab=expenses`)} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderTop: `1px solid ${C.line2}`, color: C.ink, textDecoration: "none" }}><span>{c.name}</span><span style={{ color: C.faint }}>→</span></a>)}</Modal>}
      {add && tab === "rental" && <Modal title="Which entity owns the unit?" closeHref="/group/rental"><p style={{ fontSize: 13.5, color: C.body, marginTop: 0 }}>A unit belongs to a business and its legal entity. Nothing about owner or tax treatment is assumed from the label.</p>{rentCos.map((c) => <a key={c.id} href={go(c.slug, `/c/${c.slug}/r/rental_units`)} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderTop: `1px solid ${C.line2}`, color: C.ink, textDecoration: "none" }}><span>{c.name}</span><span style={{ color: C.faint }}>→</span></a>)}</Modal>}
    </>
  );
}
