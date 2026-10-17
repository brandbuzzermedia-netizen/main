import { Badge } from "./ui";
import type { AgeingBucket, PaymentState, ServiceStatus, SyncStatus } from "@/lib/db-types";

const AGEING: Record<AgeingBucket, [string, "neutral" | "ok" | "warn" | "danger" | "info"]> = {
  cancelled: ["Cancelled", "neutral"],
  settled: ["Settled", "ok"],
  disputed: ["Disputed", "info"],
  not_due: ["Not due", "neutral"],
  due_today: ["Due today", "warn"],
  overdue_1_15: ["Overdue", "warn"],
  overdue_16_45: ["Overdue 16–45d", "danger"],
  overdue_45_plus: ["Overdue 45d+", "danger"],
};

export function AgeingBadge({ bucket, days }: { bucket: AgeingBucket; days?: number }) {
  const [label, tone] = AGEING[bucket];
  const text = bucket === "overdue_1_15" && days ? `${days}d overdue` : label;
  return <Badge tone={tone}>{text}</Badge>;
}

export function PaymentStateBadge({ state }: { state: PaymentState }) {
  if (state === "paid") return <Badge tone="ok">Paid (verified)</Badge>;
  if (state === "partially_paid") return <Badge tone="warn">Part paid</Badge>;
  return <Badge>Unpaid</Badge>;
}

export function SyncBadge({ status, channel }: { status: SyncStatus; channel: string }) {
  const label = channel === "api" ? "Swipe API" : channel === "csv" ? "Swipe CSV" : "Manual entry";
  const tone = status === "current" ? "ok" : status === "error" ? "danger" : status === "stale" ? "warn" : "neutral";
  return <Badge tone={tone}>{label}</Badge>;
}

export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  const tone = status === "active" ? "ok" : status === "suspended" ? "danger" : status === "paused" ? "warn" : "neutral";
  return <Badge tone={tone}>{status.replace("_", " ")}</Badge>;
}
