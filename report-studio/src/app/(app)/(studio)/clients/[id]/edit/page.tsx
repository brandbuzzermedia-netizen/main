import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientForm } from "@/components/studio/client-form";
import { PageHeader } from "@/components/studio/views";
import { getClient } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Edit client" };

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const client = await getClient((await params).id);
  if (!client) notFound();
  return (
    <>
      <PageHeader title={`Edit ${client.name}`} />
      <ClientForm client={client} />
    </>
  );
}
