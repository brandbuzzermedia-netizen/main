import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { PaymentForm } from "./payment-form";

export const metadata: Metadata = { title: "Record payment" };

export default async function NewPaymentPage({ searchParams }: PageProps<"/payments/new">) {
  const ctx = await getContext();
  if (!ctx.canWrite) redirect("/payments");
  const { client } = await searchParams;
  const { data } = await ctx.supabase.from("clients").select("id, legal_name, trading_name").eq("organization_id", ctx.org.id).order("legal_name");
  return (
    <>
      <PageHeader title="Record a payment" description="For money you can see in the bank. Bank statements can also be imported in bulk." />
      <PaymentForm
        clients={(data ?? []).map((c) => ({ id: c.id as string, name: (c.trading_name || c.legal_name) as string }))}
        defaultClient={typeof client === "string" ? client : undefined}
      />
    </>
  );
}
