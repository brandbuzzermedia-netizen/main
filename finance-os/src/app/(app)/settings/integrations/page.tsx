import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { swipeApiConfig } from "@/lib/env";
import type { SyncRun } from "@/lib/db-types";
import { Badge, Card, Dl, PageHeader, Table, Td } from "@/components/ui";
import { getSyncHealth } from "@/components/sync-health";

export const metadata: Metadata = { title: "Integrations" };

function NotConnected({ children }: { children: React.ReactNode }) {
  return <Badge>Not connected · {children}</Badge>;
}

export default async function IntegrationsPage() {
  const ctx = await getContext();
  const swipe = swipeApiConfig();
  const health = await getSyncHealth();
  const { data } = await ctx.supabase
    .from("integration_sync_runs")
    .select("*")
    .eq("organization_id", ctx.org.id)
    .order("started_at", { ascending: false })
    .limit(25);
  const runs = (data ?? []) as SyncRun[];

  return (
    <>
      <PageHeader title="Integrations" description="What is connected, and how current the data is. Nothing here reports success without a real provider response." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Swipe (invoices)">
          <Dl
            items={[
              ["Active method", swipe.enabled ? "Swipe API (scheduled pull)" : "CSV export upload + manual entry"],
              ["Swipe API", swipe.enabled ? <Badge key="a" tone="ok">Enabled</Badge> : <NotConnected key="a">plan capability not yet verified</NotConnected>],
              ["Last successful import", health.lastSuccess ? new Date(health.lastSuccess.finished_at ?? health.lastSuccess.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Never"],
              ["Freshness", health.lastSuccess ? (health.stale ? <Badge key="f" tone="warn">Stale (&gt;{health.thresholdHours}h)</Badge> : <Badge key="f" tone="ok">Current</Badge>) : <Badge key="f" tone="warn">No data</Badge>],
            ]}
          />
          <p className="mt-4 text-sm text-muted">
            The API adapter stays off until a key generated in Swipe&rsquo;s <em>API Integration</em> section is tested on your plan.
            See <code>docs/SWIPE_INTEGRATION.md</code> for the checklist. Meanwhile, <Link className="text-brand underline" href="/invoices/import">import a CSV export</Link>.
          </p>
        </Card>
        <Card title="Messaging and payments">
          <Dl
            items={[
              ["Email (Resend)", <NotConnected key="e">Phase 5</NotConnected>],
              ["WhatsApp Business Platform", <NotConnected key="w">Phase 5</NotConnected>],
              ["Payment gateway (Razorpay)", <NotConnected key="p">awaiting your decision on payment links</NotConnected>],
              ["Bank statement import", <Badge key="b" tone="ok">Available: CSV upload</Badge>],
            ]}
          />
          <p className="mt-4 text-sm text-muted">No reminders are sent until a provider is configured and tested. Unconfigured channels fall back to dashboard tasks.</p>
        </Card>
      </div>
      <h2 className="mt-8 mb-3 text-sm font-semibold">Recent runs</h2>
      {runs.length === 0 ? (
        <p className="text-sm text-muted">No integration runs yet.</p>
      ) : (
        <Table head={["Started (IST)", "Job", "Method", "Status", "Result", "File"]}>
          {runs.map((r) => {
            const s = r.stats as Record<string, number | boolean>;
            return (
              <tr key={r.id}>
                <Td>{new Date(r.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</Td>
                <Td>{r.integration} · {r.job.replace("_", " ")}</Td>
                <Td>{r.channel ?? r.trigger}</Td>
                <Td><Badge tone={r.status === "succeeded" ? "ok" : r.status === "partial" ? "warn" : r.status === "failed" ? "danger" : "info"}>{r.status}</Badge></Td>
                <Td className="tabular text-xs">
                  {s.rows === undefined ? "—" : r.integration === "bank"
                    ? `${s.inserted} new · ${s.verified_existing} verified existing · ${s.duplicates} already recorded · ${s.errors} failed`
                    : `${s.inserted} new · ${s.updated} updated · ${s.unchanged} unchanged · ${s.errors} failed`}
                  {r.error && <div className="text-danger">{r.error}</div>}
                </Td>
                <Td className="text-xs">{r.file_name ?? "—"}</Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
