import type { SupabaseClient } from "@supabase/supabase-js";

export type Funnel = { leads: number; touches: number; replies: number; meetings: number; won: number; wonMinor: number; invoicedMinor: number | null; collectedMinor: number | null };

const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
const sum = (rows: Record<string, unknown>[] | null, k: string) => (rows ?? []).reduce((s, r) => s + Number(r[k] ?? 0), 0);

/** Lead-to-cash numbers for one company since a date: where leads drop out. Finance figures only with finance access. */
export async function loadFunnel(db: SupabaseClient, org: string, since: string, finance: boolean): Promise<Funnel> {
  const ts = `${since}T00:00:00+05:30`;
  const [leads, manual, sent, replies, meetings, won, inv, pay] = await Promise.all([
    count(db.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", org).gte("created_at", ts)),
    count(db.from("outreach_events").select("id", { count: "exact", head: true }).eq("organization_id", org).gte("occurred_at", ts)
      .in("kind", ["email", "whatsapp", "linkedin", "call", "facebook", "instagram", "twitter"])),
    count(db.from("outreach_send_log").select("id", { count: "exact", head: true }).eq("organization_id", org).gte("sent_on", since)),
    count(db.from("outreach_events").select("id", { count: "exact", head: true }).eq("organization_id", org).gte("occurred_at", ts).eq("kind", "reply")),
    count(db.from("meetings").select("id", { count: "exact", head: true }).eq("organization_id", org).gte("created_at", ts)),
    db.from("deals").select("value_minor, pipeline_stages!inner(kind)").eq("organization_id", org).gte("closed_at", ts).eq("pipeline_stages.kind", "won").limit(5000),
    finance ? db.from("invoices").select("total_minor").eq("organization_id", org).gte("invoice_date", since).neq("status", "cancelled").limit(10000) : Promise.resolve({ data: null }),
    finance ? db.from("payments").select("amount_minor").eq("organization_id", org).gte("payment_date", since).eq("kind", "receipt").eq("verification_status", "verified").limit(10000) : Promise.resolve({ data: null }),
  ]);
  return { leads, touches: manual + sent, replies, meetings, won: won.data?.length ?? 0, wonMinor: sum(won.data, "value_minor"),
    invoicedMinor: finance ? sum(inv.data, "total_minor") : null, collectedMinor: finance ? sum(pay.data, "amount_minor") : null };
}

export const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
