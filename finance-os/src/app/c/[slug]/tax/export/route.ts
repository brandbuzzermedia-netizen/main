import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { getCompanyContext } from "@/lib/workspace";
import { financialYear } from "@/domain/periods";
import { todayInBusinessTz } from "@/domain/dates";
import { toCsv } from "@/lib/csv";
import { counts, LEDGER_TYPE_LABELS, type LedgerRow } from "@/domain/ledger";

/**
 * Accountant review pack registers. Every row is an approved ledger entry with its id and source
 * document id, so each figure traces back. No deductibility, ITC or TDS decision is made here.
 */
const REGISTERS = {
  income: { title: "Income and sales register", types: ["income", "commission_income", "other_income", "refund_out", "credit_note"] },
  expense: { title: "Purchase and expense register", types: ["expense", "write_off"] },
  financing: { title: "Loans, capital, deposits and pass-through", types: ["loan_in", "loan_repayment", "capital_in", "owner_withdrawal", "deposit_received", "deposit_refunded", "pass_through_in", "pass_through_out", "tax_payment", "transfer_in", "transfer_out"] },
  gst: { title: "GST summary by month (as recorded, for review)", types: [] as string[] },
} as const;

export async function GET(request: NextRequest, { params }: RouteContext<"/c/[slug]/tax/export">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const which = request.nextUrl.searchParams.get("register") as keyof typeof REGISTERS;
  if (!REGISTERS[which]) notFound();
  const fyStart = Number(request.nextUrl.searchParams.get("fy")) || financialYear(todayInBusinessTz(), ctx.company.fy_start_month).startYear;
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${fyStart}-${pad(ctx.company.fy_start_month)}-01`;
  const end = `${fyStart + 1}-${pad(ctx.company.fy_start_month)}-01`;
  // RLS limits this to finance roles, or an accountant's granted entities and periods.
  const { data, error } = await ctx.supabase.from("ledger_entries")
    .select("id, entry_type, status, txn_date, accounting_date, category, description, counterparty, vendor_gstin, bill_number, amount_minor, currency, base_amount_minor, tax_minor, cgst_minor, sgst_minor, igst_minor, cess_minor, settled_minor, settled_on, payment_reference, source_document_id, legal_entity:legal_entities(name, gstin)")
    .eq("organization_id", ctx.company.id).gte("txn_date", start).lt("txn_date", end).order("txn_date");
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown as (LedgerRow & Record<string, unknown> & { legal_entity: { name: string; gstin: string | null } | null })[]).filter(counts);
  const r = (m: unknown) => (Number(m ?? 0) / 100).toFixed(2);
  let table: (string | number | null)[][];
  if (which === "gst") {
    const months = new Map<string, number[]>();
    for (const x of rows.filter((x) => x.entry_type === "expense")) {
      const k = x.txn_date.slice(0, 7);
      const t = months.get(k) ?? [0, 0, 0, 0, 0];
      [x.amount_minor, x.cgst_minor, x.sgst_minor, x.igst_minor, x.cess_minor].forEach((v, i) => (t[i] += Number(v ?? 0)));
      months.set(k, t);
    }
    table = [["Month", "Purchases incl. tax", "CGST paid", "SGST paid", "IGST paid", "Cess paid", "Note"],
      ...[...months.entries()].map(([m, t]) => [m, ...t.map((v) => r(v)), "Input tax as recorded on bills. Eligibility for credit is decided by your accountant."])];
  } else {
    const types: readonly string[] = REGISTERS[which].types;
    table = [["Ledger id", "Date", "Type", "Legal entity", "Entity GSTIN", "Category", "Description", "Counterparty", "Vendor GSTIN", "Bill no.", "Amount", "Currency", "INR amount", "Tax", "CGST", "SGST", "IGST", "Cess", "Settled", "Settled on", "Payment ref", "Source document id", "Status"],
      ...rows.filter((x) => types.includes(x.entry_type)).map((x) => [x.id, x.txn_date, LEDGER_TYPE_LABELS[x.entry_type], x.legal_entity?.name ?? "", x.legal_entity?.gstin ?? "", x.category as string, x.description as string,
        (x.counterparty as string) ?? "", (x.vendor_gstin as string) ?? "", (x.bill_number as string) ?? "", r(x.amount_minor), x.currency, r(x.base_amount_minor), r(x.tax_minor), r(x.cgst_minor), r(x.sgst_minor), r(x.igst_minor), r(x.cess_minor),
        r(x.settled_minor), x.settled_on ?? "", (x.payment_reference as string) ?? "", (x.source_document_id as string) ?? "", x.status])];
  }
  await ctx.supabase.rpc("log_export", { p_org: ctx.company.id, p_what: `tax_${which}`, p_rows: table.length - 1 });
  return new Response(toCsv([[`${REGISTERS[which].title} · ${ctx.company.name} · FY ${fyStart}-${String(fyStart + 1).slice(2)} · prepared for accountant review, not a filing`], ...table]), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${ctx.company.slug}-${which}-FY${fyStart}.csv"`, "cache-control": "no-store" },
  });
}
