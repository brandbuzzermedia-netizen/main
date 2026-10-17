import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import type { InvoiceBalance } from "@/lib/db-types";
import { formatMoney } from "@/domain/money";
import { formatDate } from "@/domain/dates";
import { Alert, Button, ButtonLink, EmptyState, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { AgeingBadge, PaymentStateBadge, SyncBadge } from "@/components/status";
import { SyncHealthBanner } from "@/components/sync-health";

export const metadata: Metadata = { title: "Invoices" };

const VIEWS = {
  open: "Open",
  overdue: "Overdue",
  due_soon: "Not yet due",
  disputed: "Disputed",
  settled: "Settled",
  cancelled: "Cancelled",
  all: "All",
} as const;
type View = keyof typeof VIEWS;

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const sp = await searchParams;
  const view: View = typeof sp.view === "string" && sp.view in VIEWS ? (sp.view as View) : "open";
  const client = typeof sp.client === "string" ? sp.client : "";
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";
  const period = typeof sp.period === "string" ? sp.period : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const ctx = await getContext();

  let query = ctx.supabase.from("invoice_balances").select("*").eq("organization_id", ctx.org.id);
  if (view === "open") query = query.neq("status", "cancelled").gt("outstanding_minor", 0);
  else if (view === "overdue") query = query.like("ageing_bucket", "overdue%");
  else if (view === "due_soon") query = query.in("ageing_bucket", ["not_due", "due_today"]);
  else if (view === "disputed") query = query.eq("status", "disputed");
  else if (view === "settled") query = query.eq("ageing_bucket", "settled");
  else if (view === "cancelled") query = query.eq("status", "cancelled");
  if (client) query = query.eq("client_id", client);
  if (from) query = query.gte("effective_due_date", from);
  if (to) query = query.lte("effective_due_date", to);
  if (period && /^\d{4}-\d{2}$/.test(period)) {
    // Billing month: falls back to the invoice date when Swipe gives no service period.
    const start = `${period}-01`;
    const [y, m] = period.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    query = query.or(`and(billing_period_start.gte.${start},billing_period_start.lt.${end}),and(billing_period_start.is.null,invoice_date.gte.${start},invoice_date.lt.${end})`);
  }
  if (q) query = query.ilike("invoice_number", `%${q.replace(/[%,()]/g, "")}%`);
  const [{ data, error }, { data: clients }] = await Promise.all([
    query.order("effective_due_date", { ascending: true }).limit(500),
    ctx.supabase.from("clients").select("id, legal_name, trading_name").eq("organization_id", ctx.org.id).order("legal_name"),
  ]);
  const invoices = (data ?? []) as InvoiceBalance[];
  const outstanding = invoices.reduce((s, i) => s + (i.status === "cancelled" ? 0 : i.outstanding_minor), 0);

  return (
    <>
      <PageHeader
        title="Invoices"
        description="References to official invoices in Swipe. Balances update only from verified payments."
        actions={
          ctx.canWrite && (
            <>
              <ButtonLink href="/invoices/import">Import from Swipe</ButtonLink>
              <ButtonLink variant="secondary" href="/invoices/new">Add manually</ButtonLink>
            </>
          )
        }
      />
      <SyncHealthBanner />

      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Invoice views">
        {Object.entries(VIEWS).map(([key, label]) => {
          const params = new URLSearchParams({ view: key, ...(client && { client }), ...(from && { from }), ...(to && { to }), ...(period && { period }) });
          return (
            <Link
              key={key}
              href={`/invoices?${params}`}
              aria-current={view === key ? "page" : undefined}
              className={view === key ? "rounded-lg bg-ink px-3 py-1.5 text-sm text-bg" : "rounded-lg px-3 py-1.5 text-sm hover:bg-surface-2"}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <form className="mb-4 grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-6" role="search">
        <input type="hidden" name="view" value={view} />
        <FilterField label="Invoice number"><Input name="q" defaultValue={q} placeholder="e.g. 26-27/041" /></FilterField>
        <FilterField label="Client">
          <Select name="client" defaultValue={client}>
            <option value="">All clients</option>
            {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.trading_name || c.legal_name}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Billing month"><Input name="period" type="month" defaultValue={period} /></FilterField>
        <FilterField label="Due from"><Input name="from" type="date" defaultValue={from} /></FilterField>
        <FilterField label="Due to"><Input name="to" type="date" defaultValue={to} /></FilterField>
        <Button variant="secondary" type="submit">Apply</Button>
      </form>

      {error && <Alert tone="danger" title="Could not load invoices">{error.message}</Alert>}
      {!error && invoices.length === 0 ? (
        <EmptyState
          title="No invoices in this view"
          action={ctx.canWrite && view === "open" && <ButtonLink href="/invoices/import">Import your Swipe invoices</ButtonLink>}
        />
      ) : (
        <>
          <Table head={["Invoice", "Client", "Due", "Total", "Received", "Outstanding", "State", "Source"]}>
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-surface-2/60">
                <Td>
                  <Link href={`/invoices/${inv.id}`} className="font-medium whitespace-nowrap hover:underline">{inv.invoice_number}</Link>
                  <div className="text-xs text-muted">{formatDate(inv.invoice_date)}</div>
                </Td>
                <Td><Link href={`/clients/${inv.client_id}`} className="hover:underline">{inv.client_trading_name || inv.client_legal_name}</Link></Td>
                <Td>
                  {formatDate(inv.effective_due_date)}
                  {inv.extended_due_date && <div className="text-xs text-info">Extended</div>}
                </Td>
                <Td numeric>{formatMoney(inv.total_minor, inv.currency)}</Td>
                <Td numeric>{formatMoney(inv.amount_received_minor, inv.currency)}</Td>
                <Td numeric className="font-medium">{formatMoney(inv.outstanding_minor, inv.currency)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <AgeingBadge bucket={inv.ageing_bucket} days={inv.days_overdue} />
                    {inv.status !== "cancelled" && inv.payment_state !== "unpaid" && <PaymentStateBadge state={inv.payment_state} />}
                  </div>
                </Td>
                <Td><SyncBadge status={inv.sync_status} channel={inv.source_channel} /></Td>
              </tr>
            ))}
          </Table>
          <p className="tabular mt-3 text-right text-sm text-muted">
            {invoices.length} invoice{invoices.length === 1 ? "" : "s"} · outstanding {formatMoney(outstanding)}
            {invoices.length === 500 && " · showing the first 500, narrow the filters"}
          </p>
        </>
      )}
    </>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      {children}
    </label>
  );
}
