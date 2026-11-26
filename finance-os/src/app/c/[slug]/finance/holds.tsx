import type { CompanyContext } from "@/lib/workspace";
import { formatDate, todayInBusinessTz, addDays } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { C } from "@/components/dp/theme";
import { releaseHoldAction } from "../actions";

const field = { border: `1px solid ${C.btnLine}`, borderRadius: 8, padding: "8px 10px", fontSize: 13.5, background: "#fff" } as const;

/** Clients whose work is stopped for late payment, with release / extra time for owners. */
export async function HoldsCard({ ctx, error }: { ctx: CompanyContext; error?: string }) {
  const slug = ctx.company.slug;
  const [{ data }, { data: rules }] = await Promise.all([
    ctx.supabase.from("work_holds").select("id, days_overdue, started_at, client:clients(legal_name), invoice:invoices(invoice_number, outstanding_minor, currency, due_date)")
      .eq("organization_id", ctx.company.id).eq("status", "active").order("started_at"),
    ctx.supabase.from("payment_rules").select("enabled, warn_after_days, hold_after_days").eq("organization_id", ctx.company.id).maybeSingle(),
  ]);
  const hs = (data ?? []) as unknown as { id: string; days_overdue: number; started_at: string; client: { legal_name: string } | null; invoice: { invoice_number: string; outstanding_minor: number; currency: string; due_date: string } | null }[];
  const canRelease = ctx.can("finance.approve") || ctx.can("company.settings");
  if (hs.length === 0 && !error) {
    return rules?.enabled ? <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Payment rules: team warned at {rules.warn_after_days} days overdue, work stops at {rules.hold_after_days} days. No client is on hold.</div> : null;
  }
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.red}55`, borderRadius: 16, padding: "20px 24px", marginBottom: 20 }}>
      <div style={{ fontFamily: "var(--co-font)", fontSize: 22, fontWeight: 500, color: C.red, marginBottom: 6 }}>Work on hold · {hs.length}</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>New work on these clients is blocked until they pay. Holds lift automatically when the payment is recorded.</div>
      {error && <div role="alert" style={{ background: "#F5DADA", color: C.red, borderRadius: 8, padding: "9px 12px", fontSize: 13, margin: "8px 0" }}>{error}</div>}
      {hs.map((h) => (
        <div key={h.id} style={{ padding: "12px 0", borderTop: `1px solid ${C.line2}`, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span><b>{h.client?.legal_name ?? "Client"}</b>{h.invoice ? ` · ${h.invoice.invoice_number} · ${formatMoney(h.invoice.outstanding_minor, h.invoice.currency)} due ${formatDate(h.invoice.due_date)}` : ""}</span>
            <span style={{ color: C.red, fontWeight: 600 }}>{h.days_overdue} days overdue · on hold since {formatDate(h.started_at.slice(0, 10))}</span>
          </div>
          {canRelease && (
            <form action={releaseHoldAction.bind(null, slug)} style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <input type="hidden" name="hold_id" value={h.id} />
              <input name="reason" required minLength={3} placeholder="Reason (e.g. promised payment Friday)" aria-label="Reason" style={{ ...field, flex: 1, minWidth: 200 }} />
              <input type="date" name="resume_by" min={todayInBusinessTz()} defaultValue={addDays(todayInBusinessTz(), 7)} aria-label="Give time until" style={field} />
              <button style={{ ...field, cursor: "pointer", fontWeight: 600 }}>Release hold</button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
