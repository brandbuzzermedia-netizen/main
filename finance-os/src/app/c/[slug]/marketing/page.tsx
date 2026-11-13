import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { RESOURCES } from "@/lib/resources";
import { refOptionsFor } from "@/lib/list-helpers";
import { designFor } from "@/domain/design";
import { Cta, PageHead } from "@/components/dp/shell";
import { Modal } from "@/components/dp/modal";
import { RecordForm } from "@/components/record-form";
import { ListView, NOTES } from "@/views/list";

export const metadata: Metadata = { title: "Marketing" };
const STATUS: Record<string, string> = { draft: "Draft, needs approval", submitted: "Waiting for approval", approved: "Approved", rejected: "Rejected", published: "Live" };

export default async function MarketingPage({ params, searchParams }: PageProps<"/c/[slug]/marketing">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("operations.read") && !ctx.can("crm.read_all")) notFound();
  const d = designFor(slug);
  const base = `/c/${slug}/marketing`;
  const { data } = await ctx.supabase.from("ad_approvals").select("headline, channel, status").eq("organization_id", ctx.company.id).order("created_at", { ascending: false }).limit(200);
  const [title, lines] = NOTES.marketing;
  const canAdd = ctx.can("operations.write");
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title={d.ren.marketing ?? "Marketing"} right={canAdd ? <Cta href={`${base}?add=1`}>+ Add</Cta> : undefined} />
      <ListView vm={{
        head: ["CAMPAIGN", "CHANNEL", "STATUS", "SPEND"],
        rows: ((data ?? []) as { headline: string; channel: string; status: string }[]).map((a) => ({ a: a.headline, b: a.channel, c: STATUS[a.status] ?? a.status, d: "—" })),
        empty: "No campaigns yet. Every external activation waits for approval.", noteTitle: title, noteLines: lines,
        more: ctx.can("compliance.verify") ? <a href={`/c/${slug}/operations`} style={{ fontSize: 13.5, color: "var(--co-side)", fontWeight: 600 }}>Approve or reject waiting ads →</a> : undefined,
      }} />
      {sp.add && canAdd && <Modal title="New campaign" closeHref={base}><RecordForm slug={slug} resource="ads" fields={RESOURCES.ads.fields} refOptions={await refOptionsFor(ctx, "ads")} /></Modal>}
    </>
  );
}
