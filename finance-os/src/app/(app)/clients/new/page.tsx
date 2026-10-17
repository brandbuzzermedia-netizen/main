import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ClientForm } from "../client-form";
import { createClientAction } from "../actions";
import { listMembers } from "../members";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  const ctx = await getContext();
  if (!ctx.canWrite) redirect("/clients");
  return (
    <>
      <PageHeader title="New client" description="Create the client once here; invoices are then matched to it from Swipe." />
      <ClientForm action={createClientAction} members={await listMembers(ctx)} isNew />
    </>
  );
}
