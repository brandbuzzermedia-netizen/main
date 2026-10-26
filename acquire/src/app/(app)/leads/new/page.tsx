import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { loadLeadContext, memberName } from "@/lib/leads";
import { PageHeader } from "@/components/ui";
import { LeadForm } from "../lead-form";
import { createLeadAction } from "../actions";

export const metadata: Metadata = { title: "New lead" };

export default async function NewLeadPage() {
  const ctx = await getContext();
  if (!ctx.can.createLeads) notFound();
  const ref = await loadLeadContext(ctx);
  return (
    <>
      <PageHeader title="New lead" description="Add one prospect. Duplicates are detected by email and phone." />
      <LeadForm
        action={createLeadAction}
        stages={ref.stages}
        sources={ref.sources}
        members={ref.members.map((m) => ({ id: m.user_id, label: memberName(m) }))}
        canAssign={ctx.can.assignLeads}
        defaultCurrency={ctx.org.default_currency}
        followUpLocal=""
        submitLabel="Create lead"
      />
    </>
  );
}
