import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import type { BillingContact, Client, ClientBalance, Contract, InvoiceBalance } from "@/lib/db-types";
import { formatMoney } from "@/domain/money";
import { formatDate } from "@/domain/dates";
import { Badge, ButtonLink, Card, Dl, EmptyState, PageHeader, Stat, Table, Td } from "@/components/ui";
import { AgeingBadge, PaymentStateBadge, ServiceStatusBadge } from "@/components/status";
import { addContactAction, removeContactAction } from "../actions";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Client" };

const FREQ: Record<string, string> = { monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-yearly", yearly: "Yearly", one_time: "One-time" };

export default async function ClientPage({ params }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  const [clientRes, balanceRes, contactsRes, contractsRes, invoicesRes] = await Promise.all([
    ctx.supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    ctx.supabase.from("client_balances").select("*").eq("client_id", id).maybeSingle(),
    ctx.supabase.from("billing_contacts").select("*").eq("client_id", id).order("is_primary", { ascending: false }).order("name"),
    ctx.supabase.from("contracts").select("*").eq("client_id", id).order("start_date", { ascending: false }),
    ctx.supabase.from("invoice_balances").select("*").eq("client_id", id).order("invoice_date", { ascending: false }).limit(50),
  ]);
  if (!clientRes.data) notFound();
  const client = clientRes.data as Client;
  const balance = balanceRes.data as ClientBalance | null;
  const contacts = (contactsRes.data ?? []) as BillingContact[];
  const contracts = (contractsRes.data ?? []) as Contract[];
  const invoices = (invoicesRes.data ?? []) as InvoiceBalance[];
  const contract = contracts.find((c) => c.status === "active") ?? contracts[0];

  return (
    <>
      <PageHeader
        title={client.trading_name || client.legal_name}
        description={<>{client.client_code} · {client.legal_name}{client.gstin && <> · GSTIN {client.gstin}</>}</>}
        actions={ctx.canWrite && <ButtonLink variant="secondary" href={`/clients/${id}/edit`}>Edit client</ButtonLink>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Outstanding" value={formatMoney(balance?.outstanding_minor ?? 0)} hint="Invoiced, not yet verified as paid" />
        <Stat label="Overdue" value={formatMoney(balance?.overdue_minor ?? 0)} tone={(balance?.overdue_minor ?? 0) > 0 ? "danger" : "default"}
          hint={balance?.oldest_days_overdue ? `Oldest ${balance.oldest_days_overdue} days` : "Nothing overdue"} />
        <Stat label="Monthly retainer" value={formatMoney(client.monthly_retainer_minor)} hint={`${FREQ[client.billing_frequency]} · before GST`} />
        <Stat label="Missed commitments" value={client.missed_commitments_count} tone={client.missed_commitments_count > 0 ? "warn" : "default"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Invoices" actions={ctx.canWrite && <Link className="text-sm text-brand hover:underline" href={`/invoices/new?client=${id}`}>Add invoice</Link>}>
            {invoices.length === 0 ? (
              <EmptyState title="No invoices yet">Import a Swipe export or add an invoice reference manually.</EmptyState>
            ) : (
              <div className="-m-4">
                <Table head={["Invoice", "Due", "Total", "Outstanding", "State"]}>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <Td>
                        <Link href={`/invoices/${inv.id}`} className="font-medium whitespace-nowrap hover:underline">{inv.invoice_number}</Link>
                        <div className="text-xs text-muted">{formatDate(inv.invoice_date)}</div>
                      </Td>
                      <Td>{formatDate(inv.effective_due_date)}</Td>
                      <Td numeric>{formatMoney(inv.total_minor, inv.currency)}</Td>
                      <Td numeric>{formatMoney(inv.outstanding_minor, inv.currency)}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          <AgeingBadge bucket={inv.ageing_bucket} days={inv.days_overdue} />
                          {inv.status !== "cancelled" && <PaymentStateBadge state={inv.payment_state} />}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>

          <Card title="Billing contacts">
            {contacts.length === 0 ? (
              <p className="mb-4 text-sm text-muted">No billing contacts. Reminders cannot be sent until one is added.</p>
            ) : (
              <ul className="mb-5 divide-y divide-line">
                {contacts.map((c) => (
                  <li key={c.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-medium">
                        {c.name} {c.is_primary && <Badge tone="brand">Primary</Badge>}{" "}
                        {!c.receives_reminders && <Badge>No reminders</Badge>}
                      </div>
                      <div className="text-sm text-muted">
                        {[c.email, c.whatsapp_e164].filter(Boolean).join(" · ")}
                      </div>
                      <div className="text-xs text-muted">
                        WhatsApp: {c.whatsapp_e164 ? (c.whatsapp_consent_at ? `opted in ${formatDate(c.whatsapp_consent_at)} (${c.whatsapp_consent_note})` : "no recorded opt-in, so WhatsApp will not be used") : "—"}
                      </div>
                    </div>
                    {ctx.canWrite && (
                      <form action={removeContactAction.bind(null, id, c.id)}>
                        <button className="text-sm text-danger hover:underline">Remove</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {ctx.canWrite && <ContactForm action={addContactAction.bind(null, id)} />}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Account">
            <Dl
              items={[
                ["Service status", <ServiceStatusBadge key="s" status={client.service_status} />],
                ["Payment terms", `${client.payment_terms_days} days`],
                ["Invoice day", client.invoice_day ? `Day ${client.invoice_day}` : "—"],
                ["Automated reminders", client.communication_paused ? <Badge key="p" tone="warn">Paused</Badge> : "On"],
                ["Names in Swipe", client.source_aliases.length ? client.source_aliases.join(", ") : "—"],
              ]}
            />
          </Card>
          <Card title="Contract">
            {contract ? (
              <Dl
                items={[
                  ["Status", contract.status],
                  ["Term", `${formatDate(contract.start_date)} – ${contract.end_date ? formatDate(contract.end_date) : "rolling"}`],
                  ["Retainer", formatMoney(contract.monthly_retainer_minor, contract.currency)],
                  ["Final deadline", `${contract.final_deadline_days} days after due → founder review`],
                ]}
              />
            ) : (
              <p className="text-sm text-muted">No contract recorded.</p>
            )}
          </Card>
          {client.notes && (
            <Card title="Notes">
              <p className="whitespace-pre-wrap text-sm">{client.notes}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
