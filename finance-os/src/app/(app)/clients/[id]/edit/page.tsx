import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import type { Client } from "@/lib/db-types";
import { PageHeader } from "@/components/ui";
import { ClientForm } from "../../client-form";
import { updateClientAction } from "../../actions";
import { listMembers } from "../../members";

export const metadata: Metadata = { title: "Edit client" };

export default async function EditClientPage({ params }: PageProps<"/clients/[id]/edit">) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx.canWrite) redirect(`/clients/${id}`);
  const { data } = await ctx.supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const client = data as Client;
  return (
    <>
      <PageHeader title={`Edit ${client.legal_name}`} />
      <ClientForm action={updateClientAction.bind(null, id)} client={client} members={await listMembers(ctx)} isNew={false} />
    </>
  );
}
