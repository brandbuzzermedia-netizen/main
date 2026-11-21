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

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ params, searchParams }: PageProps<"/c/[slug]/customers">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.read_all") && !ctx.can("crm.read_assigned")) notFound();
  const d = designFor(slug);
  const base = `/c/${slug}/customers`;
  const [{ data }, members] = await Promise.all([
    ctx.supabase.from("contacts").select("id, full_name, company_name, lead_status, owner_id, country, do_not_contact").eq("organization_id", ctx.company.id).in("lead_status", ["qualified", "customer"]).order("full_name").limit(300),
    loadMembers(ctx.supabase, ctx.company.id),
  ]);
  const names = new Map(members.map((m) => [m.user_id, m.name]));
  const [title, lines] = NOTES.customers;
  return (
    <>
      <PageHead own={d.own} treat={d.treat} title={d.ren.customers ?? "Customers"} right={ctx.can("crm.write") ? <Cta href={`${base}?add=1`}>+ Add</Cta> : undefined} />
      <ListView vm={{
        head: ["NAME", "TYPE", "STATUS", "OWNER"],
        rows: ((data ?? []) as { full_name: string; company_name: string | null; lead_status: string; owner_id: string | null; country: string | null; do_not_contact: boolean }[]).map((c) => ({
          a: <>{c.full_name}{c.company_name && <span style={{ fontWeight: 400, color: "#6d7a70" }}> · {c.company_name}</span>}</>,
          b: c.lead_status === "customer" ? "Client" : "Contact", c: c.do_not_contact ? "Opted out" : c.lead_status === "customer" ? "Active" : "Prospect",
          d: c.owner_id ? names.get(c.owner_id) ?? "—" : "Unassigned",
        })),
        empty: "No customers yet. Qualified leads and clients appear here.", noteTitle: title, noteLines: lines,
      }} />
      {sp.add && ctx.can("crm.write") && <Modal title="New contact" closeHref={base}><RecordForm slug={slug} resource="contacts" fields={RESOURCES.contacts.fields.map((f) => f.name === "lead_status" ? { ...f, default: "customer" } : f)} refOptions={{}} /></Modal>}
    </>
  );
}
