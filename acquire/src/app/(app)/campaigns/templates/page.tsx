import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { formatDate } from "@/domain/dates";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { TemplateForm } from "@/components/outreach";
import { setTemplateStatusAction } from "../../outreach-actions";
import { CampaignTabs } from "../tabs";

export const metadata: Metadata = { title: "Templates" };

type T = { id: string; name: string; channel: "email" | "sms"; subject: string | null; body: string; status: "draft" | "approved" | "archived"; approved_at: string | null };

export default async function TemplatesPage({ searchParams }: PageProps<"/campaigns/templates">) {
  const ctx = await getContext();
  const { edit } = await searchParams;
  const { data, error } = await ctx.supabase.from("message_templates").select("id, name, channel, subject, body, status, approved_at")
    .eq("organization_id", ctx.org.id).neq("status", "archived").order("name");
  if (error) throw new Error(error.message);
  const templates = (data ?? []) as T[];
  const editing = templates.find((t) => t.id === edit);
  return (
    <>
      <PageHeader title="Campaigns" description="Message templates. A template must be approved before a sequence can use it; editing approved text sends it back to draft." />
      <CampaignTabs active="templates" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-3">
          {templates.length === 0 && <EmptyState title="No templates yet">Create your first email or SMS template.</EmptyState>}
          {templates.map((t) => (
            <Card key={t.id} title={<span className="flex items-center gap-2">{t.name} <Badge>{t.channel}</Badge> <Badge tone={t.status === "approved" ? "ok" : "warn"}>{t.status}</Badge></span>}
              actions={ctx.can.assignLeads ? (
                <div className="flex items-center gap-3 text-xs">
                  <Link className="text-brand" href={`/campaigns/templates?edit=${t.id}`}>Edit</Link>
                  {t.status === "draft"
                    ? <form action={setTemplateStatusAction.bind(null, t.id, "approved")}><button className="text-ok">Approve</button></form>
                    : <form action={setTemplateStatusAction.bind(null, t.id, "draft")}><button className="text-muted">Unapprove</button></form>}
                  <form action={setTemplateStatusAction.bind(null, t.id, "archived")}><button className="text-muted hover:text-danger">Archive</button></form>
                </div>
              ) : undefined}>
              {t.subject && <div className="mb-1 text-sm font-medium">{t.subject}</div>}
              <p className="text-sm whitespace-pre-wrap text-muted">{t.body}</p>
              {t.approved_at && <p className="mt-2 text-xs text-muted">Approved {formatDate(t.approved_at, ctx.org.timezone)}</p>}
            </Card>
          ))}
        </div>
        {ctx.can.assignLeads && (
          <Card title={editing ? `Edit “${editing.name}”` : "New template"} actions={editing ? <Link className="text-xs text-muted" href="/campaigns/templates">Cancel</Link> : undefined}>
            <TemplateForm key={editing?.id ?? "new"} template={editing} />
          </Card>
        )}
      </div>
    </>
  );
}
