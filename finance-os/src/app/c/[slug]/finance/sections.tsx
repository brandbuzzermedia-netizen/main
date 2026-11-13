import type { CompanyContext } from "@/lib/workspace";
import { loadRental } from "@/lib/finance-data";
import { fieldsNeedingReview, type BillExtraction } from "@/integrations/ai/claude";
import { parseMoneyToMinor, formatShort } from "@/domain/money";
import { assessmentYearLabel, financialYear } from "@/domain/periods";
import { addDays, formatDate, todayInBusinessTz } from "@/domain/dates";
import { FinanceExpenses, FinanceRental, FinanceTax, billBtn, billPrimary, originalBox, type BillField } from "@/views/finance";
import { Modal } from "@/components/dp/modal";
import { C } from "@/components/dp/theme";
import { ReviewForm, UploadBox, type ReviewField } from "../bills/forms";
import { rejectBillAction, rescanAction } from "../bills/actions";
import { depositAction, generateChargesAction, receiptAction } from "../rental/actions";
import { recordFilingAction } from "./tax/actions";

const small = { border: `1px solid ${C.btnLine}`, borderRadius: 7, padding: "5px 8px", fontSize: 12.5, background: "#fff" } as const;
type Ex = { id: string; status: string; is_mock: boolean; error: string | null; fields: BillExtraction; created_at: string; document: { id: string; file_name: string; storage_path: string; mime_type: string } };

function chip(...fs: ({ value: string | null; confidence: number } | undefined)[]): BillField["c"] {
  if (fs.some((f) => !f || f.value === null)) return "Missing";
  const m = Math.min(...fs.map((f) => f!.confidence));
  return m >= 0.85 ? "High" : m >= 0.6 ? "Check" : "Low";
}

