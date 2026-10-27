import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { DEAL_COLUMNS, loadDealStages } from "@/lib/crm";
import { loadLeadContext, memberName } from "@/lib/leads";
import type { Deal } from "@/lib/db-types";
import { dealCategoryTone, dealTypeLabel } from "@/domain/labels";
import { formatMoney } from "@/domain/money";
import { formatDate } from "@/domain/dates";
import { Badge, Card, Dl, PageHeader } from "@/components/ui";
import { DealForm } from "../deal-form";
import { deleteDealAction, updateDealAction } from "../../crm-actions";

export const metadata: Metadata = { title: "Deal" };

export default async function DealPage({ params }: PageProps<"/deals/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  const { data } = await ctx.supabase.from("deals").select(DEAL_COLUMNS).eq("id", id).eq("organization_id", ctx.org.id).maybeSingle();
  if (!data) notFound();
  const deal = data as unknown as Deal;
  const [stages, ref, { data: lead }] = await Promise.all([
    loadDealStages(ctx),
    loadLeadContext(ctx),
    ctx.supabase.from("leads").select("id, full_name, owner_id").eq("id", deal.lead_id).maybeSingle(),
  ]);
  const stage = stages.find((s) => s.id === deal.stage_id);
  const canEdit = ctx.can.assignLeads || (ctx.role === "sales_rep" && lead?.owner_id === ctx.userId);
  const members = new Map(ref.members.map((m) => [m.user_id, m]));
  return (
    <>
      <div className="mb-2 text-sm"><Link href="/deals" className="text-muted hover:text-ink">← Deals</Link></div>
      <PageHeader
        title={deal.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {stage && <Badge tone={dealCategoryTone[stage.category]}>{stage.name}</Badge>}
            <span>{dealTypeLabel[deal.deal_type]}</span>
            {lead && <span>· with <Link className="text-brand hover:underline" href={`/leads/${lead.id}`}>{lead.full_name}</Link></span>}
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card title={canEdit ? "Edit deal" : "Deal"}>
          {canEdit ? (
            <DealForm
              action={updateDealAction.bind(null, deal.id)}
              deal={deal}
              stages={stages}
              members={ref.members.map((m) => ({ id: m.user_id, label: memberName(m) }))}
              canAssign={ctx.can.assignLeads}
              defaultCurrency={ctx.org.default_currency}
              submitLabel="Save deal"
            />
          ) : (
            <Dl items={[["Property", deal.property_ref], ["Notes", deal.notes]]} />
          )}
        </Card>
        <div className="flex flex-col gap-6">
          <Card title="Summary">
            <Dl items={[
              ["Value", formatMoney(deal.value_minor, deal.currency)],
              ["Commission", formatMoney(deal.commission_minor, deal.currency)],
              ["Weighted commission", stage?.category === "open" && deal.commission_minor !== null ? `${formatMoney(Math.round(deal.commission_minor * stage.probability / 100), deal.currency)} (${stage.probability}%)` : "—"],
              ["Owner", deal.owner_id ? memberName(members.get(deal.owner_id)) : "Unassigned"],
              ["Expected close", deal.expected_close_date ? formatDate(deal.expected_close_date) : null],
              ["Closed", deal.closed_at ? formatDate(deal.closed_at, ctx.org.timezone) : null],
              ["Opened", formatDate(deal.created_at, ctx.org.timezone)],
            ]} />
          </Card>
          {ctx.can.assignLeads && (
            <form action={deleteDealAction.bind(null, deal.id)}>
              <button className="text-sm text-muted hover:text-danger">Delete this deal</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
