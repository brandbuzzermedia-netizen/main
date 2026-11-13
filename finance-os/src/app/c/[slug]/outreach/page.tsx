import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext, ROLE_LABELS } from "@/lib/workspace";
import { loadMembers } from "@/lib/people";
import { formatDateTime } from "@/domain/dates";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { handoverAction, logOutcomeAction } from "./actions";

export const metadata: Metadata = { title: "Outreach" };
const sel = "rounded border border-line bg-surface px-1.5 py-1 text-xs";

export default async function OutreachPage({ params }: PageProps<"/c/[slug]/outreach">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  const [queue, events, deals, members] = await Promise.all([
    ctx.supabase.from("contacts").select("id, full_name, company_name, phone_e164, email, lead_status, consent_basis").eq("organization_id", ctx.company.id)
      .eq("do_not_contact", false).in("lead_status", ["new", "contacted"]).order("created_at").limit(50),
    ctx.supabase.from("outreach_events").select("id, kind, outcome, occurred_at, contact:contacts(full_name)").eq("organization_id", ctx.company.id).order("occurred_at", { ascending: false }).limit(20),
    ctx.supabase.from("deals").select("id, title, owner_id, setter_id").eq("organization_id", ctx.company.id).is("closed_at", null).is("handed_over_at", null).limit(200),
    loadMembers(ctx.supabase, ctx.company.id),
  ]);
  const q = queue.data ?? [];
  const closers = members.filter((m) => ["owner", "sales_manager", "sales_rep", "company_admin"].includes(m.role) && m.user_id !== ctx.userId);
  return (
    <>
      <PageHeader title="Outreach" description="Today's call queue, outcomes and handovers. Messages go out only through approved providers, with consent recorded, and bulk sends need approval." />
      <p className="mb-5 text-sm text-muted">Set up: <Link className="underline" href={`/c/${slug}/r/sequences`}>sequences</Link> · <Link className="underline" href={`/c/${slug}/r/suppression`}>suppression list</Link> · <Link className="underline" href={`/c/${slug}/r/contacts`}>leads</Link> · <Link className="underline" href={`/c/${slug}/assistant`}>draft a follow-up</Link></p>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title={`Call queue · ${q.length}`}>
          {q.length === 0 ? <EmptyState title="Queue is empty">New and contacted leads you can see appear here. Do-not-contact leads never do.</EmptyState> : (
            <ul>{q.map((c) => (
              <li key={c.id as string} className="border-t border-line-2 py-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{c.full_name as string}{c.company_name ? ` · ${c.company_name}` : ""}</span>
                  <span className="text-xs text-muted">{(c.phone_e164 as string) ?? (c.email as string) ?? "No contact detail"} · <Badge>{c.lead_status as string}</Badge>{c.consent_basis === "none" && <Badge tone="warn">no lawful basis</Badge>}</span></div>
                <form action={logOutcomeAction.bind(null, slug)} className="mt-2 flex flex-wrap gap-1.5">
                  <input type="hidden" name="contact_id" value={c.id as string} />
                  <select name="kind" aria-label="Activity" className={sel}><option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="unsubscribe">Asked not to be contacted</option></select>
                  <select name="outcome" aria-label="Outcome" className={sel}>{["connected", "no_answer", "voicemail", "positive", "objection", "not_now", "referral", "wrong_contact"].map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}</select>
                  <input name="notes" placeholder="Notes" aria-label="Notes" className={`${sel} min-w-0 flex-1`} />
                  <button className="rounded border border-line px-2 text-xs">Log</button>
                </form>
              </li>))}</ul>
          )}
        </Card>
        <div className="flex flex-col gap-5">
          <Card title="Hand a deal to a closer">
            {deals.data && deals.data.length > 0 && closers.length > 0 ? (
              <form action={handoverAction.bind(null, slug)} className="flex flex-col gap-2">
                <select name="deal_id" aria-label="Deal" className="rounded-lg border border-line bg-surface px-2 py-2 text-sm">{deals.data.map((d) => <option key={d.id as string} value={d.id as string}>{d.title as string}</option>)}</select>
                <select name="closer_id" aria-label="Closer" className="rounded-lg border border-line bg-surface px-2 py-2 text-sm">{closers.map((m) => <option key={m.user_id} value={m.user_id}>{m.name} · {ROLE_LABELS[m.role]}</option>)}</select>
                <input name="note" placeholder="Context for the closer" aria-label="Note" className="rounded-lg border border-line px-2 py-2 text-sm" />
                <button className="rounded-lg border border-line px-3 py-2 text-sm">Hand over</button>
              </form>
            ) : <p className="text-sm text-muted">No open deals to hand over, or no closers in the team.</p>}
          </Card>
          <Card title="Recent activity">
            <ul>{(events.data ?? []).map((e) => (
              <li key={e.id as string} className="border-t border-line-2 py-2 text-xs">{(e.contact as unknown as { full_name: string })?.full_name} · {e.kind as string}{e.outcome ? ` · ${String(e.outcome).replace("_", " ")}` : ""} · {formatDateTime(e.occurred_at as string)}</li>
            ))}</ul>
          </Card>
        </div>
      </div>
    </>
  );
}
