import { requireSuperAdmin } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { AUDIT_LABELS } from "@/lib/audit";
import { Card, PageHeader, Table, Td, Th, formatDate } from "@/components/ui";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ client?: string; action?: string }> }) {
  const user = await requireSuperAdmin();
  const sp = await searchParams;
  const { rows, clients } = await withUser(user.id, async (db) => ({
    clients: await db.query<{ id: string; name: string }>("select id, name from clients order by name"),
    rows: await db.query<{ id: string; actor_name: string; action: string; client: string | null; campaign: string | null; entity_type: string; details: Record<string, unknown>; created_at: Date; ip: string | null }>(
      `select a.id, a.actor_name, a.action, c.name as client, ca.name as campaign, a.entity_type, a.details, a.created_at, a.ip
       from audit_logs a left join clients c on c.id = a.client_id left join campaigns ca on ca.id = a.campaign_id
       where ($1 = '' or a.client_id::text = $1) and ($2 = '' or a.action = $2)
       order by a.created_at desc limit 300`,
      [sp.client ?? "", sp.action ?? ""],
    ),
  }));
  const sel = "h-9 rounded-full border-2 border-brand/30 bg-surface-2 px-3 text-sm";
  return (
    <>
      <PageHeader title="Audit log" description="Append-only. Who created clients, connected accounts, generated, edited, approved, rejected and published comments, and changed campaigns." />
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
          <select name="client" defaultValue={sp.client ?? ""} aria-label="Client" className={sel}>
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="action" defaultValue={sp.action ?? ""} aria-label="Action" className={sel}>
            <option value="">All actions</option>
            {Object.entries(AUDIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="gbs-press h-9 rounded-full border-2 border-brand bg-surface px-4 text-sm font-semibold text-brand shadow-hard-sm">Filter</button>
        </form>
        <Table>
          <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Client</Th><Th>Campaign</Th><Th>Details</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <Td className="whitespace-nowrap text-xs">{formatDate(r.created_at, true)}</Td>
                <Td className="font-medium text-ink">{r.actor_name}</Td>
                <Td>{AUDIT_LABELS[r.action] ?? r.action}</Td>
                <Td>{r.client ?? "—"}</Td>
                <Td className="text-xs">{r.campaign ?? "—"}</Td>
                <Td className="max-w-[320px] truncate font-mono text-[11px] text-ink-3" >{Object.keys(r.details ?? {}).length ? JSON.stringify(r.details) : ""}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
