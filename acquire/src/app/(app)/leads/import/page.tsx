import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { loadLeadContext, memberName } from "@/lib/leads";
import { formatDateTime } from "@/domain/dates";
import { Card, PageHeader, Table, Td } from "@/components/ui";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import leads" };

export default async function ImportPage() {
  const ctx = await getContext();
  if (!ctx.can.importLeads) notFound();
  const [ref, { data: history }] = await Promise.all([
    loadLeadContext(ctx),
    ctx.supabase.from("lead_imports").select("id, file_name, created_at, total_rows, created_count, updated_count, skipped_count, suppressed_count")
      .eq("organization_id", ctx.org.id).order("created_at", { ascending: false }).limit(10),
  ]);
  return (
    <>
      <div className="mb-2 text-sm"><Link href="/leads" className="text-muted hover:text-ink">← Leads</Link></div>
      <PageHeader
        title="Import leads"
        description="Upload a CSV of prospects you are authorised to contact: your own enquiries, open-house sign-ups, or exports from a licensed data provider or CRM. Nothing is saved until you confirm."
      />
      <ImportWizard
        sources={ref.sources.filter((s) => s.is_active).map((s) => ({ id: s.id, label: s.name, isDefault: s.kind === "csv_import" }))}
        members={ref.members.map((m) => ({ id: m.user_id, label: memberName(m) }))}
        market={ctx.org.primary_market}
      />
      {history && history.length > 0 && (
        <div className="mt-8">
          <Card title="Recent imports">
            <div className="-m-4">
              <Table head={["When", "File", "Rows", "Created", "Updated", "Skipped", "Suppressed"]}>
                {history.map((h) => (
                  <tr key={h.id}>
                    <Td>{formatDateTime(h.created_at, ctx.org.timezone)}</Td>
                    <Td>{h.file_name ?? "—"}</Td>
                    <Td numeric>{h.total_rows}</Td>
                    <Td numeric>{h.created_count}</Td>
                    <Td numeric>{h.updated_count}</Td>
                    <Td numeric>{h.skipped_count}</Td>
                    <Td numeric>{h.suppressed_count}</Td>
                  </tr>
                ))}
              </Table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
