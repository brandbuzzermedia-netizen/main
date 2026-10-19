import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import type { PaymentRow } from "@/lib/db-types";
import { formatMoney } from "@/domain/money";
import { formatDate } from "@/domain/dates";
import { Alert, Badge, ButtonLink, EmptyState, PageHeader, Stat, Table, Td } from "@/components/ui";
import { METHOD_LABEL, SOURCE_LABEL, VerificationBadge } from "@/components/payment-status";

export const metadata: Metadata = { title: "Payments" };

const VIEWS = {
  attention: "Needs attention",
  pending: "Awaiting verification",
  unallocated: "Unallocated",
  verified: "Verified",
  refunds: "Refunds",
  all: "All",
} as const;
type View = keyof typeof VIEWS;

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const sp = await searchParams;
  const view: View = typeof sp.view === "string" && sp.view in VIEWS ? (sp.view as View) : "attention";
  const ctx = await getContext();

  let q = ctx.supabase.from("payment_list").select("*").eq("organization_id", ctx.org.id);
  if (view === "attention") q = q.eq("kind", "receipt").neq("verification_status", "rejected").or("verification_status.eq.pending_verification,unallocated_minor.gt.0");
  else if (view === "pending") q = q.eq("verification_status", "pending_verification");
  else if (view === "unallocated") q = q.eq("kind", "receipt").eq("verification_status", "verified").gt("unallocated_minor", 0);
  else if (view === "verified") q = q.eq("verification_status", "verified");
  else if (view === "refunds") q = q.eq("kind", "refund");
  const [{ data, error }, { data: summary }] = await Promise.all([
    q.order("payment_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
    ctx.supabase.from("payment_list").select("verification_status, unallocated_minor, amount_minor, kind").eq("organization_id", ctx.org.id).neq("verification_status", "rejected"),
  ]);
  const rows = (data ?? []) as PaymentRow[];
  const all = (summary ?? []) as Pick<PaymentRow, "verification_status" | "unallocated_minor" | "amount_minor" | "kind">[];
  const pending = all.filter((p) => p.verification_status === "pending_verification");
  const unallocated = all.filter((p) => p.kind === "receipt" && p.verification_status === "verified" && p.unallocated_minor > 0);

  return (
    <>
      <PageHeader
        title="Payments"
        description="Money received, matched to Swipe invoices. Only verified payments reduce what a client owes."
        actions={
          ctx.canWrite && (
            <>
              <ButtonLink href="/payments/import">Import bank statement</ButtonLink>
              <ButtonLink variant="secondary" href="/payments/new">Record payment</ButtonLink>
            </>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Stat label="Awaiting verification" value={formatMoney(pending.reduce((s, p) => s + p.amount_minor, 0), "INR", { compact: true })}
          hint={`${pending.length} payment(s). Not counted as cash until verified`} tone={pending.length ? "warn" : "default"} />
        <Stat label="Verified but unallocated" value={formatMoney(unallocated.reduce((s, p) => s + p.unallocated_minor, 0), "INR", { compact: true })}
          hint={`${unallocated.length} receipt(s). Match to invoices or keep as advance`} tone={unallocated.length ? "warn" : "default"} />
      </div>

      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Payment views">
        {Object.entries(VIEWS).map(([key, label]) => (
          <Link key={key} href={`/payments?view=${key}`} aria-current={view === key ? "page" : undefined}
            className={view === key ? "rounded-lg bg-ink px-3 py-1.5 text-sm text-bg" : "rounded-lg px-3 py-1.5 text-sm hover:bg-surface-2"}>
            {label}
          </Link>
        ))}
      </nav>

      {error && <Alert tone="danger" title="Could not load payments">{error.message}</Alert>}
      {!error && rows.length === 0 ? (
        <EmptyState title={view === "attention" ? "Nothing needs attention" : "No payments in this view"}>
          {view === "attention" && "Every recorded payment is verified and allocated."}
        </EmptyState>
      ) : (
        <Table head={["Date", "Client", "Reference", "Method", "Amount", "Unallocated", "Status"]}>
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-surface-2/60">
              <Td>{formatDate(p.payment_date)}</Td>
              <Td>
                {p.client_id ? (
                  <Link href={`/clients/${p.client_id}`} className="hover:underline">{p.client_trading_name || p.client_legal_name}</Link>
                ) : (
                  <span className="text-warn">Unmatched{p.payer_name && <span className="block text-xs text-muted">{p.payer_name}</span>}</span>
                )}
              </Td>
              <Td>
                <Link href={`/payments/${p.id}`} className="font-medium whitespace-nowrap hover:underline">{p.transaction_reference}</Link>
                <div className="text-xs text-muted">{SOURCE_LABEL[p.source]}</div>
              </Td>
              <Td>{METHOD_LABEL[p.method]}</Td>
              <Td numeric className={p.kind === "refund" ? "text-danger" : ""}>{p.kind === "refund" ? "−" : ""}{formatMoney(p.amount_minor, p.currency)}</Td>
              <Td numeric>{p.kind === "receipt" && p.unallocated_minor > 0 ? formatMoney(p.unallocated_minor, p.currency) : "—"}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  <VerificationBadge status={p.verification_status} />
                  {p.kind === "refund" && <Badge tone="danger">Refund</Badge>}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
