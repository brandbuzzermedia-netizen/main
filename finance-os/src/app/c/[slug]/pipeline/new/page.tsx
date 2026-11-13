import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext, ROLE_LABELS } from "@/lib/workspace";
import { loadMembers } from "@/lib/people";
import { EmptyState, PageHeader } from "@/components/ui";
import { DealForm } from "../../forms";

export const metadata: Metadata = { title: "New deal" };

export default async function NewDealPage({ params }: PageProps<"/c/[slug]/pipeline/new">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  const canAssign = ctx.can("crm.read_all");
  const [stages, members] = await Promise.all([
    ctx.supabase.from("pipeline_stages").select("id, name, kind").eq("organization_id", ctx.company.id).order("position"),
    canAssign ? loadMembers(ctx.supabase, ctx.company.id) : Promise.resolve([]),
  ]);
  if (stages.error) throw new Error(stages.error.message);
  const open = (stages.data ?? []).filter((s) => s.kind !== "won" && s.kind !== "lost");
  return (
    <>
      <PageHeader title="New deal" description={`Added to ${ctx.company.name} only.`} />
      {open.length === 0 ? (
        <EmptyState title="No pipeline stages">Stages are set when the company is created from the registry. Ask the company owner to configure them.</EmptyState>
      ) : (
        <DealForm slug={slug} canAssign={canAssign}
          stages={open.map((s) => ({ id: s.id as string, label: s.name as string }))}
          people={members.filter((m) => m.user_id !== ctx.userId && m.role !== "partner" && m.role !== "accountant")
            .map((m) => ({ id: m.user_id, label: `${m.name} · ${ROLE_LABELS[m.role] ?? m.role}` }))} />
      )}
    </>
  );
}