export async function ExpensesSection({ ctx, bill, edit }: { ctx: CompanyContext; bill?: string; edit?: boolean }) {
  const slug = ctx.company.slug;
  const base = `/c/${slug}/finance?tab=expenses`;
  const { data } = await ctx.supabase.from("ocr_extractions").select("id, status, is_mock, error, fields, created_at, document:documents(id, file_name, storage_path, mime_type)")
    .eq("organization_id", ctx.company.id).order("created_at", { ascending: false }).limit(60);
  const all = (data ?? []) as unknown as Ex[];
  const latest = new Map<string, Ex>();
  for (const x of all) if (!latest.has(x.document.id)) latest.set(x.document.id, x);
  const list = [...latest.values()];
  const { data: posted } = list.length ? await ctx.supabase.from("ledger_entries").select("source_document_id, status").in("source_document_id", list.map((x) => x.document.id)) : { data: [] };
  const postedBy = new Map((posted ?? []).map((p) => [p.source_document_id as string, p.status as string]));
  const label = (x: Ex): [string, string] => {
    const st = postedBy.get(x.document.id);
    if (st) return st === "pending_approval" ? ["Waiting for approval", C.warnFg2] : ["Approved and posted", "#2F5D4C"];
    if (x.status === "rejected") return ["Rejected, original kept", C.red];
    if (x.status === "failed" || x.is_mock) return ["Manual entry", C.warnFg2];
    return fieldsNeedingReview(x.fields).length > 3 ? ["Low confidence", C.red] : ["Needs review", C.warnFg2];
  };
  const sel = list.find((x) => x.document.id === bill) ?? list.find((x) => !postedBy.get(x.document.id) && x.status !== "rejected");
  let review = null as Parameters<typeof FinanceExpenses>[0]["vm"]["review"];
  let modal = null;
  if (sel) {
    const f = sel.fields;
    const [signed, dup, entities, units] = await Promise.all([
      ctx.supabase.storage.from("documents").createSignedUrl(sel.document.storage_path, 300),
      f.vendor_name?.value ? ctx.supabase.rpc("possible_duplicate_bills", { p_org: ctx.company.id, p_vendor: f.vendor_name.value, p_bill_number: f.bill_number?.value ?? null, p_date: f.bill_date?.value ?? "1900-01-01",
        p_amount_minor: (() => { try { return f.total?.value ? parseMoneyToMinor(f.total.value) : -1; } catch { return -1; } })() }) : Promise.resolve({ data: [] }),
      ctx.supabase.from("legal_entities").select("id, name").eq("organization_id", ctx.company.id),
      ctx.supabase.from("rental_units").select("id, label").eq("organization_id", ctx.company.id),
    ]);
    const dups = ((dup.data ?? []) as { reason: string; description: string }[]).filter((d) => !postedBy.get(sel.document.id));
    const [state, color] = label(sel);
    const v = (x?: { value: string | null }) => x?.value ?? null;
    const fields: BillField[] = [
      { l: "Vendor", v: v(f.vendor_name) ?? "Not found", c: chip(f.vendor_name) },
      { l: "GSTIN", v: v(f.vendor_gstin) ?? "Not printed", c: chip(f.vendor_gstin) },
      { l: "Bill no. / date", v: [v(f.bill_number), v(f.bill_date) && formatDate(v(f.bill_date))].filter(Boolean).join(" · ") || "Not found", c: chip(f.bill_number, f.bill_date) },
      { l: "Taxable value", v: v(f.taxable_value) ? `₹${v(f.taxable_value)}` : "Not found", c: chip(f.taxable_value) },
      { l: "CGST / SGST", v: `${v(f.cgst) ?? "—"} / ${v(f.sgst) ?? "—"}`, c: chip(f.cgst, f.sgst) },
      { l: "IGST / cess", v: `${v(f.igst) ?? "—"} / ${v(f.cess) ?? "—"}`, c: chip(f.igst, f.cess) === "Missing" ? "Low" : chip(f.igst, f.cess) },
      { l: "Total", v: v(f.total) ? `₹${v(f.total)}` : "Not found", c: chip(f.total) },
      { l: "Currency", v: v(f.currency) ?? "INR", c: f.currency?.value ? chip(f.currency) : "Check" },
      { l: "Due date", v: v(f.due_date) ? formatDate(v(f.due_date)) : "Not found", c: chip(f.due_date) },
      { l: "Suggested category", v: v(f.suggested_category) ? `${v(f.suggested_category)} (suggestion)` : "None", c: f.suggested_category?.value ? "Low" : "Missing" },
      { l: "Entity / unit", v: "Chosen on review", c: "Low" },
    ];
    const url = signed.data?.signedUrl;
    const done = Boolean(postedBy.get(sel.document.id)) || sel.status === "rejected";
    review = {
      title: sel.document.file_name, state, stateBg: color === C.red ? C.redBg : color === "#2F5D4C" ? C.soft : C.warnBg, stateFg: color,
      original: url ? (sel.document.mime_type === "application/pdf"
        ? <iframe title="Original bill" src={url} style={{ ...originalBox, border: 0, width: "100%", height: 420 }} />
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link to a private file
        : <img src={url} alt="Original bill" style={{ ...originalBox, width: "100%", objectFit: "contain", display: "block" }} />)
        : <div style={originalBox}>Original bill could not be opened right now.<br /><span style={{ fontSize: 11.5 }}>It is kept; try again.</span></div>,
      duplicate: dups.length ? `Possible duplicate: ${dups[0].reason.toLowerCase()} as an earlier bill. Review before posting.` : undefined,
      note: sel.is_mock || sel.status === "failed" ? (sel.error ?? "Fields were not read automatically. Use Manual entry beside the original.") : undefined,
      fields,
      actions: done ? <a href={`/c/${slug}/finance/ledger`} style={billBtn}>Open in ledger</a> : (
        <>
          <a href={`${base}&bill=${sel.document.id}&edit=1`} style={billPrimary}>Edit & approve to post</a>
          <form action={rejectBillAction.bind(null, slug)}><input type="hidden" name="extraction_id" value={sel.id} /><button style={billBtn}>Reject</button></form>
          <form action={rescanAction.bind(null, slug)}><input type="hidden" name="document_id" value={sel.document.id} /><button style={billBtn}>Rescan</button></form>
          <a href={`${base}&bill=${sel.document.id}&edit=1`} style={billBtn}>Manual entry</a>
        </>
      ),
    };
    if (edit && !done && ctx.can("finance.write")) {
      const need = new Set(fieldsNeedingReview(f));
      const map: [keyof BillExtraction, string, ("date" | undefined)?][] = [["vendor_name", "Vendor"], ["vendor_gstin", "Vendor GSTIN"], ["bill_number", "Bill number"], ["bill_date", "Bill date", "date"], ["due_date", "Due date", "date"],
        ["cgst", "CGST"], ["sgst", "SGST"], ["igst", "IGST"], ["cess", "Cess"], ["total", "Total (incl. tax)"], ["place_of_supply", "Place of supply"], ["suggested_category", "Suggested category"]];
      const rf: ReviewField[] = map.map(([k, l, t]) => { const x = f[k] as { value: string | null; confidence: number } | undefined; return { key: k, label: l, type: t, value: x?.value ?? "", confidence: x?.confidence ?? 0, needsCheck: need.has(k as never) && ["vendor_name", "bill_date", "total"].includes(k) }; });
      modal = (
        <Modal title={`Review ${sel.document.file_name}`} closeHref={`${base}&bill=${sel.document.id}`}>
          <ReviewForm slug={slug} docId={sel.document.id} extractionId={sel.id} fields={rf} duplicates={dups.map((d) => `${d.reason}: ${d.description}`)}
            entities={(entities.data ?? []).map((e) => ({ id: e.id as string, label: e.name as string }))} units={(units.data ?? []).map((u) => ({ id: u.id as string, label: u.label as string }))} />
        </Modal>
      );
    }
  }
  return (
    <>
      <FinanceExpenses vm={{
        upload: ctx.can("documents.write") ? <UploadBox slug={slug} /> : null,
        queue: list.slice(0, 12).map((x) => { const [s, c] = label(x); return { n: x.document.file_name, s, c, href: `${base}&bill=${x.document.id}` }; }),
        review,
      }} />
      {modal}
    </>
  );
}

