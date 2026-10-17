import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import type { InvoiceBalance } from "@/lib/db-types";
import { formatMoney } from "@/domain/money";
import { formatDate } from "@/domain/dates";
import { Alert, Badge, Card, Dl, PageHeader, Stat } from "@/components/ui";
import { AgeingBadge, PaymentStateBadge, SyncBadge } from "@/components/status";
import { setDisputeAction } from "../actions";
import { DisputeForm } from "./dispute-form";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  const [{ data }, { data: allocations }, { data: reminders }, { data: tasks }] = await Promise.all([
    ctx.supabase.from("invoice_balances").select("*").eq("id", id).maybeSingle(),
    ctx.supabase.from("payment_allocations").select("id, amount_minor, created_at, payment:payments(transaction_reference, payment_date, method, verification_status)").eq("invoice_id", id),
    ctx.supabase.from("reminder_events").select("id, stage, channel, status, created_at, error").eq("invoice_id", id).order("created_at", { ascending: false }),
    ctx.supabase.from("escalation_tasks").select("id, title, status, kind").eq("invoice_id", id).in("status", ["open", "in_progress"]),
  ]);
  if (!data) notFound();
  const inv = data as InvoiceBalance;
  const allocs = (allocations ?? []) as unknown as { id: string; amount_minor: number; payment: { transaction_reference: string; payment_date: string; method: string; verification_status: string } }[];
  const swipePaidMismatch = inv.source_reported_paid_minor !== null && inv.source_reported_paid_minor !== inv.amount_received_minor + inv.credited_minor;

  return (
    <>
      <PageHeader
        title={inv.invoice_number}
        description={<>Invoice to <Link className="underline" href={`/clients/${inv.client_id}`}>{inv.client_trading_name || inv.client_legal_name}</Link> · issued {formatDate(inv.invoice_date)}</>}
        actions={inv.pdf_url && <a className="text-sm text-brand underline" href={inv.pdf_url} target="_blank" rel="noreferrer">Open official invoice in Swipe ↗</a>}
      />

      {inv.status === "cancelled" && <div className="mb-4"><Alert tone="info" title="Cancelled in Swipe">This invoice is excluded from balances and reminders.</Alert></div>}
      {inv.status === "disputed" && <div className="mb-4"><Alert tone="info" title="Disputed">{inv.status_reason}</Alert></div>}
      {inv.has_pending_payment && <div className="mb-4"><Alert tone="warn" title="A payment is awaiting verification">Reminders will hold until it is verified or rejected.</Alert></div>}
      {swipePaidMismatch && (
        <div className="mb-4">
          <Alert tone="warn" title="Swipe shows a different paid amount">
            Swipe reports {formatMoney(inv.source_reported_paid_minor!, inv.currency)} paid ({inv.source_reported_status ?? "no status"}). Verified payments here
            total {formatMoney(inv.amount_received_minor + inv.credited_minor, inv.currency)}. Swipe&rsquo;s figure is not applied until the payment is verified.
          </Alert>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Invoice total" value={formatMoney(inv.total_minor, inv.currency)} hint={inv.tax_minor ? `incl. ${formatMoney(inv.tax_minor, inv.currency)} GST` : undefined} />
        <Stat label="Verified received" value={formatMoney(inv.amount_received_minor, inv.currency)} tone="ok" />
        <Stat label="Outstanding" value={formatMoney(inv.outstanding_minor, inv.currency)} tone={inv.ageing_bucket.startsWith("overdue") ? "danger" : "default"} />
        <Stat label="Due" value={formatDate(inv.effective_due_date)} hint={inv.days_overdue > 0 && inv.outstanding_minor > 0 ? `${inv.days_overdue} days overdue` : inv.extended_due_date ? `Extended from ${formatDate(inv.due_date)}` : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Payments allocated">
            {allocs.length === 0 ? (
              <p className="text-sm text-muted">No payments allocated. Payment recording and reconciliation arrive in Phase 3.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {allocs.map((a) => (
                  <li key={a.id} className="flex justify-between py-2">
                    <span>{a.payment.transaction_reference} · {formatDate(a.payment.payment_date)} · {a.payment.method.toUpperCase()}{" "}
                      <Badge tone={a.payment.verification_status === "verified" ? "ok" : a.payment.verification_status === "rejected" ? "danger" : "warn"}>{a.payment.verification_status.replace("_", " ")}</Badge>
                    </span>
                    <span className="tabular">{formatMoney(a.amount_minor, inv.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Reminder history">
            {(reminders ?? []).length === 0 ? (
              <p className="text-sm text-muted">No reminders sent. The automated reminder engine arrives in Phase 5.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {(reminders ?? []).map((r) => (
                  <li key={r.id} className="py-2">{formatDate(r.created_at)} · {r.stage} · {r.channel} · {r.status}{r.error && ` · ${r.error}`}</li>
                ))}
              </ul>
            )}
          </Card>
          {(tasks ?? []).length > 0 && (
            <Card title="Open tasks">
              <ul className="text-sm">
                {(tasks ?? []).map((t) => <li key={t.id}><Link className="underline" href="/tasks">{t.title}</Link></li>)}
              </ul>
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <Card title="Details">
            <Dl
              items={[
                ["Status", <div key="s" className="flex flex-wrap gap-1"><AgeingBadge bucket={inv.ageing_bucket} days={inv.days_overdue} />{inv.status !== "cancelled" && <PaymentStateBadge state={inv.payment_state} />}</div>],
                ["Billing period", inv.billing_period_start ? `${formatDate(inv.billing_period_start)} – ${formatDate(inv.billing_period_end)}` : "—"],
                ["Original due date", <span key="d">{formatDate(inv.due_date)}{inv.due_date_derived && <span className="text-xs text-muted"> (from payment terms)</span>}</span>],
                ["Subtotal", inv.subtotal_minor !== null ? formatMoney(inv.subtotal_minor, inv.currency) : "—"],
                ["Credit notes", formatMoney(inv.credited_minor, inv.currency)],
                ["Source", <SyncBadge key="src" status={inv.sync_status} channel={inv.source_channel} />],
                ["Last synced", inv.last_synced_at ? new Date(inv.last_synced_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"],
                ["Swipe document ID", inv.external_id ?? "—"],
              ]}
            />
          </Card>
          {ctx.canWrite && inv.status !== "cancelled" && (
            <Card title="Dispute">
              <DisputeForm action={setDisputeAction.bind(null, id, inv.status !== "disputed")} disputed={inv.status === "disputed"} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
