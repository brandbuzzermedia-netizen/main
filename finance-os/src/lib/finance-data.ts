import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { financialYear } from "@/domain/periods";
import { formatShort } from "@/domain/money";
import { dropMatchedTransfers, monthlyBreakdown, summarizeLedger, type LedgerRow } from "@/domain/ledger";
import { rentalReport } from "@/domain/rental";
import { summarizePipeline, type DealRow, type StageRow } from "@/domain/dashboard";
import type { KpiSet } from "@/domain/design";
import type { OverviewVM, RentalVM } from "@/views/finance";

const NO = "—";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Row = LedgerRow & { transfer_group_id: string | null; category: string; due_on: string | null };

/** Finance overview for one or more companies (group: consolidated companies only). Figures are FY to date. */
export async function loadOverview(sb: SupabaseClient, orgIds: string[], today: string, fyStartMonth: number, kpis: KpiSet, links: OverviewVM["links"], hasRental: boolean): Promise<OverviewVM> {
  const fy = financialYear(today, fyStartMonth);
  const P = { start: fy.start, end: fy.end };
  const none = { data: [] as never[] };
  const [inv, pay, led, deals, stages, orders, outlet, comm, agr, rent] = orgIds.length ? await Promise.all([
    sb.from("invoice_balances").select("invoice_date, status, total_minor, outstanding_minor, effective_due_date, currency").in("organization_id", orgIds).or(`outstanding_minor.gt.0,invoice_date.gte.${fy.start}`).limit(20000),
    sb.from("payments").select("payment_date, amount_minor, kind, verification_status, currency").in("organization_id", orgIds).eq("verification_status", "verified").gte("payment_date", fy.start).limit(20000),
    sb.from("ledger_entries").select("id, organization_id, entry_type, status, txn_date, accounting_date, amount_minor, base_amount_minor, settled_minor, settled_on, currency, transfer_group_id, category, due_on").in("organization_id", orgIds).in("status", ["approved", "partially_settled", "settled"]).limit(20000),
    sb.from("deals").select("id, organization_id, title, account_name, stage_id, value_minor, currency, owner_id, is_hot, expected_close_on, next_action, next_action_on, last_activity_at, closed_at").in("organization_id", orgIds).limit(10000),
    sb.from("pipeline_stages").select("id, organization_id, name, position, kind, probability_pct").in("organization_id", orgIds),
    kpis === "products" ? sb.from("orders").select("kind, status, advance_received_minor").in("organization_id", orgIds) : Promise.resolve(none),
    kpis === "restaurant" ? sb.from("outlet_daily_sales").select("gross_minor, platform_commission_minor").in("organization_id", orgIds).gte("sale_date", fy.start) : Promise.resolve(none),
    kpis === "partner" || kpis === "loans" ? sb.from("commission_receivables").select("commission_minor, status").in("organization_id", orgIds) : Promise.resolve(none),
    kpis === "partner" || kpis === "loans" ? sb.from("commission_agreements").select("status, document_id").in("organization_id", orgIds) : Promise.resolve(none),
    hasRental ? sb.from("rent_charges").select("due_on, amount_minor").in("organization_id", orgIds).gte("due_on", fy.start).lt("due_on", fy.end) : Promise.resolve(none),
  ]) : [none, none, none, none, none, none, none, none, none, none];

  type Inv = { invoice_date: string; status: string; total_minor: number; outstanding_minor: number; effective_due_date: string; currency: string };
  const invoices = ((inv.data ?? []) as Inv[]).filter((i) => i.currency === "INR" && i.status !== "cancelled");
  const payments = ((pay.data ?? []) as { payment_date: string; amount_minor: number; kind: string; currency: string }[]).filter((p) => p.currency === "INR");
  const rows = dropMatchedTransfers((led.data ?? []) as Row[]);
  const L = summarizeLedger(rows, P);
  const pipe = summarizePipeline((stages.data ?? []) as StageRow[], (deals.data ?? []) as DealRow[], P);
  const invoiced = invoices.filter((i) => i.invoice_date >= fy.start && i.invoice_date < fy.end).reduce((s, i) => s + i.total_minor, 0);
  const cash = payments.reduce((s, p) => s + (p.kind === "refund" ? -1 : 1) * p.amount_minor, 0);
  const invRec = invoices.reduce((s, i) => s + i.outstanding_minor, 0);
  const invOver = invoices.filter((i) => i.status === "issued" && i.effective_due_date < today).reduce((s, i) => s + i.outstanding_minor, 0);
  const ledOver = rows.filter((r) => ["income", "commission_income", "other_income"].includes(r.entry_type) && r.due_on && r.due_on < today).reduce((s, r) => s + (r.amount_minor - r.settled_minor), 0);
  const sumType = (t: string, settledOnly = false) => rows.filter((r) => r.entry_type === t && r.txn_date >= fy.start).reduce((s, r) => s + (settledOnly ? r.settled_minor : r.amount_minor), 0);
  const f = formatShort;

  const common = [
    { l: "Booked", v: f(pipe.won.valueMinor), s: "Accrual", href: undefined },
    { l: "Invoiced", v: f(invoiced + L.incomeBookedMinor) },
    { l: "Collected", v: f(cash + L.incomeReceivedMinor), s: "Cash" },
    { l: "Overdue", v: f(invOver + ledOver) },
    { l: "Forecast", v: pipe.probabilitiesSet ? f(pipe.weightedMinor) : NO },
  ];
  let fin: OverviewVM["fin"];
  switch (kpis) {
    case "agency": fin = [...common, { l: "Pass-through", v: f(L.passThroughHeldMinor) }, { l: "Deferred", v: NO }]; break;
    case "products": {
      const adv = ((orders.data ?? []) as { kind: string; status: string; advance_received_minor: number }[]).filter((o) => o.kind === "b2b" && !["delivered", "cancelled", "returned"].includes(o.status)).reduce((s, o) => s + o.advance_received_minor, 0);
      fin = [...common, { l: "Supplier payable", v: f(L.payablesMinor) }, { l: "Advances", v: f(adv) }]; break;
    }
    case "ecommerce": fin = [...common, { l: "Ad spend", v: f(rows.filter((r) => r.entry_type === "expense" && /ad/i.test(r.category) && r.txn_date >= fy.start).reduce((s, r) => s + r.amount_minor, 0)) }, { l: "Refunds", v: f(sumType("refund_out")) }]; break;
    case "partner": case "loans": {
      const open = (deals.data ?? []).reduce((s, d) => s + Number(d.value_minor), 0);
      const recs = (comm.data ?? []) as { commission_minor: number; status: string }[];
      const ag = (agr.data ?? []) as { status: string; document_id: string | null }[];
      fin = [{ l: kpis === "loans" ? "Applicant loan value" : "Gross deal value", v: f(open), s: "Not income" },
        { l: "Commission basis", v: ag.some((a) => a.status === "signed") ? "Signed" : "Needs confirmation" },
        { l: "Receivable", v: f(recs.filter((r) => r.status !== "received").reduce((s, r) => s + r.commission_minor, 0)) },
        { l: "Received", v: f(sumType("commission_income", true)), s: "Cash" }, { l: "Overdue", v: f(ledOver) }, { l: "Forecast", v: NO },
        { l: "Proof on file", v: String(ag.filter((a) => a.document_id).length) }];
      break;
    }
    case "restaurant": {
      const o = (outlet.data ?? []) as { gross_minor: number; platform_commission_minor: number }[];
      const gross = o.reduce((s, x) => s + x.gross_minor, 0), commission = o.reduce((s, x) => s + x.platform_commission_minor, 0);
      fin = [{ l: "Sales", v: f(gross) }, { l: "Platform commissions", v: f(commission) }, { l: "Vendor payable", v: f(L.payablesMinor) }, { l: "Wastage", v: NO },
        { l: "Net", v: f(gross - commission - L.expensesBookedMinor) }, { l: "Settlement due", v: NO }, { l: "Cash in till", v: NO }];
      break;
    }
    default: fin = [...common, { l: "Payable", v: f(L.payablesMinor) }, { l: "Deferred", v: NO }];
  }

  const months = monthlyBreakdown(rows, P);
  const trend = months.map((m) => {
    const k = m.month;
    const b = invoices.filter((i) => i.invoice_date.startsWith(k)).reduce((s, i) => s + i.total_minor, 0) + m.summary.incomeBookedMinor;
    const c = payments.filter((p) => p.payment_date.startsWith(k)).reduce((s, p) => s + (p.kind === "refund" ? -1 : 1) * p.amount_minor, 0) + m.summary.incomeReceivedMinor;
    return { m: MONTHS[Number(k.slice(5, 7)) - 1], b, c };
  });
  const rentBilled = ((rent.data ?? []) as { amount_minor: number }[]).reduce((s, r) => s + r.amount_minor, 0);
  return {
    note: `${fy.label} to date. Booked, invoiced, collected, overdue and forecast are shown separately. Accrual and cash are labelled. Only approved records count.`,
    fin, fyLabel: fy.label, trend,
    inc: [{ n: "Operating / business revenue", v: f(invoiced + L.incomeBookedMinor - sumType("other_income")) }, { n: "Rental income", v: hasRental && rentBilled ? f(rentBilled) : "Not set" }, { n: "Other income", v: f(sumType("other_income")) }],
    exp: [{ n: "Booked (incurred)", v: f(L.expensesBookedMinor) }, { n: "Paid in cash", v: f(L.expensesPaidMinor) }, { n: "Unpaid / payable", v: f(L.payablesMinor) }, { n: "By unit, category, project", v: L.expensesBookedMinor ? "See ledger" : "Filters need data" }],
    bal: [
      { n: "Net operating result", t: "accrual", v: f(L.netOperatingMinor) }, { n: "Net cash movement", t: "cash", v: f(L.netCashMovementMinor + cash) },
      { n: "Receivables", t: "accrual", v: f(invRec + L.receivablesMinor) }, { n: "Payables", t: "accrual", v: f(L.payablesMinor) },
      { n: "Overdue", t: "accrual", v: f(invOver + ledOver) }, { n: "Tax liabilities", t: "needs accountant", v: NO },
      { n: "Owner transfers", t: "excluded from income", v: f(sumType("owner_withdrawal")) },
    ],
    links,
  };
}