export async function RentalSection({ ctx }: { ctx: CompanyContext }) {
  const slug = ctx.company.slug;
  const today = todayInBusinessTz();
  const fy = financialYear(today, ctx.company.fy_start_month);
  const { vm, unpaid, labels, leases } = await loadRental(ctx.supabase, [ctx.company.id], { start: fy.start, end: fy.end }, today);
  const w = ctx.can("rental.write");
  const charges = unpaid.slice(0, 8);
  return (
    <FinanceRental vm={{
      ...vm,
      schedule: (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          {charges.length === 0 ? <div style={{ color: C.muted }}>{leases.length ? "No dues outstanding." : "No dues yet. Add tenant and rent to generate a schedule."}</div> : charges.map((c) => (
            <div key={c.id} style={{ padding: "8px 0", borderTop: `1px solid ${C.line2}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>{labels.get(c.unit_id)} · due {formatDate(c.due_on)}</span><b style={{ color: c.due_on < today ? C.red : C.ink }}>{formatShort(c.amount_minor - c.received_minor)}</b></div>
              {w && (
                <form action={receiptAction.bind(null, slug)} style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                  <input type="hidden" name="charge_id" value={c.id} />
                  <input name="amount" defaultValue={((c.amount_minor - c.received_minor) / 100).toFixed(2)} aria-label="Amount" style={{ ...small, width: 90 }} />
                  <input type="date" name="on" defaultValue={today} aria-label="Date" style={small} />
                  <select name="method" aria-label="Method" style={small}><option>upi</option><option>neft</option><option>imps</option><option>cheque</option><option>cash</option></select>
                  <input name="reference" required placeholder="Reference" aria-label="Reference" style={{ ...small, width: 100 }} />
                  <button style={{ ...small, cursor: "pointer", fontWeight: 600 }}>Record receipt</button>
                </form>
              )}
            </div>
          ))}
          {w && <form action={generateChargesAction.bind(null, slug)} style={{ marginTop: 12 }}><button style={{ ...billBtn, padding: "7px 12px" }}>Generate rent due this month</button></form>}
          {w && <div style={{ marginTop: 10 }}><a href={`/c/${slug}/r/leases`} style={{ color: "var(--co-side)", fontWeight: 600 }}>Tenants and leases →</a></div>}
        </div>
      ),
      deposits: w && leases.length ? (
        <form action={depositAction.bind(null, slug)} style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10 }}>
          <select name="lease_id" aria-label="Lease" style={small}>{leases.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
          <select name="kind" aria-label="Movement" style={small}><option value="received">Received</option><option value="refunded">Refunded</option><option value="appropriated">Appropriated</option></select>
          <input name="amount" required placeholder="Amount" aria-label="Amount" style={{ ...small, width: 90 }} />
          <input type="date" name="on" defaultValue={today} aria-label="Date" style={small} />
          <button style={{ ...small, cursor: "pointer", fontWeight: 600 }}>Record deposit</button>
        </form>
      ) : undefined,
    }} />
  );
}

export async function TaxSection({ ctx }: { ctx: CompanyContext }) {
  const slug = ctx.company.slug;
  const today = todayInBusinessTz();
  const fy = financialYear(today, ctx.company.fy_start_month);
  const [periods, grants, pending] = await Promise.all([
    ctx.supabase.from("tax_periods").select("id, kind, label, due_on, status, ack_reference, period_start").eq("organization_id", ctx.company.id).order("due_on"),
    ctx.supabase.from("accountant_grants").select("user:users(full_name, email)").eq("organization_id", ctx.company.id).limit(1),
    ctx.supabase.from("ocr_extractions").select("id", { count: "exact", head: true }).eq("organization_id", ctx.company.id).in("status", ["extracted", "failed"]),
  ]);
  const ps = (periods.data ?? []) as { id: string; kind: string; label: string; due_on: string | null; status: string; ack_reference: string | null; period_start: string }[];
  const itr = ps.find((p) => p.kind === "itr" && p.period_start >= fy.start);
  const gst = ps.filter((p) => p.kind.startsWith("gst") && p.period_start >= fy.start);
  const tds = ps.filter((p) => p.kind === "tds_quarterly" && p.period_start >= fy.start);
  const acct = (grants.data?.[0] as unknown as { user: { full_name: string | null; email: string } } | undefined)?.user;
  const upcoming = ps.filter((p) => p.status !== "filed" && p.due_on && p.due_on <= addDays(today, 45)).slice(0, 4);
  const open = ps.filter((p) => p.status !== "filed");
  const ex = (r: string) => `/c/${slug}/finance/tax/export?register=${r}&fy=${fy.startYear}`;
  const reviewed = ps.some((p) => ["in_review", "ready_to_file"].includes(p.status));
  return (
    <FinanceTax vm={{
      rows: [
        { n: `ITR · ${assessmentYearLabel(fy.startYear)}`, d: `${fy.label} maps to ${assessmentYearLabel(fy.startYear)}`, s: itr?.status === "filed" ? `Filed · ${itr.ack_reference}` : "Not filed", c: itr?.status === "filed" ? "#2F5D4C" : C.red },
        { n: "GST return periods", d: "Monthly / quarterly per registration", s: gst.length ? `${gst.filter((g) => g.status === "filed").length} of ${gst.length} filed` : "Needs confirmation", c: C.muted },
        { n: "TDS references", d: "Where applicable, accountant decides", s: tds.length ? `${tds.filter((g) => g.status === "filed").length} of ${tds.length} filed` : "Pending", c: C.muted },
        { n: "Accountant", d: acct ? (acct.full_name || acct.email) : "Not assigned", s: acct ? "Assigned" : "Assign", c: C.muted },
        { n: "Pending documents", d: "Bills awaiting approval", s: `${pending.count ?? 0} pending`, c: C.muted },
        ...upcoming.map((p) => ({ n: p.label, d: `Due ${formatDate(p.due_on)}`, s: p.status.replace(/_/g, " "), c: p.due_on && p.due_on < today ? C.red : C.muted })),
      ],
      ack: (
        <>
          {ctx.can("finance.approve") && open.length > 0 ? (
            <form action={recordFilingAction.bind(null, slug)}>
              <div style={{ marginTop: 14, fontSize: 13, color: C.muted }}>Acknowledgement / reference number</div>
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <select name="id" aria-label="Return" style={{ border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "10px 12px", fontSize: 14 }}>{open.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
                <input name="ack" required minLength={5} placeholder="Paste real acknowledgement number" aria-label="Acknowledgement number" style={{ flex: 1, minWidth: 200, border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "10px 12px", fontSize: 14 }} />
                <input type="date" name="filed_on" defaultValue={today} aria-label="Filed on" style={{ border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "10px 12px", fontSize: 14 }} />
                <button style={{ ...billPrimary, padding: "10px 16px" }}>Mark filed</button>
              </div>
              <div style={{ marginTop: 8, fontWeight: 700, fontSize: 14, color: C.red }}>Not marked filed. Needs a real acknowledgement number.</div>
            </form>
          ) : <div style={{ marginTop: 14, fontWeight: 700, fontSize: 14, color: C.red }}>Not marked filed. Needs a real acknowledgement number.</div>}
          <a href={`/c/${slug}/finance/tax`} style={{ display: "inline-block", marginTop: 12, fontSize: 13.5, color: "var(--co-side)", fontWeight: 600 }}>Manage periods and accountant access →</a>
        </>
      ),
      pack: { links: [{ l: "CSV", href: ex("pack") }, { l: "XLSX", why: "Not built yet: the CSV opens in Excel" }, { l: "PDF", why: "Not built yet: use the CSV for now" }],
        reviewed: `Reviewed by: ${reviewed ? (acct?.full_name || acct?.email || "accountant") : "nobody yet"} · Approved: ${ps.some((p) => p.status === "filed") ? "yes, for filed periods" : "no"}` },
      ledgers: [
        { l: "Income / sales", href: ex("income") }, { l: "Rent", href: `/c/${slug}/finance?tab=rental` }, { l: "Purchases & expenses", href: ex("expense") }, { l: "GST summary", href: ex("gst") },
        { l: "TDS references" }, { l: "Fixed assets & depreciation" }, { l: "Receivables / payables", href: `/c/${slug}/finance/ledger` },
        { l: "Bank reconciliation vs statement", href: `/switch?to=${slug}&next=/payments/import` }, { l: "Source-document index", href: `/c/${slug}/vault` },
      ],
    }} />
  );
}
