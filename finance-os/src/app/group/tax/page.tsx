import type { Metadata } from "next";
import { getGroupContext } from "@/lib/workspace";
import { companiesWith, nameMap } from "@/lib/group-data";
import { formatDate, todayInBusinessTz } from "@/domain/dates";
import { Badge, EmptyState, PageHeader, Table, Td } from "@/components/ui";

export const metadata: Metadata = { title: "Tax & filings" };

export default async function GroupTax() {
  const g = await getGroupContext();
  const cs = companiesWith(g, "finance.read");
  const names = nameMap(cs);
  const today = todayInBusinessTz();
  const { data } = cs.length ? await g.supabase.from("tax_periods").select("id, organization_id, label, due_on, status, ack_reference").in("organization_id", cs.map((c) => c.id)).order("due_on") : { data: [] };
  const rows = (data ?? []) as { id: string; organization_id: string; label: string; due_on: string | null; status: string; ack_reference: string | null }[];
  return (
    <>
      <PageHeader title="Tax & filings" description="Filing status across the companies whose finance you can see. A return shows as filed only with a recorded acknowledgement." />
      {rows.length === 0 ? <EmptyState title="No tax periods yet" /> : (
        <Table head={["Company", "Period", "Due", "Status", "Acknowledgement"]}>
          {rows.map((p) => (
            <tr key={p.id}><Td>{names.get(p.organization_id)}</Td><Td>{p.label}</Td><Td className={p.due_on && p.due_on < today && p.status !== "filed" ? "text-danger" : ""}>{formatDate(p.due_on)}</Td>
              <Td><Badge tone={p.status === "filed" ? "ok" : p.due_on && p.due_on < today ? "danger" : "neutral"}>{p.status.replace(/_/g, " ")}</Badge></Td><Td className="text-xs">{p.ack_reference ?? "—"}</Td></tr>
          ))}
        </Table>
      )}
    </>
  );
}
