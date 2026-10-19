import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import type { ClientBalance, InvoiceBalance } from "@/lib/db-types";
import { formatMoney } from "@/domain/money";
import { todayInBusinessTz } from "@/domain/dates";
import { summarizeReceivables } from "@/domain/receivables";
import { Alert, Card, EmptyState, PageHeader, Stat, Table, Td, ButtonLink } from "@/components/ui";
import { SyncHealthBanner } from "@/components/sync-health";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const ctx = await getContext();
  const today = todayInBusinessTz();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [invoicesRes, clientsRes, mrrRes, cashRes, tasksRes, pendingRes, commitmentsRes] = await Promise.all([
    ctx.supabase
      .from("invoice_balances")
      .select("status, outstanding_minor, ageing_bucket, effective_due_date, invoice_date, total_minor")
      .eq("organization_id", ctx.org.id)
      .or(`outstanding_minor.gt.0,invoice_date.gte.${monthStart}`),
    ctx.supabase.from("client_balances").select("*").eq("organization_id", ctx.org.id).gt("overdue_minor", 0)
      .order("overdue_minor", { ascending: false }).limit(8),
    ctx.supabase.from("clients").select("monthly_retainer_minor").eq("organization_id", ctx.org.id).eq("service_status", "active"),
    ctx.supabase.from("payments").select("amount_minor, kind").eq("organization_id", ctx.org.id)
      .eq("verification_status", "verified").gte("payment_date", monthStart),
    ctx.supabase.from("escalation_tasks").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id).in("status", ["open", "in_progress"]),
    ctx.supabase.from("payments").select("amount_minor, unallocated_minor, verification_status, kind").eq("organization_id", ctx.org.id)
      .neq("verification_status", "rejected").eq("kind", "receipt").or("verification_status.eq.pending_verification,unallocated_minor.gt.0"),
    ctx.supabase.from("payment_commitments").select("status, promised_amount_minor, commitment_date").eq("organization_id", ctx.org.id)
      .in("status", ["open", "missed"]),
  ]);

  const loadError = invoicesRes.error ?? clientsRes.error ?? mrrRes.error ?? cashRes.error;
  const summary = summarizeReceivables((invoicesRes.data ?? []) as InvoiceBalance[], today);
  const mrr = (mrrRes.data ?? []).reduce((s, c) => s + (c.monthly_retainer_minor as number), 0);
  const verifiedCash = (cashRes.data ?? []).reduce((s, p) => s + (p.kind === "refund" ? -1 : 1) * (p.amount_minor as number), 0);
  const overdueClients = (clientsRes.data ?? []) as ClientBalance[];
  const pendingPayments = (pendingRes.data ?? []).filter((p) => p.verification_status === "pending_verification");
  const unallocated = (pendingRes.data ?? []).filter((p) => p.verification_status === "verified" && (p.unallocated_minor as number) > 0);
  const openPromises = (commitmentsRes.data ?? []).filter((c) => c.status === "open");
  const missedPromises = (commitmentsRes.data ?? []).filter((c) => c.status === "missed");
  const sum = (rows: Record<string, unknown>[], key: string) => rows.reduce((s, r) => s + (r[key] as number), 0);

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Figures as of ${new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(new Date())} (IST). Computed live from the ledger.`}
      />
      <SyncHealthBanner />
      {loadError && <div className="mb-4"><Alert tone="danger" title="Some figures could not be loaded">{loadError.message}</Alert></div>}

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Revenue</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Contracted MRR" value={formatMoney(mrr, "INR", { compact: true })} hint="Active clients' monthly retainers, before GST" />
        <Stat label="Invoiced this month" value={formatMoney(summary.invoicedThisMonthMinor, "INR", { compact: true })} hint={`${summary.invoicedThisMonthCount} invoice(s), incl. GST`} />
        <Stat label="Verified cash this month" value={formatMoney(verifiedCash, "INR", { compact: true })} tone="ok" hint="Verified receipts less refunds" />
        <Stat label="Open tasks" value={tasksRes.count ?? 0} tone={(tasksRes.count ?? 0) > 0 ? "warn" : "default"} hint={<Link className="underline" href="/tasks">Review tasks</Link>} />
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Receivables</h2>
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Outstanding service fees" value={formatMoney(summary.outstandingMinor, "INR", { compact: true })} hint={summary.disputedMinor ? `incl. ${formatMoney(summary.disputedMinor, "INR", { compact: true })} disputed` : "Invoiced, not yet verified as paid"} />
        <Stat label="Overdue" value={formatMoney(summary.overdueMinor, "INR", { compact: true })} tone={summary.overdueMinor ? "danger" : "default"} />
        <Stat label="Disputed" value={formatMoney(summary.disputedMinor, "INR", { compact: true })} />
      </div>
      <div className="mb-8 grid grid-cols-3 gap-3">
        {([7, 14, 30] as const).map((n) => (
          <Stat key={n} label={`Due in next ${n} days`} value={formatMoney(summary.dueWithin[n], "INR", { compact: true })} hint="Expected, unconfirmed. Not cash" />
        ))}
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Collections</h2>
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Payments awaiting verification" value={formatMoney(sum(pendingPayments, "amount_minor"), "INR", { compact: true })}
          hint={<Link className="underline" href="/payments?view=pending">{pendingPayments.length} to verify</Link>} tone={pendingPayments.length ? "warn" : "default"} />
        <Stat label="Verified, unallocated" value={formatMoney(sum(unallocated, "unallocated_minor"), "INR", { compact: true })}
          hint={<Link className="underline" href="/payments?view=unallocated">{unallocated.length} to match</Link>} tone={unallocated.length ? "warn" : "default"} />
        <Stat label="Open payment promises" value={formatMoney(sum(openPromises, "promised_amount_minor"), "INR", { compact: true })}
          hint={`${openPromises.length} promise(s). Expected, not cash`} />
        <Stat label="Missed promises" value={missedPromises.length} tone={missedPromises.length ? "danger" : "default"}
          hint={missedPromises.length ? <Link className="underline" href="/tasks">Founder tasks open</Link> : "None outstanding"} />
      </div>

      <Card title="Overdue clients" actions={<Link className="text-sm text-brand hover:underline" href="/invoices?view=overdue">All overdue invoices</Link>}>
        {overdueClients.length === 0 ? (
          <EmptyState title="Nothing overdue" action={ctx.canWrite && summary.outstandingMinor === 0 && <ButtonLink variant="secondary" href="/invoices/import">Import Swipe invoices</ButtonLink>} />
        ) : (
          <div className="-m-4">
            <Table head={["Client", "Overdue", "Total outstanding", "Oldest", "Missed promises"]}>
              {overdueClients.map((c) => (
                <tr key={c.client_id}>
                  <Td><Link className="font-medium hover:underline" href={`/clients/${c.client_id}`}>{c.trading_name || c.legal_name}</Link></Td>
                  <Td numeric className="text-danger">{formatMoney(c.overdue_minor)}</Td>
                  <Td numeric>{formatMoney(c.outstanding_minor)}</Td>
                  <Td numeric>{c.oldest_days_overdue} day{c.oldest_days_overdue === 1 ? "" : "s"}</Td>
                  <Td numeric>{c.missed_commitments_count || "—"}</Td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>

      <p className="mt-6 text-xs text-muted">
        Not yet on this page: ad funding, expenses and the cash forecast (Phase 4), and automation failures (Phase 5).
        Those figures will appear here once their ledgers exist, rather than as estimates.
      </p>
    </>
  );
}