type Unit = { id: string; label: string; address: string | null; use_type: string | null; co_owners: string | null; legal_entity: { name: string } | null };
type Lease = { id: string; unit_id: string; status: string; rent_minor: number; due_day: number; frequency: string; start_date: string; end_date: string | null; deposit_minor: number; escalation_pct: number | null; escalation_every_months: number | null; lock_in_months: number | null; notice_days: number | null; document_id: string | null; tenant: { name: string } | null };

/** Rental tab for one or more companies. */
export async function loadRental(sb: SupabaseClient, orgIds: string[], period: { start: string; end: string }, today: string) {
  const [units, leases, charges, receipts, deposits, expenses] = await Promise.all([
    sb.from("rental_units").select("id, label, address, use_type, co_owners, legal_entity:legal_entities(name)").in("organization_id", orgIds).order("label"),
    sb.from("leases").select("id, unit_id, status, rent_minor, due_day, frequency, start_date, end_date, deposit_minor, escalation_pct, escalation_every_months, lock_in_months, notice_days, document_id, tenant:tenants(name)").in("organization_id", orgIds),
    sb.from("rent_charges").select("id, lease_id, due_on, amount_minor, received_minor, status").in("organization_id", orgIds).limit(10000),
    sb.from("rent_receipts").select("charge_id, amount_minor, received_on").in("organization_id", orgIds).limit(20000),
    sb.from("security_deposit_ledger").select("lease_id, kind, amount_minor").in("organization_id", orgIds),
    sb.from("ledger_entries").select("rental_unit_id, amount_minor, settled_minor, settled_on, txn_date").in("organization_id", orgIds).not("rental_unit_id", "is", null).in("status", ["approved", "partially_settled", "settled"]),
  ]);
  const u = (units.data ?? []) as unknown as Unit[];
  const ls = (leases.data ?? []) as unknown as Lease[];
  const unitOf = new Map(ls.map((l) => [l.id, l.unit_id]));
  const ch = ((charges.data ?? []) as { id: string; lease_id: string; due_on: string; amount_minor: number; received_minor: number; status: string }[]).map((c) => ({ ...c, unit_id: unitOf.get(c.lease_id)! }));
  const r = rentalReport(u.map((x) => x.id), {
    charges: ch, receipts: (receipts.data ?? []) as { charge_id: string; amount_minor: number; received_on: string }[],
    deposits: ((deposits.data ?? []) as { lease_id: string; kind: "received"; amount_minor: number }[]).map((d) => ({ ...d, unit_id: unitOf.get(d.lease_id)! })),
    expenses: ((expenses.data ?? []) as { rental_unit_id: string; amount_minor: number; settled_minor: number; settled_on: string | null; txn_date: string }[]).map((e) => ({ ...e, unit_id: e.rental_unit_id })),
  }, period, today);
  const f = formatShort;
  const t = r.total;
  const active = ls.filter((l) => l.status === "active");
  const vm: Omit<RentalVM, "schedule" | "deposits"> = {
    none: u.length === 0,
    kpis: [
      { l: "Rent billed", v: f(t.billedMinor), s: "Accrual" }, { l: "Rent collected", v: f(t.receivedMinor), s: "Cash" }, { l: "Overdue", v: f(t.overdueMinor), s: NO },
      { l: "Arrears", v: f(t.arrearsMinor), s: NO }, { l: "Security deposits", v: f(t.depositsHeldMinor), s: "Liability, not income" },
      { l: "Occupancy", v: u.length ? `${active.length} / ${u.length}` : "₹0", s: u.length ? "Units let" : "Needs units" },
      { l: "Rental expenses", v: f(t.expensesMinor), s: NO }, { l: "Net rental cashflow", v: f(t.netCashMinor), s: NO },
    ],
    units: u.map((x) => {
      const l = active.find((y) => y.unit_id === x.id);
      const fields: [string, string | null][] = [
        ["Address", x.address], ["Legal owner / entity", x.legal_entity?.name ?? null], ["Co-owners", x.co_owners], ["Use (residential / commercial)", x.use_type],
        ["Tenant", l?.tenant?.name ?? null], ["Rent amount", l ? `${f(l.rent_minor)} ${l.frequency}` : null], ["Due date", l ? `Day ${l.due_day}` : null],
        ["Security deposit", l ? f(l.deposit_minor) : null], ["Lease start / end", l ? `${l.start_date} / ${l.end_date ?? "open"}` : null],
        ["Escalation", l?.escalation_pct ? `${l.escalation_pct}% every ${l.escalation_every_months} months` : null],
        ["Notice / lock-in", l && (l.notice_days || l.lock_in_months) ? `${l.notice_days ?? 0} days / ${l.lock_in_months ?? 0} months` : null], ["Documents", l?.document_id ? "On file" : null],
      ];
      const ok = fields.filter(([, v]) => v).length >= 8;
      return { name: x.label, ok, state: ok ? (l ? "Let" : "Vacant") : "Needs setup", fields };
    }),
  };
  const unpaid = ch.filter((c) => c.status === "open" || c.status === "partially_paid").sort((a, b) => a.due_on.localeCompare(b.due_on));
  return { vm, unpaid, labels: new Map(u.map((x) => [x.id, x.label])), leases: active.map((l) => ({ id: l.id, label: `${u.find((x) => x.id === l.unit_id)?.label} · ${l.tenant?.name ?? ""}` })) };
}
