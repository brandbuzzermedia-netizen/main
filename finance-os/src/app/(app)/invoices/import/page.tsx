import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import from Swipe" };

export default async function ImportPage() {
  const ctx = await getContext();
  if (!ctx.canWrite) redirect("/invoices");
  const { data } = await ctx.supabase.from("clients").select("id, legal_name, trading_name").eq("organization_id", ctx.org.id);
  const names = Object.fromEntries((data ?? []).map((c) => [c.id, c.trading_name || c.legal_name]));
  return (
    <>
      <PageHeader
        title="Import invoices from Swipe"
        description="Upload a CSV export of your Swipe invoices. The official invoices stay in Swipe; this records references to them so collections can be tracked."
      />
      <ImportWizard clientNames={names} />
    </>
  );
}
