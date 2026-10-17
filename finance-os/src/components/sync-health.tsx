import Link from "next/link";
import { getContext } from "@/lib/auth";
import { swipeApiConfig } from "@/lib/env";
import type { SyncRun } from "@/lib/db-types";
import { Alert } from "./ui";

export type SyncHealth = {
  lastSuccess: SyncRun | null;
  lastRun: SyncRun | null;
  stale: boolean;
  thresholdHours: number;
  mode: "api" | "csv_or_manual";
  ageDays: number | null;
};

export async function getSyncHealth(): Promise<SyncHealth> {
  const ctx = await getContext();
  const [{ data: runs }, { data: settings }] = await Promise.all([
    ctx.supabase
      .from("integration_sync_runs")
      .select("*")
      .eq("organization_id", ctx.org.id)
      .eq("integration", "swipe")
      .eq("job", "invoice_import")
      .in("channel", ["api", "csv"])
      .order("started_at", { ascending: false })
      .limit(20),
    ctx.supabase.from("app_settings").select("stale_after_hours_api, stale_after_hours_manual").eq("organization_id", ctx.org.id).maybeSingle(),
  ]);
  const list = (runs ?? []) as SyncRun[];
  const mode = swipeApiConfig().enabled ? "api" : "csv_or_manual";
  const thresholdHours = mode === "api" ? settings?.stale_after_hours_api ?? 6 : settings?.stale_after_hours_manual ?? 168;
  const lastSuccess = list.find((r) => r.status === "succeeded" || r.status === "partial") ?? null;
  const ageHours = lastSuccess ? (Date.now() - Date.parse(lastSuccess.finished_at ?? lastSuccess.started_at)) / 3_600_000 : Infinity;
  return {
    lastSuccess,
    lastRun: list[0] ?? null,
    stale: ageHours > thresholdHours,
    thresholdHours,
    mode,
    ageDays: Number.isFinite(ageHours) ? Math.floor(ageHours / 24) : null,
  };
}

/** Shows a visible warning whenever invoice data from Swipe may be out of date. */
export async function SyncHealthBanner() {
  const h = await getSyncHealth();
  if (h.lastRun?.status === "failed") {
    return (
      <div className="mb-4">
        <Alert tone="danger" title="The last Swipe import failed">
          {h.lastRun.error ?? "See Integrations for details."} Invoice data may be out of date. <Link className="underline" href="/settings/integrations">Open integrations</Link>
        </Alert>
      </div>
    );
  }
  if (!h.lastSuccess) {
    return (
      <div className="mb-4">
        <Alert tone="warn" title="No Swipe sync yet">
          Invoices shown here were entered manually. Import a Swipe export so balances reflect every issued invoice.
        </Alert>
      </div>
    );
  }
  if (h.stale) {
    const days = h.ageDays ?? 0;
    return (
      <div className="mb-4">
        <Alert tone="warn" title={`Swipe data last imported ${days} day${days === 1 ? "" : "s"} ago`}>
          Invoices issued in Swipe since then are not shown. <Link className="underline" href="/invoices/import">Import a fresh export</Link>.
        </Alert>
      </div>
    );
  }
  return null;
}
