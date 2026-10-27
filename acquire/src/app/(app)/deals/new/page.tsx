import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { loadDealStages } from "@/lib/crm";
import { loadLeadContext, memberName } from "@/lib/leads";
import { Card, PageHeader } from "@/components/ui";
import { DealForm } from "../deal-form";
import { createDealAction } from "../../crm-actions";

export const metadata: Metadata = { title: "New deal" };

export default async function NewDealPage({ searchParams }: PageProps<"/deals/new">) {
  const ctx = await getContext();
  const { lead: leadId } = await searchParams;
  if (!ctx.can.workCrm || typeof leadId !== "string") notFound();
  const { data: lead } = await ctx.supabase.from("leads").select("id, full_name, preferred_location, segment, currency").eq("id", leadId).eq("organization_id", ctx.org.id).maybeSingle();
  if (!lead) notFound();
  const [stages, ref] = await Promise.all([loadDealStages(ctx), loadLeadContext(ctx)]);
  return (
    <>
      <div className="mb-2 text-sm"><Link href={`/leads/${lead.id}`} className="text-muted hover:text-ink">← {lead.full_name}</Link></div>
      <PageHeader title="New deal" description={`An opportunity with ${lead.full_name}. Its value and commission feed the dashboard's pipeline and revenue figures.`} />
      <Card>
        <DealForm
          action={createDealAction.bind(null, lead.id)}
          stages={stages}
          members={ref.members.map((m) => ({ id: m.user_id, label: memberName(m) }))}
          canAssign={ctx.can.assignLeads}
          defaultCurrency={lead.currency ?? ctx.org.default_currency}
          defaultTitle={`${lead.full_name}${lead.preferred_location ? ` · ${lead.preferred_location}` : ""}`}
          submitLabel="Open deal"
        />
      </Card>
    </>
  );
}
