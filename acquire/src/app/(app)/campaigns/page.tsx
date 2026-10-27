import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { Badge, ButtonLink, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { CampaignTabs } from "./tabs";

export const metadata: Metadata = { title: "Campaigns" };

const tone = { draft: "neutral", active: "ok", paused: "warn", archived: "neutral" } as const;

export default async function CampaignsPage() {
  const ctx = await getContext();
  const [{ data: campaigns, error }, { data: enrollments }] = await Promise.all([
    ctx.supabase.from("campaigns").select("id, name, status, steps, created_at").eq("organization_id", ctx.org.id).neq("status", "archived").order("created_at", { ascending: false }),
    ctx.supabase.from("campaign_enrollments").select("campaign_id, status").eq("organization_id", ctx.org.id),
  ]);
  if (error) throw new Error(error.message);
  const counts = new Map<string, Record<string, number>>();
  for (const e of enrollments ?? []) {
    const c = counts.get(e.campaign_id) ?? {};
    c[e.status] = (c[e.status] ?? 0) + 1;
    counts.set(e.campaign_id, c);
  }
  return (
    <>
      <PageHeader title="Campaigns" description="Follow-up sequences: email and SMS steps sent over days, each one re-checked for consent, suppression and contact hours before it goes out."
        actions={ctx.can.assignLeads ? <ButtonLink href="/campaigns/new">New sequence</ButtonLink> : undefined} />
      <CampaignTabs active="sequences" />
      {!campaigns?.length ? (
        <EmptyState title="No sequences yet" action={ctx.can.assignLeads ? <ButtonLink href="/campaigns/templates">Start with a template</ButtonLink> : undefined}>
          Write and approve message templates, then build a sequence such as Day 0 email, Day 1 SMS, Day 3 email.
        </EmptyState>
      ) : (
        <Table head={["Sequence", "Status", "Steps", "Active", "Held for review", "Completed", "Stopped"]}>
          {campaigns.map((c) => {
            const n = counts.get(c.id) ?? {};
            return (
              <tr key={c.id}>
                <Td><Link className="font-medium hover:text-brand" href={`/campaigns/${c.id}`}>{c.name}</Link></Td>
                <Td><Badge tone={tone[c.status as keyof typeof tone]}>{c.status}</Badge></Td>
                <Td numeric>{(c.steps as unknown[]).length}</Td>
                <Td numeric>{n.active ?? 0}</Td>
                <Td numeric>{n.held ? <span className="text-warn">{n.held}</span> : 0}</Td>
                <Td numeric>{n.completed ?? 0}</Td>
                <Td numeric>{n.stopped ?? 0}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
