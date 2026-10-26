import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { filtersToQuery, LEAD_ROW_COLUMNS, leadQuery, loadLeadContext, memberName, PAGE_SIZE, parseFilters, SORTS, type LeadRow } from "@/lib/leads";
import { Alert, Badge, ButtonLink, EmptyState, Input, PageHeader, Select, Td } from "@/components/ui";
import { SEGMENTS, categoryTone, segmentLabel } from "@/domain/labels";
import { formatBudget } from "@/domain/money";
import { formatDateTime } from "@/domain/dates";
import { BulkAssign } from "./bulk-assign";
import { SavedViews } from "./saved-views";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const ref = await loadLeadContext(ctx);
  const from = (f.page - 1) * PAGE_SIZE;
  const [{ data, count, error }, { data: views }] = await Promise.all([
    leadQuery(ctx, f, LEAD_ROW_COLUMNS, { count: true }).range(from, from + PAGE_SIZE - 1),
    ctx.supabase.from("saved_views").select("id, name, query, is_shared, user_id").eq("organization_id", ctx.org.id).order("name"),
  ]);
  if (error) throw new Error(error.message);
  const leads = (data ?? []) as unknown as LeadRow[];
  const total = count ?? 0;
  const stageById = new Map(ref.stages.map((s) => [s.id, s]));
  const sourceById = new Map(ref.sources.map((s) => [s.id, s]));
  const memberById = new Map(ref.members.map((m) => [m.user_id, m]));
  const query = filtersToQuery({ ...f, page: 1 });
  const filtered = query !== "";
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => `/leads?${filtersToQuery({ ...f, page: p })}`;

  return (
    <>
      <PageHeader
        title="Leads"
        description={ctx.role === "sales_rep" ? "Leads assigned to you." : "Every prospect in your workspace, with their source, stage and owner."}
        actions={
          <>
            {ctx.can.exportLeads && <ButtonLink variant="secondary" href={`/leads/export${query ? `?${query}` : ""}`} prefetch={false}>Export CSV</ButtonLink>}
            {ctx.can.importLeads && <ButtonLink variant="secondary" href="/leads/import">Import CSV</ButtonLink>}
            {ctx.can.createLeads && <ButtonLink href="/leads/new">New lead</ButtonLink>}
          </>
        }
      />
      {sp.erased === "1" && <div className="mb-4"><Alert tone="ok">The lead was erased. Its history and audit details were removed.</Alert></div>}

      <form method="get" className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8" role="search" aria-label="Filter leads">
        <div className="col-span-2">
          <label htmlFor="q" className="sr-only">Search</label>
          <Input name="q" defaultValue={f.q} placeholder="Search name, email, phone, location" />
        </div>
        <FilterSelect name="stage" label="Stage" value={f.stage} options={ref.stages.map((s) => [s.id, s.name])} />
        <FilterSelect name="source" label="Source" value={f.source} options={ref.sources.map((s) => [s.id, s.name])} />
        {ctx.role !== "sales_rep" && (
          <FilterSelect name="owner" label="Owner" value={f.owner}
            options={[["me", "Assigned to me"], ["none", "Unassigned"], ...ref.members.map((m) => [m.user_id, memberName(m)] as [string, string])]} />
        )}
        <FilterSelect name="segment" label="Segment" value={f.segment} options={SEGMENTS.map((s) => [s, segmentLabel[s]])} />
        <div>
          <label htmlFor="tag" className="sr-only">Tag</label>
          <Input name="tag" defaultValue={f.tag} placeholder="Tag" />
        </div>
        <div className="flex gap-2">
          <label htmlFor="sort" className="sr-only">Sort</label>
          <Select name="sort" defaultValue={f.sort}>
            {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </Select>
          {f.country && <input type="hidden" name="country" value={f.country} />}
          <button className="rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2">Apply</button>
        </div>
      </form>

      <SavedViews
        views={(views ?? []).map((v) => ({ ...v, mine: v.user_id === ctx.userId }))}
        currentQuery={query}
        canShare={ctx.can.assignLeads}
      />

      <div className="mb-2 flex items-center justify-between text-sm text-muted">
        <span className="tabular">{total.toLocaleString()} lead{total === 1 ? "" : "s"}{filtered ? " match these filters" : ""}</span>
        {filtered && <Link href="/leads" className="text-brand underline-offset-2 hover:underline">Clear filters</Link>}
      </div>

      {leads.length === 0 ? (
        filtered ? (
          <EmptyState title="No leads match these filters">Try removing a filter or searching for part of a name.</EmptyState>
        ) : (
          <EmptyState
            title={ctx.role === "sales_rep" ? "No leads are assigned to you yet" : "No leads yet"}
            action={ctx.can.importLeads ? <div className="flex gap-2"><ButtonLink href="/leads/import">Import a CSV</ButtonLink><ButtonLink variant="secondary" href="/leads/new">Add one lead</ButtonLink></div> : undefined}
          >
            {ctx.role === "sales_rep" ? "A manager assigns leads to you, or you can add your own." : "Import prospects you are authorised to contact, or add them one at a time. Every lead keeps its source and consent history."}
          </EmptyState>
        )
      ) : (
        <BulkAssign enabled={ctx.can.assignLeads} members={ref.members.map((m) => ({ id: m.user_id, label: memberName(m) }))}>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  {ctx.can.assignLeads && <th className="w-8 px-4 py-2.5"><span className="sr-only">Select</span></th>}
                  {["Name", "Stage", "Segment", "Budget", "Location", "Source", "Owner", "Follow-up"].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {leads.map((l) => {
                  const stage = stageById.get(l.stage_id);
                  const overdue = l.next_follow_up_at && new Date(l.next_follow_up_at) < new Date();
                  return (
                    <tr key={l.id} className="hover:bg-surface-2/60">
                      {ctx.can.assignLeads && (
                        <Td><input type="checkbox" name="lead_id" value={l.id} aria-label={`Select ${l.full_name}`} className="size-4" /></Td>
                      )}
                      <Td>
                        <Link href={`/leads/${l.id}`} className="font-medium text-ink hover:text-brand">{l.full_name}</Link>
                        <div className="text-xs text-muted">{l.email ?? l.phone_e164}{l.country && ` · ${l.country}`}</div>
                        {l.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{l.tags.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}</div>}
                      </Td>
                      <Td>{stage && <Badge tone={categoryTone[stage.category]}>{stage.name}</Badge>}</Td>
                      <Td>{segmentLabel[l.segment]}</Td>
                      <Td className="tabular whitespace-nowrap">{formatBudget(l.budget_min_minor, l.budget_max_minor, l.currency)}</Td>
                      <Td>{l.preferred_location ?? "—"}</Td>
                      <Td>{l.source_id ? sourceById.get(l.source_id)?.name : "—"}</Td>
                      <Td>{l.owner_id ? memberName(memberById.get(l.owner_id)) : <span className="text-muted">Unassigned</span>}</Td>
                      <Td className={overdue ? "text-danger" : undefined}>{l.next_follow_up_at ? formatDateTime(l.next_follow_up_at, ctx.org.timezone) : "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </BulkAssign>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
          {f.page > 1 ? <Link className="text-brand" href={pageHref(f.page - 1)}>← Previous</Link> : <span />}
          <span className="tabular text-muted">Page {f.page} of {pages}</span>
          {f.page < pages ? <Link className="text-brand" href={pageHref(f.page + 1)}>Next →</Link> : <span />}
        </nav>
      )}
    </>
  );
}

function FilterSelect({ name, label, value, options }: { name: string; label: string; value: string; options: [string, string][] }) {
  return (
    <div>
      <label htmlFor={name} className="sr-only">{label}</label>
      <Select name={name} defaultValue={value}>
        <option value="">{`Any ${label.toLowerCase()}`}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
    </div>
  );
}
