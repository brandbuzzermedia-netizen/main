import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { CampaignForm } from "@/components/outreach";

export const metadata: Metadata = { title: "New sequence" };

export default async function NewCampaignPage() {
  const ctx = await getContext();
  if (!ctx.can.assignLeads) notFound();
  const { data } = await ctx.supabase.from("message_templates").select("id, name, channel").eq("organization_id", ctx.org.id).eq("status", "approved").order("name");
  return (
    <>
      <PageHeader title="New sequence" description="Saved as a draft. Activate it once every step uses an approved template." />
      <Card><CampaignForm templates={(data ?? []) as { id: string; name: string; channel: "email" | "sms" }[]} /></Card>
    </>
  );
}
