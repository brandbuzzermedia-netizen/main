import "server-only";
import type { GroupContext } from "@/lib/workspace";
import { companiesWith } from "@/lib/group-data";
import { loadGroupLedger } from "@/lib/group-ledger";
import { summarizeLedger, type LedgerSummary } from "@/domain/ledger";
import { rentalReport, type UnitReport } from "@/domain/rental";

/** Ledger, rental, bill-queue and automation figures for the Command Centre (only what the viewer may read). */
export async function loadGroupExtras(g: GroupContext, period: { start: string; end: string }, today: string) {
  const ledger = await loadGroupLedger(g, period);
  const ledgerSummary: LedgerSummary | null = ledger.readable.length ? summarizeLedger(ledger.consolidatedRows, period) : null;

  const rentCos = companiesWith(g, "rental.read");
  let rental: { total: Omit<UnitReport, "unitId">; units: { label: string; report: UnitReport; tenant: boolean }[] } | null = null;
  if (rentCos.length) {
    const ids = rentCos.map((c) => c.id);
    const [units, leases, charges, receipts, deposits] = await Promise.all([
      g.supabase.from("rental_units").select("id, label").in("organization_id", ids),
      g.supabase.from("leases").select("id, unit_id, status").in("organization_id", ids),
      g.supabase.from("rent_charges").select("id, lease_id, due_on, amount_minor, received_minor, status").in("organization_id", ids).limit(10000),
      g.supabase.from("rent_receipts").select("charge_id, amount_minor, received_on").in("organization_id", ids).limit(20000),
      g.supabase.from("security_deposit_ledger").select("lease_id, kind, amount_minor").in("organization_id", ids),
    ]);
    const u = (units.data ?? []) as { id: string; label: string }[];
    const ls = (leases.data ?? []) as { id: string; unit_id: string; status: string }[];
    const unitOf = new Map(ls.map((l) => [l.id, l.unit_id]));
    const r = rentalReport(u.map((x) => x.id), {
      charges: ((charges.data ?? []) as { id: string; lease_id: string; due_on: string; amount_minor: number; received_minor: number; status: string }[]).map((c) => ({ ...c, unit_id: unitOf.get(c.lease_id)! })),
      receipts: (receipts.data ?? []) as { charge_id: string; amount_minor: number; received_on: string }[],
      deposits: ((deposits.data ?? []) as { lease_id: string; kind: "received"; amount_minor: number }[]).map((d) => ({ ...d, unit_id: unitOf.get(d.lease_id)! })),
      expenses: [],
    }, period, today);
    rental = { total: r.total, units: r.units.map((x) => ({ label: u.find((y) => y.id === x.unitId)!.label, report: x, tenant: ls.some((l) => l.unit_id === x.unitId && l.status === "active") })) };
  }

  const docCos = companiesWith(g, "documents.read");
  const bills = docCos.length
    ? (await g.supabase.from("ocr_extractions").select("id", { count: "exact", head: true }).in("organization_id", docCos.map((c) => c.id)).in("status", ["extracted", "failed"])).count ?? 0
    : null;

  const autoCos = [...companiesWith(g, "automation.manage"), ...companiesWith(g, "automation.approve")];
  let automation: { live: number; failed: number; pending: number } | null = null;
  if (autoCos.length) {
    const ids = [...new Set(autoCos.map((c) => c.id))];
    const [defs, runs] = await Promise.all([
      g.supabase.from("automation_definitions").select("id", { count: "exact", head: true }).in("organization_id", ids).eq("enabled", true),
      g.supabase.from("automation_runs").select("status").in("organization_id", ids).in("status", ["failed", "pending_approval"]),
    ]);
    const rs = (runs.data ?? []) as { status: string }[];
    automation = { live: defs.count ?? 0, failed: rs.filter((x) => x.status === "failed").length, pending: rs.filter((x) => x.status === "pending_approval").length };
  }
  return { ledgerSummary, rental, bills, automation };
}
