"use client";

import { useState, useTransition } from "react";
import { Alert, Badge, Button } from "./ui";
import { formatMoney } from "@/domain/money";

export type LinkRow = {
  id: string;
  short_url: string;
  status: "created" | "partially_paid" | "paid" | "expired" | "cancelled";
  amount_minor: number;
  amount_paid_minor: number;
  expire_by: string | null;
  created_at: string;
};

const TONE = { created: "info", partially_paid: "warn", paid: "ok", expired: "neutral", cancelled: "neutral" } as const;
const LABEL = { created: "Open", partially_paid: "Part paid", paid: "Paid", expired: "Expired", cancelled: "Cancelled" } as const;

export function PaymentLinkCard({
  links, configured, mode, canWrite, canCreate, outstandingMinor, onCreate, onCancel,
}: {
  links: LinkRow[];
  configured: boolean;
  mode: "live" | "test" | "unknown";
  canWrite: boolean;
  canCreate: boolean;
  outstandingMinor: number;
  onCreate: (replace: boolean) => Promise<{ error?: string }>;
  onCancel: (linkId: string) => Promise<{ error?: string }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const open = links.find((l) => l.status === "created" || l.status === "partially_paid");
  const stale = open && open.amount_minor !== outstandingMinor + open.amount_paid_minor;

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
    });

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Select the link and copy it manually.");
    }
  };

  if (!configured) {
    return <p className="text-sm text-muted">Razorpay is not connected. See Integrations to set it up; reminders will use bank transfer details until then.</p>;
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {mode === "test" && <Badge tone="warn">Test mode: links do not take real money</Badge>}
      {open ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Badge tone={TONE[open.status]}>{LABEL[open.status]}</Badge>
            <span className="tabular">{formatMoney(open.amount_minor)}</span>
          </div>
          <div className="flex items-center gap-2">
            <input readOnly value={open.short_url} aria-label="Payment link" className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="secondary" onClick={() => copy(open.short_url)}>{copied ? "Copied" : "Copy"}</Button>
          </div>
          {open.expire_by && <p className="text-xs text-muted">Expires {new Date(open.expire_by).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })}</p>}
          {stale && <Alert tone="warn">The balance changed since this link was made. Replace it so the client pays the right amount.</Alert>}
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              {canCreate && <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => onCreate(true))}>Replace link</Button>}
              <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => onCancel(open.id))}>Cancel link</Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-muted">No open link. A link lets the client pay {formatMoney(outstandingMinor)} by UPI, card or netbanking; the payment is recorded and verified automatically from Razorpay&rsquo;s signed webhook.</p>
          {canWrite && canCreate && (
            <div><Button type="button" disabled={pending} onClick={() => run(() => onCreate(false))}>{pending ? "Creating…" : "Create Razorpay link"}</Button></div>
          )}
        </>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      {links.filter((l) => l !== open).length > 0 && (
        <ul className="border-t border-line pt-2 text-xs text-muted">
          {links.filter((l) => l !== open).map((l) => (
            <li key={l.id}>{LABEL[l.status]} · {formatMoney(l.amount_minor)} · {new Date(l.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
