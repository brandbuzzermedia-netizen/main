import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { PropertyForm } from "@/components/properties";

export const metadata: Metadata = { title: "Add property" };

export default async function NewPropertyPage() {
  const ctx = await getContext();
  if (!ctx.can.assignLeads) notFound();
  return (
    <>
      <PageHeader title="Add property" />
      <Card><PropertyForm defaultCurrency={ctx.org.default_currency} /></Card>
    </>
  );
}
