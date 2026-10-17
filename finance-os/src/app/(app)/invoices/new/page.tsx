import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { ManualInvoiceForm } from "./manual-invoice-form";

export const metadata: Metadata = { title: "Add invoice" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/invoices/new">) {
  const ctx = await getContext();
  if (!ctx.canWrite) redirect("/invoices");
  const { client } = await searchParams;
  const { data } = await ctx.supabase.from("clients").select("id, legal_name, trading_name").eq("organization_id", ctx.org.id).order("legal_name");
  const clients = (data ?? []).map((c) => ({ id: c.id as string, name: (c.trading_name || c.legal_name) as string }));
  return (
    <>
      <PageHeader
        title="Add an invoice reference"
        description="Use this when an invoice was raised in Swipe and you are not importing an export. This does not create an invoice in Swipe."
      />
      {clients.length === 0 ? (
        <EmptyState title="Add a client first" action={<ButtonLink href="/clients/new">New client</ButtonLink>} />
      ) : (
        <ManualInvoiceForm clients={clients} defaultClient={typeof client === "string" ? client : undefined} />
      )}
    </>
  );
}
