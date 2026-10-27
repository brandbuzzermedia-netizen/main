import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/auth";
import { formatDateTime } from "@/domain/dates";
import { Badge, EmptyState, PageHeader, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Conversations" };

type Msg = { lead_id: string; channel: string; direction: string; body: string; status: string; created_at: string; read_at: string | null };

export default async function ConversationsPage() {
  const ctx = await getContext();
  const { data, error } = await ctx.supabase.from("messages").select("lead_id, channel, direction, body, status, created_at, read_at")
    .eq("organization_id", ctx.org.id).not("lead_id", "is", null).order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  const threads = new Map<string, { last: Msg; unread: number }>();
  for (const m of (data ?? []) as Msg[]) {
    const t = threads.get(m.lead_id) ?? { last: m, unread: 0 };
    if (m.direction === "inbound" && !m.read_at) t.unread++;
    threads.set(m.lead_id, t);
  }
  const list = [...threads.entries()].sort((a, b) => b[1].unread - a[1].unread || b[1].last.created_at.localeCompare(a[1].last.created_at));
  const { data: leads } = list.length ? await ctx.supabase.from("leads").select("id, full_name").in("id", list.map(([id]) => id)) : { data: [] };
  const names = new Map((leads ?? []).map((l) => [l.id, l.full_name]));
  return (
    <>
      <PageHeader title="Conversations" description="Email and SMS threads with your leads, unread replies first. Replies stop sequences automatically; STOP replies become opt-outs." />
      {list.length === 0 ? <EmptyState title="No messages yet">Send a message from a lead&apos;s page, or enroll leads in a sequence.</EmptyState> : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {list.map(([leadId, t]) => (
            <li key={leadId}>
              <Link href={`/leads/${leadId}#messages`} className="flex items-start gap-3 px-4 py-3 text-sm hover:bg-surface-2/60">
                <div className="min-w-0 flex-1">
                  <div className={cx("flex items-center gap-2", t.unread > 0 && "font-semibold")}>
                    {names.get(leadId) ?? "Lead"} {t.unread > 0 && <Badge tone="brand">{t.unread} new</Badge>}
                  </div>
                  <div className="truncate text-muted">{t.last.direction === "inbound" ? "↩ " : ""}{t.last.body}</div>
                </div>
                <div className="shrink-0 text-right text-xs text-muted">
                  <div>{formatDateTime(t.last.created_at, ctx.org.timezone)}</div>
                  <div>{t.last.channel.toUpperCase()} · {t.last.status}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
