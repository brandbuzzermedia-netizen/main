import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { todayInBusinessTz } from "@/domain/dates";
import { designFor } from "@/domain/design";
import { PageHead } from "@/components/dp/shell";
import { big } from "@/components/field/field-client";
import { loadMembers } from "@/lib/people";
import { saveFieldSettingsAction } from "../actions";
import { Box, FieldTabs } from "../tabs";

export const metadata: Metadata = { title: "Delivery handoffs" };
const LABEL: Record<string, string> = { awaiting_details: "Awaiting details", ready: "Ready to build", in_progress: "In progress", done: "Done" };

/** Paid clients handed to the delivery team: due date, status and brand details. */
export default async function Handoffs({ params, searchParams }: PageProps<"/c/[slug]/field/handoffs">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write") && !ctx.can("tasks.write")) notFound();
  const today = todayInBusinessTz();
  const [{ data }, { data: settings }, members] = await Promise.all([
    ctx.supabase.from("delivery_handoffs").select("id, status, due_on, contact:contacts(company_name, full_name)").eq("organization_id", ctx.company.id).order("status").order("due_on").limit(200),
    ctx.supabase.from("field_sales_settings").select("delivery_assignee_id, handoff_days").eq("organization_id", ctx.company.id).maybeSingle(),
    ctx.can("company.settings") ? loadMembers(ctx.supabase, ctx.company.id) : Promise.resolve([]),
  ]);
  const rows = (data ?? []) as unknown as { id: string; status: string; due_on: string; contact: { company_name: string | null; full_name: string } | null }[];
  return (
    <>
      <PageHead own={designFor(slug).own} treat="Field sales" title="Handoffs" tag="To delivery." />
      <FieldTabs slug={slug} current="/handoffs" note={sp.note} />
      <Box title="Paid clients for the delivery team">
        {rows.length === 0 ? <div style={{ fontSize: 14, color: "#6B6B6B" }}>When a lead becomes Advance paid, a delivery task and a handoff appear here.</div> : rows.map((h) => (
          <a key={h.id} href={`/c/${slug}/field/handoffs/${h.id}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "12px 0", borderTop: "1px solid #EFEBE1", color: "#141414", textDecoration: "none", minHeight: 44 }}>
            <span><b>{h.contact?.company_name || h.contact?.full_name}</b><br /><span style={{ fontSize: 13, color: "#6B6B6B" }}>{LABEL[h.status]}</span></span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: h.status !== "done" && h.due_on < today ? "#B42318" : "#141414" }}>Due {h.due_on.split("-").reverse().join("/")}</span>
          </a>
        ))}
      </Box>
      {ctx.can("company.settings") && (
        <Box title="Delivery settings">
          <form action={saveFieldSettingsAction.bind(null, slug)} style={{ display: "grid", gap: 10 }}>
            <label style={{ fontSize: 13, color: "#6B6B6B", display: "grid", gap: 4 }}>Delivery tasks go to
              <select name="delivery_assignee_id" defaultValue={settings?.delivery_assignee_id ?? ""} style={{ minHeight: 46, border: "1px solid #E4E0D6", borderRadius: 10, padding: "0 10px", fontSize: 15 }}>
                <option value="">Nobody yet (unassigned task)</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13, color: "#6B6B6B", display: "grid", gap: 4 }}>Days to deliver<input name="handoff_days" type="number" min={1} max={60} defaultValue={settings?.handoff_days ?? 7} style={{ minHeight: 46, border: "1px solid #E4E0D6", borderRadius: 10, padding: "0 10px", fontSize: 15 }} /></label>
            <button style={{ ...big, width: "100%" }}>Save</button>
          </form>
        </Box>
      )}
    </>
  );
}
