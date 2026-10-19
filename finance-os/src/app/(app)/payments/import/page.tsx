import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { BankWizard } from "./bank-wizard";

export const metadata: Metadata = { title: "Import bank statement" };

export default async function BankImportPage() {
  const ctx = await getContext();
  if (!ctx.canWrite) redirect("/payments");
  return (
    <>
      <PageHeader
        title="Import a bank statement"
        description="Credits in your bank statement become verified receipts. Clients are matched from the narration; only unambiguous exact amounts are allocated automatically."
      />
      <BankWizard />
    </>
  );
}
