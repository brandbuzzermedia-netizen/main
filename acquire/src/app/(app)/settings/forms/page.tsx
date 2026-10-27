import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { loadLeadContext, memberName } from "@/lib/leads";
import { appUrl, unsubscribeSecret } from "@/lib/env";
import { Alert, Badge, Card, EmptyState } from "@/components/ui";
import { LeadFormEditor, type LeadFormValues } from "@/components/properties";

export const metadata: Metadata = { title: "Lead forms" };

export default async function FormsPage({ searchParams }: PageProps<"/settings/forms">) {
  const ctx = await getContext();
  const { edit } = await searchParams;
  const since = new Date(new Date().getTime() - 30 * 86_400_000).toISOString();
  const [{ data: forms }, { data: subs }, ref] = await Promise.all([
    ctx.supabase.from("lead_forms").select("*").eq("organization_id", ctx.org.id).order("created_at"),
    ctx.can.assignLeads ? ctx.supabase.from("lead_form_submissions").select("form_id, outcome").eq("organization_id", ctx.org.id).gte("created_at", since) : Promise.resolve({ data: [] }),
    loadLeadContext(ctx),
  ]);
  const list = (forms ?? []) as (LeadFormValues & { public_key: string })[];
  const editing = list.find((f) => f.id === edit);
  const counts = new Map<string, Record<string, number>>();
  for (const s of subs ?? []) {
    const c = counts.get(s.form_id) ?? {};
    c[s.outcome] = (c[s.outcome] ?? 0) + 1;
    counts.set(s.form_id, c);
  }
  const base = appUrl();
  return (
    <div className="flex flex-col gap-6">
      {!unsubscribeSecret() && <Alert tone="warn" title="Forms are switched off">Set UNSUBSCRIBE_SECRET on the server. It signs public links and protects forms from abuse.</Alert>}
      <p className="text-sm text-muted">
        Capture leads from ads, your website, QR codes and social posts. Each submission creates or updates a lead, assigns it, and records consent with the exact wording the person saw.
      </p>
      {list.length === 0 && !ctx.can.assignLeads && <EmptyState title="No forms yet" />}
      {list.map((f) => {
        const url = `${base}/f/${f.public_key}`;
        const c = counts.get(f.id) ?? {};
        const snippet = `<form action="${base}/api/forms/${f.public_key}" method="post">\n  <input name="full_name" placeholder="Name" required>\n  <input name="email" type="email" placeholder="Email">\n  <input name="phone" type="tel" placeholder="Phone">\n  <input name="website" style="display:none" tabindex="-1" autocomplete="off">\n  <button>Send</button>\n</form>`;
        return (
          <Card key={f.id} title={<span className="flex items-center gap-2">{f.name}{!f.is_active && <Badge>Paused</Badge>}</span>}
            actions={ctx.can.assignLeads ? <Link className="text-sm text-brand" href={`/settings/forms?edit=${f.id}`}>Edit</Link> : undefined}>
            <div className="flex flex-col gap-2 text-sm">
              <div>Hosted form: <a className="break-all text-brand underline" href={url} target="_blank" rel="noopener noreferrer">{url}</a></div>
              <div className="text-muted">Last 30 days: {c.created ?? 0} new, {c.updated ?? 0} updated, {c.suppressed ?? 0} suppressed, {(c.spam ?? 0) + (c.rate_limited ?? 0)} blocked</div>
              <details><summary className="cursor-pointer text-muted">Embed on your website</summary>
                <p className="mt-2 text-xs text-muted">Minimal HTML. Add consent checkboxes named consent_email / consent_sms / consent_call; consent is only recorded if this form offers that channel. JSON posts are also accepted.</p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs">{snippet}</pre>
              </details>
            </div>
          </Card>
        );
      })}
      {ctx.can.assignLeads && (
        <Card title={editing ? `Edit “${editing.name}”` : "New form"} actions={editing ? <Link className="text-sm text-muted" href="/settings/forms">Cancel</Link> : undefined}>
          <LeadFormEditor key={editing?.id ?? "new"} form={editing} orgName={ctx.org.name}
            sources={ref.sources.filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.name }))}
            members={ref.members.map((m) => ({ id: m.user_id, label: memberName(m) }))} />
        </Card>
      )}
    </div>
  );
}
