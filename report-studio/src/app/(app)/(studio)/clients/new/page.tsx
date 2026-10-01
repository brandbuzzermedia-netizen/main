import type { Metadata } from "next";
import { saveClient } from "@/app/(app)/actions";
import { ClientForm } from "@/components/studio/client-form";
import { PageHeader } from "@/components/studio/views";

export const metadata: Metadata = { title: "Add client" };

export default function NewClientPage() {
  return (
    <>
      <PageHeader title="Add client" sub="Brand colours and logo are added under Brand assets." />
      <ClientForm action={saveClient} />
    </>
  );
}
