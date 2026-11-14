import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { loadMembers } from "@/lib/people";
import { assessmentYearLabel, financialYear } from "@/domain/periods";
import { formatDate, todayInBusinessTz } from "@/domain/dates";
import { Badge, Button, ButtonLink, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { addGstPeriodsAction, addPeriodAction, grantAccountantAction, recordFilingAction, setStatusAction } from "./actions";

export const metadata: Metadata = { title: "Tax & GST" };
const input = "rounded-lg border border-line bg-surface px-2 py-2 text-sm";

export default async function TaxPage({ params }: PageProps<"/c/[slug]/finance/tax">) {
  const { slug } = await params;
  const ctx = await getCompanyContext(slug);
  const isAccountant = ctx.role === "accountant";
  if (!ctx.can("finance.read") && !isAccountant) notFound();
  const today = todayInBusinessTz();
  const fy = financialYear(today, ctx.company.fy_start_month);
  const [periods, entities, grants, members, pendingBills] = await Promise.all([
    ctx.supabase.from("tax_periods").select("*").eq("organization_id", ctx.company.id).order("due_on", { ascending: true, nullsFirst: false }),
    ctx.supabase.from("legal_entities").select("id, name").eq("organization_id", ctx.company.id),
    ctx.supabase.from("accountant_grants").select("id, period_start, period_end, user:users(full_name, email), entity:legal_entities(name)").eq("organization_id", ctx.company.id),
    ctx.can("finance.approve") ? loadMembers(ctx.supabase, ctx.company.id) : Promise.resolve([]),
    ctx.supabase.from("ocr_extractions").select("id", { count: "exact", head: true }).eq("organization_id", ctx.company.id).in("status", ["extracted", "failed"]),
  ]);
  const ps = (periods.data ?? []) as { id: string; label: string; kind: string; period_start: string; period_end: string; due_on: string | null; status: string; ack_reference: string | null; filed_on: string | null }[];
  const ents = (entities.data ?? []) as { id: string; name: string }[];
  const canWrite = ctx.can("finance.write");
  const ex = (reg: string) => `/c/${slug}/finance/tax/export?register=${reg}&fy=${fy.startYear}`;
  return (
    <>
      <PageHeader title="Tax & GST" description={`${fy.label} (income tax ${assessmentYearLabel(fy.startYear)}). Preparation support for your accountant: nothing here files a return or decides tax treatment.`} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ButtonLink variant="secondary" href={ex("income")} prefetch={false}>Income & sales register (CSV)</ButtonLink>
        <ButtonLink variant="secondary" href={ex("expense")} prefetch={false}>Purchase & expense register (CSV)</ButtonLink>
        <ButtonLink variant="secondary" href={ex("gst")} prefetch={false}>GST summary by month (CSV)</ButtonLink>
        <ButtonLink variant="secondary" href={ex("financing")} prefetch={false}>Loans, deposits & transfers (CSV)</ButtonLink>
      </div>
      {(pendingBills.count ?? 0) > 0 && <p className="mb-4 text-sm text-warn">{pendingBills.count} bill(s) are still waiting for review and are not in these registers yet.</p>}
      <h2 className="mb-3 font-display text-2xl">Filing calendar</h2>
      {ps.length === 0 ? <EmptyState title="No tax periods yet">Add the GST months for this FY, or an ITR or TDS period, below.</EmptyState> : (
        <Table head={["Period", "Covers", "Due", "Status", "Acknowledgement", ""]}>
          {ps.map((p) => (
            <tr key={p.id}>
              <Td className="font-medium">{p.label}</Td>
              <Td className="whitespace-nowrap text-xs">{formatDate(p.period_start)} – {formatDate(p.period_end)}</Td>
              <Td className={p.due_on && p.due_on < today && p.status !== "filed" ? "text-danger" : ""}>{formatDate(p.due_on)}</Td>
              <Td><Badge tone={p.status === "filed" ? "ok" : p.due_on && p.due_on < today ? "danger" : "neutral"}>{p.status.replace(/_/g, " ")}</Badge></Td>
              <Td>{p.ack_reference ? <span className="text-xs">{p.ack_reference} · {formatDate(p.filed_on)}</span> : <span className="text-xs text-faint">Not filed</span>}</Td>
              <Td>
                {p.status !== "filed" && (
                  <div className="flex flex-col gap-1.5">
                    {(canWrite || isAccountant) && (
                      <form action={setStatusAction.bind(null, slug)} className="flex gap-1">
                        <input type="hidden" name="id" value={p.id} />
                        <select name="status" defaultValue={p.status} aria-label="Status" className="rounded border border-line text-xs">{["not_started", "preparing", "in_review", "ready_to_file"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>
                        <button className="rounded border border-line px-1.5 text-xs">Save</button>
                      </form>
                    )}
                    {ctx.can("finance.approve") && (
                      <details><summary className="cursor-pointer text-xs underline">Record filing</summary>
                        <form action={recordFilingAction.bind(null, slug)} className="mt-1 flex flex-col gap-1">
                          <input type="hidden" name="id" value={p.id} />
                          <input name="ack" required minLength={5} placeholder="ARN / acknowledgement no." aria-label="Acknowledgement" className="rounded border border-line px-1 text-xs" />
                          <input type="date" name="filed_on" defaultValue={today} aria-label="Filed on" className="rounded border border-line px-1 text-xs" />
                          <button className="rounded border border-line text-xs">Mark filed</button>
                        </form>
                      </details>
                    )}
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {canWrite && ents.length > 0 && (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Card title="Add periods">
            <form action={addGstPeriodsAction.bind(null, slug)} className="mb-4 flex flex-wrap items-end gap-2">
              <select name="legal_entity_id" aria-label="Legal entity" className={input}>{ents.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
              <Button variant="secondary">Add 12 GST months for {fy.label}</Button>
            </form>
            <p className="mb-3 text-xs text-muted">Uses the usual 20th-of-next-month GSTR-3B date. Confirm due dates (and monthly vs quarterly filing) with your accountant.</p>
            <form action={addPeriodAction.bind(null, slug)} className="grid gap-2 sm:grid-cols-2">
              <select name="legal_entity_id" aria-label="Legal entity" className={input}>{ents.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
              <select name="kind" aria-label="Kind" className={input}>{["itr", "gst_quarterly", "gst_annual", "tds_quarterly", "advance_tax", "other"].map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}</select>
              <input name="label" required placeholder={`e.g. ITR ${assessmentYearLabel(fy.startYear)}`} aria-label="Label" className={input} />
              <input type="date" name="due_on" aria-label="Due on" className={input} />
              <input type="date" name="period_start" required defaultValue={fy.start} aria-label="Period start" className={input} />
              <input type="date" name="period_end" required aria-label="Period end" className={input} />
              <div><Button variant="secondary">Add period</Button></div>
            </form>
          </Card>
          {ctx.can("finance.approve") && (
            <Card title="Accountant access">
              <ul className="mb-3 text-sm">
                {((grants.data ?? []) as unknown as { id: string; period_start: string; period_end: string; user: { full_name: string | null; email: string }; entity: { name: string } }[]).map((g) => (
                  <li key={g.id} className="border-t border-line-2 py-2">{g.user.full_name || g.user.email} · {g.entity.name} · {formatDate(g.period_start)} – {formatDate(g.period_end)}</li>
                ))}
              </ul>
              {members.filter((m) => m.role === "accountant").length === 0 ? (
                <p className="text-sm text-muted">Add your accountant on the Team page with the External accountant role, then grant entities and periods here.</p>
              ) : (
                <form action={grantAccountantAction.bind(null, slug)} className="grid gap-2 sm:grid-cols-2">
                  <select name="user_id" aria-label="Accountant" className={input}>{members.filter((m) => m.role === "accountant").map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select>
                  <select name="legal_entity_id" aria-label="Legal entity" className={input}>{ents.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
                  <input type="date" name="period_start" defaultValue={fy.start} aria-label="From" className={input} />
                  <input type="date" name="period_end" aria-label="To" required className={input} />
                  <div><Button variant="secondary">Grant access</Button></div>
                </form>
              )}
            </Card>
          )}
        </div>
      )}
    </>
  );
}
