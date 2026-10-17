import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import type { ClientBalance } from "@/lib/db-types";
import { formatMoney } from "@/domain/money";
import { Alert, ButtonLink, EmptyState, Input, PageHeader, Select, Table, Td, Button } from "@/components/ui";
import { ServiceStatusBadge } from "@/components/status";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const ctx = await getContext();

  let query = ctx.supabase.from("client_balances").select("*").eq("organization_id", ctx.org.id);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`legal_name.ilike.%${safe}%,trading_name.ilike.%${safe}%,client_code.ilike.%${safe}%`);
  }
  if (status) query = query.eq("service_status", status);
  const { data, error } = await query.order("outstanding_minor", { ascending: false }).order("legal_name");
  const clients = (data ?? []) as ClientBalance[];

  return (
    <>
      <PageHeader
        title="Clients"
        description="Balances are computed from Swipe invoice references and verified payments only."
        actions={ctx.canWrite && <ButtonLink href="/clients/new">New client</ButtonLink>}
      />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
        <Input name="q" defaultValue={q} placeholder="Search name or code" aria-label="Search clients" className="sm:max-w-xs" />
        <Select name="status" defaultValue={status} aria-label="Service status" className="sm:max-w-[180px]">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="onboarding">Onboarding</option>
          <option value="paused">Paused</option>
          <option value="suspended">Suspended</option>
          <option value="offboarded">Offboarded</option>
        </Select>
        <Button variant="secondary" type="submit">Filter</Button>
      </form>
      {error && <Alert tone="danger" title="Could not load clients">{error.message}</Alert>}
      {!error && clients.length === 0 ? (
        <EmptyState
          title={q || status ? "No clients match these filters" : "No clients yet"}
          action={ctx.canWrite && !q && !status && <ButtonLink href="/clients/new">Add your first client</ButtonLink>}
        >
          {!q && !status && "Add each retainer client once. Swipe invoices are matched to clients by GSTIN or name."}
        </EmptyState>
      ) : (
        <Table head={["Client", "Status", "Open invoices", "Outstanding", "Overdue", "Oldest overdue"]}>
          {clients.map((c) => (
            <tr key={c.client_id} className="hover:bg-surface-2/60">
              <Td>
                <Link href={`/clients/${c.client_id}`} className="font-medium hover:underline">{c.trading_name || c.legal_name}</Link>
                <div className="text-xs text-muted">{c.client_code} · {c.legal_name}</div>
              </Td>
              <Td><ServiceStatusBadge status={c.service_status} /></Td>
              <Td numeric>{c.open_invoice_count}</Td>
              <Td numeric>{formatMoney(c.outstanding_minor)}</Td>
              <Td numeric className={c.overdue_minor > 0 ? "text-danger" : ""}>{formatMoney(c.overdue_minor)}</Td>
              <Td numeric>{c.oldest_days_overdue > 0 ? `${c.oldest_days_overdue} days` : "—"}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
