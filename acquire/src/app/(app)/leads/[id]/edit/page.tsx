import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { loadLeadContext, memberName } from "@/lib/leads";
import type { Lead } from "@/lib/db-types";
import { toLocalInput } from "@/domain/dates";
import { PageHeader } from "@/components/ui";
import { LeadForm } from "../../lead-form";
import { updateLeadAction } from "../../actions";

export const metadata: Metadata = { title: "Edit lead" };

export default async function EditLeadPage({ params }: PageProps<"/leads/[id]/edit">) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx.can.createLeads) notFound();
  const [{ data: lead }, ref] = await Promise.all([
    ctx.supabase.from("leads").select("*").eq("id", id).eq("organization_id", ctx.org.id).maybeSingle(),
    loadLeadContext(ctx),
  ]);
  if (!lead) notFound();
  const l = lead as Lead;
  return (
    <>
      <PageHeader title={`Edit ${l.full_name}`} />
      <LeadForm
        action={updateLeadAction.bind(null, l.id)}
        lead={l}
        stages={ref.stages}
        sources={ref.sources}
        members={ref.members.map((m) => ({ id: m.user_id, label: memberName(m) }))}
        canAssign={ctx.can.assignLeads}
        defaultCurrency={ctx.org.default_currency}
        followUpLocal={toLocalInput(l.next_follow_up_at, ctx.org.timezone)}
        submitLabel="Save changes"
      />
    </>
  );
}
