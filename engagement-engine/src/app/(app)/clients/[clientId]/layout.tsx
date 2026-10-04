import Link from "next/link";
import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { APPROVAL_MODE_LABELS, type ApprovalMode } from "@/lib/engine/approvals";
import { Badge, ProgressBar, StatusBadge } from "@/components/ui";

export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { user, access } = await requireClientAccess(clientId);
  const c = await withUser(user.id, (db) =>
    db.one<{ name: string; status: string; approval_mode: ApprovalMode; done: number }>(
      `select name, status, approval_mode, coalesce(array_length(onboarding_completed_steps, 1), 0) as done from clients where id = $1`,
      [clientId],
    ),
  );
  if (!c) return children;
  const setup = Math.round((c.done / 12) * 100);
  return (
    <div>
      {c.status === "onboarding" && access.canManage && (
        <Link href={`/clients/${clientId}/onboarding`} className="mb-5 block rounded-xl border border-info/20 bg-info-soft px-4 py-3 hover:border-info/40">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-info">Client setup in progress</span>
            <span className="text-xs text-info">Continue onboarding →</span>
          </div>
          <ProgressBar value={setup} label="Client setup" />
        </Link>
      )}
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <span className="font-medium text-ink-2">{c.name}</span>
        <StatusBadge status={c.status} />
        <Badge tone="neutral">{APPROVAL_MODE_LABELS[c.approval_mode].label}</Badge>
        {access.clientRole && <Badge tone="brand">{access.clientRole === "owner" ? "Client owner" : "Team member"}</Badge>}
      </div>
      {children}
    </div>
  );
}
