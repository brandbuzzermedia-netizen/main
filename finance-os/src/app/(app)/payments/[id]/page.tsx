import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import type { PaymentRow } from "@/lib/db-types";
import { formatMoney } from "@/domain/money";
import { formatDate } from "@/domain/dates";
import { Alert, Card, Dl, PageHeader, Stat } from "@/components/ui";
import { METHOD_LABEL, SOURCE_LABEL, VerificationBadge } from "@/components/payment-status";
import { assignClientAction, loadOpenInvoices, setVerificationAction } from "../actions";
import { AllocationEditor } from "./allocation-editor";
import { AssignClientForm, VerificationForm } from "./forms";

export const metadata: Metadata = { title: "Payment" };

export default async function PaymentPage({ params }: PageProps<"/payments/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  const [{ data }, { data: allocs }] = await Promise.all([
    ctx.supabase.from("payment_list").select("*").eq("id", id).maybeSingle(),
    ctx.supabase.from("payment_allocations").select("invoice_id, amount_minor").eq("payment_id", id),
  ]);
  if (!data) notFound();
  const p = data as PaymentRow;
  const current = new Map((allocs ?? []).map((a) => [a.invoice_id as string, a.amount_minor as number]));

  let editorRows: Parameters<typeof AllocationEditor>[0]["rows"] = [];
  if (p.client_id && p.kind === "receipt") {
    const open = await loadOpenInvoices(ctx, [p.client_id]);
    const ids = new Set(open.map((o) => o.id));
    // Invoices this payment fully settled are no longer "open"; include them so they can be edited.
    const settledIds = [...current.keys()].filter((k) => !ids.has(k));
    let settled: typeof open = [];
    if (settledIds.length) {
      const { data: s } = await ctx.supabase
        .from("invoice_balances")
        .select("id, client_id, invoice_number, invoice_date, effective_due_date, outstanding_minor, status")
        .in("id", settledIds);
      settled = (s ?? []) as typeof open;
    }
    editorRows = [...open, ...settled]
      .sort((a, b) => a.effective_due_date.localeCompare(b.effective_due_date))
      .map((r) => ({ ...r, current_minor: current.get(r.id) ?? 0 }));
  }
  let clients: { id: string; name: string }[] = [];
  if (!p.client_id && ctx.canWrite) {
    const { data: c } = await ctx.supabase.from("clients").select("id, legal_name, trading_name").eq("organization_id", ctx.org.id).order("legal_name");
    clients = (c ?? []).map((x) => ({ id: x.id as string, name: (x.trading_name || x.legal_name) as string }));
  }

  return (
    <>
      <PageHeader
        title={`${p.kind === "refund" ? "Refund" : "Payment"} ${p.transaction_reference}`}
        description={<>{formatDate(p.payment_date)} · {METHOD_LABEL[p.method]} · {SOURCE_LABEL[p.source]}{p.client_id && <> · <Link className="underline" href={`/clients/${p.client_id}`}>{p.client_trading_name || p.client_legal_name}</Link></>}</>}
      />
      {p.verification_status === "pending_verification" && (
        <div className="mb-4"><Alert tone="warn" title="Awaiting verification">Allocated invoices stay outstanding, and reminders for them are held, until this is verified against the bank.</Alert></div>
      )}
      {p.verification_status === "rejected" && <div className="mb-4"><Alert tone="danger" title="Rejected">{p.verification_note}</Alert></div>}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Amount" value={formatMoney(p.amount_minor, p.currency)} tone={p.kind === "refund" ? "danger" : "default"} />
        <Stat label="Allocated" value={formatMoney(p.allocated_minor, p.currency)} />
        <Stat label="Unallocated" value={formatMoney(p.unallocated_minor, p.currency)} tone={p.kind === "receipt" && p.unallocated_minor > 0 ? "warn" : "default"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {p.kind === "receipt" && (
            <Card title="Allocate to invoices">
              {p.client_id ? (
                <AllocationEditor paymentId={p.id} amountMinor={p.amount_minor} rows={editorRows} canEdit={ctx.canWrite && p.verification_status !== "rejected"} />
              ) : ctx.canWrite ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted">This payment is not matched to a client yet.{p.bank_narration && <> Bank narration: <span className="font-mono text-xs">{p.bank_narration}</span></>}</p>
                  <AssignClientForm action={assignClientAction.bind(null, p.id)} clients={clients} />
                </div>
              ) : (
                <p className="text-sm text-muted">Not matched to a client yet.</p>
              )}
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <Card title="Verification">
            <div className="mb-3"><VerificationBadge status={p.verification_status} /></div>
            {p.verification_note && <p className="mb-3 text-sm">{p.verification_note}</p>}
            {p.verified_at && <p className="mb-3 text-xs text-muted">Verified {new Date(p.verified_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>}
            {ctx.canWrite && <VerificationForm action={setVerificationAction.bind(null, p.id)} status={p.verification_status} />}
          </Card>
          <Card title="Details">
            <Dl items={[
              ["Payer", p.payer_name ?? "—"],
              ["Bank narration", p.bank_narration ? <span key="n" className="font-mono text-xs break-all">{p.bank_narration}</span> : "—"],
              ["Notes", p.reconciliation_notes ?? "—"],
              ["Recorded", new Date(p.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })],
            ]} />
          </Card>
        </div>
      </div>
    </>
  );
}
