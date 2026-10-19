import { formatMoney } from "@/domain/money";
import { formatDate } from "@/domain/dates";
import type { Commitment } from "@/lib/db-types";
import { Badge } from "./ui";

export function CommitmentStatusBadge({ c }: { c: Commitment }) {
  if (c.status === "fulfilled") return <Badge tone="ok">{c.missed_at ? "Paid late" : "Kept"}</Badge>;
  if (c.status === "missed") return <Badge tone="danger">Missed</Badge>;
  if (c.status === "cancelled") return <Badge>Cancelled</Badge>;
  return <Badge tone="info">Open</Badge>;
}

export function CommitmentList({ items, cancelAction }: { items: Commitment[]; cancelAction?: (id: string) => (() => Promise<void>) }) {
  if (items.length === 0) return <p className="text-sm text-muted">No payment promises recorded.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {items.map((c) => (
        <li key={c.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="tabular font-medium">{formatMoney(c.promised_amount_minor)}</span> by {formatDate(c.commitment_date)}{" "}
            <CommitmentStatusBadge c={c} />
            <div className="text-xs text-muted">{c.promised_by} · promised {formatDate(c.promised_on)}{c.notes && ` · ${c.notes}`}</div>
          </div>
          {cancelAction && c.status === "open" && (
            <form action={cancelAction(c.id)}><button className="text-xs text-muted hover:underline">Cancel</button></form>
          )}
        </li>
      ))}
    </ul>
  );
}
