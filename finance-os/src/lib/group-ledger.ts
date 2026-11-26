import "server-only";
import type { GroupContext } from "@/lib/workspace";
import { companiesWith } from "@/lib/group-data";
import { dropMatchedTransfers, type LedgerRow } from "@/domain/ledger";
import { includedInGroupTotals } from "@/domain/dashboard";

export type GroupLedgerRow = LedgerRow & { transfer_group_id: string | null };

/** Approved ledger rows of the consolidated companies the viewer can read, with matched internal transfers removed. */
export async function loadGroupLedger(g: GroupContext, period: { start: string; end: string }) {
  const readable = companiesWith(g, "finance.read");
  const consolidated = readable.filter((c) => includedInGroupTotals(c.consolidation));
  const ids = readable.map((c) => c.id);
  const { data, error } = ids.length ? await g.supabase.from("ledger_entries")
    .select("id, organization_id, entry_type, status, txn_date, accounting_date, amount_minor, base_amount_minor, settled_minor, settled_on, currency, transfer_group_id")
    .in("organization_id", ids).in("status", ["approved", "partially_settled", "settled"])
    .gte("txn_date", `${Number(period.start.slice(0, 4)) - 2}-01-01`).limit(20000) : { data: [], error: null };
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as GroupLedgerRow[];
  const consolidatedIds = new Set(consolidated.map((c) => c.id));
  return { readable, consolidated, rows, consolidatedRows: dropMatchedTransfers(rows.filter((r) => consolidatedIds.has(r.organization_id))) };
}
