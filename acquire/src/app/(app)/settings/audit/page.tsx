import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { loadLeadContext, memberName } from "@/lib/leads";
import { formatDateTime } from "@/domain/dates";
import { Card, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Audit log" };

const TABLES: Record<string, string> = {
  leads: "Lead", consent_records: "Consent", suppression_entries: "Suppression", memberships: "Team",
  organizations: "Workspace", organization_settings: "Policy", pipeline_stages: "Stage", lead_sources: "Source", subscriptions: "Subscription",
};

const VERBS: Record<string, string> = { INSERT: "created", UPDATE: "updated", DELETE: "deleted" };

export default async function AuditPage() {
  const ctx = await getContext();
  if (!ctx.can.viewAudit) notFound();
  const [{ data, error }, { members }] = await Promise.all([
    ctx.supabase.from("audit_logs").select("id, actor_id, table_name, record_id, action, old_data, new_data, created_at")
      .eq("organization_id", ctx.org.id).order("created_at", { ascending: false }).limit(200),
    loadLeadContext(ctx),
  ]);
  if (error) throw new Error(error.message);
  const who = new Map(members.map((m) => [m.user_id, memberName(m)]));
  const rows = data ?? [];
  return (
    <Card title="Latest 200 changes">
      {rows.length === 0 ? <EmptyState title="No changes recorded yet" /> : (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {rows.map((r) => {
            const changed = r.action === "UPDATE" && r.old_data && r.new_data
              ? Object.keys(r.new_data).filter((k) => k !== "updated_at" && JSON.stringify(r.old_data[k]) !== JSON.stringify(r.new_data[k]))
              : [];
            return (
              <li key={r.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
                <span className="tabular w-32 shrink-0 text-xs text-muted">{formatDateTime(r.created_at, ctx.org.timezone)}</span>
                <span>
                  <strong>{r.actor_id ? (who.get(r.actor_id) ?? "Former member") : "System"}</strong>{" "}
                  {r.action === "ERASE" ? "erased a lead" : `${VERBS[r.action] ?? r.action} ${TABLES[r.table_name] ?? r.table_name}`}
                  {changed.length > 0 && <span className="text-muted"> · {changed.slice(0, 6).join(", ")}</span>}
                  {r.action !== "ERASE" && !r.old_data && !r.new_data && <span className="text-muted"> · details redacted</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
