import Link from "next/link";
import type { Resource } from "@/lib/resources";
import { formatMoney } from "@/domain/money";
import { formatDate, formatDateTime } from "@/domain/dates";
import { Badge, EmptyState, Table, Td } from "@/components/ui";

export function cell(r: Resource, key: string, row: Record<string, unknown>, labels: Record<string, Map<string, string>>) {
  const col = r.columns.find((c) => c.key === key)!;
  const v = row[key];
  if (v === null || v === undefined || v === "") return <span className="text-faint">—</span>;
  if (col.ref) return labels[col.ref.table]?.get(String(v)) ?? "—";
  switch (col.format) {
    case "money": return formatMoney(Number(v), String(row.currency ?? "INR"), { compact: true });
    case "date": return formatDate(String(v));
    case "datetime": return formatDateTime(String(v));
    case "bool": return v ? <Badge tone="brand">Yes</Badge> : <span className="text-faint">No</span>;
    case "status": return <Badge>{String(v).replace(/_/g, " ")}</Badge>;
    default: return String(v);
  }
}

export function plainCell(r: Resource, key: string, row: Record<string, unknown>, labels: Record<string, Map<string, string>>): string {
  const col = r.columns.find((c) => c.key === key)!;
  const v = row[key];
  if (v === null || v === undefined) return "";
  if (col.ref) return labels[col.ref.table]?.get(String(v)) ?? "";
  if (col.format === "money") return (Number(v) / 100).toFixed(2);
  return String(v);
}

export function RecordsTable({ r, rows, labels, base, sort, ascending, q }: {
  r: Resource; rows: Record<string, unknown>[]; labels: Record<string, Map<string, string>>; base: string; sort: string; ascending: boolean; q: string;
}) {
  if (rows.length === 0) return <EmptyState title={q ? `Nothing matches “${q}”` : `No ${r.title.toLowerCase()} yet`}>{q ? "Try a different search." : "Add the first one with the form."}</EmptyState>;
  const sortHref = (k: string) => `${base}?${new URLSearchParams({ ...(q ? { q } : {}), sort: k, dir: sort === k && ascending ? "desc" : "asc" })}`;
  return (
    <Table head={r.columns.map((c) => (
      <Link key={c.key} href={sortHref(c.key)} className="hover:underline" aria-label={`Sort by ${c.label}`}>
        {c.label}{sort === c.key ? (ascending ? " ↑" : " ↓") : ""}
      </Link>
    ))}>
      {rows.map((row) => (
        <tr key={String(row.id)}>
          {r.columns.map((c) => <Td key={c.key} numeric={c.format === "money"}>{cell(r, c.key, row, labels)}</Td>)}
        </tr>
      ))}
    </Table>
  );
}
