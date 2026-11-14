import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { loadMembers } from "@/lib/people";
import { RESOURCES } from "@/lib/resources";
import { designFor } from "@/domain/design";
import { Cta, PageHead } from "@/components/dp/shell";
import { Modal } from "@/components/dp/modal";
import { RecordForm } from "@/components/record-form";
import { ListView, NOTES } from "@/views/list";

export const metadata: Metadata = { title: "Leads" };
const CHIPS: [string, string][] = [["Forms", "form"], ["Ads", "ad"], ["Shopify / store", "shop"], ["Approved imports", "import"], ["Referrals", "referr"], ["Partner sources", "partner"], ["Manual", "manual"]];

export default async function LeadsPage({ params, searchParams }: PageProps<"/c/[slug]/leads">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.read_all") && !ctx.can("crm.read_assigned")) notFound();
  const d = designFor(slug);
  const base = `/c/${slug}/leads`;
  const src = CHIPS.find(([l]) => l === sp.source);
  let q = ctx.supabase.from("contacts").select("id, full_name, company_name, source, score, owner_id, lead_status, do_not_contact").eq("organization_id", ctx.company.id).order("created_at", { ascending: false }).limit(200);
  if (src) q = q.ilike("source", `%${src[1]}%`);
  const [{ data }, members] = await Promise.all([q, loadMembers(ctx.supabase, ctx.company.id)]);
  const names = new Map(members.map((m) => [m.user_id, m.name]));
  const [title, lines] = NOTES.leads;
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title={d.ren.leads ?? "Leads"} right={ctx.can("crm.write") ? <Cta href={`${base}?add=1`}>+ Add</Cta> : undefined} />
      <ListView vm={{
        chips: CHIPS.map(([l]) => ({ l, href: src?.[0] === l ? base : `${base}?source=${encodeURIComponent(l)}`, on: src?.[0] === l })),
        head: ["LEAD", "SOURCE", "SCORE", "OWNER"],
        rows: ((data ?? []) as { id: string; full_name: string; company_name: string | null; source: string | null; score: number | null; owner_id: string | null; do_not_contact: boolean }[]).map((c) => ({
          a: <>{c.full_name}{c.company_name && <span style={{ fontWeight: 400, color: "#6d7a70" }}> · {c.company_name}</span>}{c.do_not_contact && <span style={{ fontWeight: 400, color: "#8C2F39" }}> · do not contact</span>}</>,
          b: c.source ?? "—", c: c.score ?? "—", d: c.owner_id ? names.get(c.owner_id) ?? "—" : "Unassigned",
        })),
        empty: src ? `No leads from ${src[0].toLowerCase()} yet.` : "No leads yet. Add one, or import a list from the full records view.",
        noteTitle: title, noteLines: lines,
        more: <a href={`/c/${slug}/r/contacts`} style={{ fontSize: 13.5, color: "var(--co-side)", fontWeight: 600 }}>Search, sort, import and export all leads →</a>,
      }} />
      {sp.add && ctx.can("crm.write") && <Modal title="New lead" closeHref={base}><RecordForm slug={slug} resource="contacts" fields={RESOURCES.contacts.fields} refOptions={{}} /></Modal>}
    </>
  );
}
