import type { SupabaseClient } from "@supabase/supabase-js";
import { receivablesOn } from "@/lib/phases";

/**
 * The "Get started" guide for one company: what to do first, worked out from the company's own
 * records, so each step ticks itself off when it is done. Connections show whether the server
 * has the provider set up; they never show keys.
 */
export type SetupStep = { key: string; title: string; why: string; href: string; done: boolean; detail?: string };
export type SetupGuide = { steps: SetupStep[]; connections: SetupStep[]; done: number; total: number };

const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

export async function loadSetupGuide(db: SupabaseClient, org: { id: string; slug: string; family_group_id?: string | null }): Promise<SetupGuide> {
  const base = `/c/${org.slug}`;
  const [clients, invoices, leads, deals, members, accounts, growth, products] = await Promise.all([
    count(db.from("clients").select("id", { count: "exact", head: true }).eq("organization_id", org.id)),
    count(db.from("invoices").select("id", { count: "exact", head: true }).eq("organization_id", org.id)),
    count(db.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", org.id)),
    count(db.from("deals").select("id", { count: "exact", head: true }).eq("organization_id", org.id)),
    count(db.from("memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", org.id)),
    count(db.from("sender_accounts").select("id", { count: "exact", head: true }).eq("organization_id", org.id)),
    db.from("growth_settings").select("booking_url").eq("organization_id", org.id).maybeSingle(),
    org.slug === "tan-o-fun" ? count(db.from("products").select("id", { count: "exact", head: true }).eq("organization_id", org.id)) : Promise.resolve(-1),
  ]);
  const steps: SetupStep[] = [
    { key: "clients", title: "Add clients who owe you money", why: "Fastest cash: their dues, reminders and late-payment holds start working.", href: `${base}/receivables/clients`, done: clients > 0, detail: clients ? `${clients} added` : undefined },
    { key: "invoices", title: "Add their pending invoices", why: "Due dates drive reminders, warnings and the stop-work rule.", href: `${base}/receivables/invoices`, done: invoices > 0, detail: invoices ? `${invoices} added` : undefined },
    { key: "leads", title: "Bring in at least 10 leads", why: "Old clients, referrals, contacts. Upload a CSV or add them one by one.", href: `${base}/leads/import`, done: leads >= 10, detail: leads ? `${leads} so far` : undefined },
    { key: "deals", title: "Put your open deals in the pipeline", why: "Every conversation that could close, with its value and next step.", href: `${base}/pipeline?add=1`, done: deals > 0, detail: deals ? `${deals} deals` : undefined },
    { key: "booking", title: "Add your meeting booking link", why: "Interested leads book straight into your calendar (Cal.com is free).", href: `${base}/settings#growth`, done: Boolean(growth.data?.booking_url) },
    { key: "team", title: "Invite your closer or team", why: "Each person sees only their own leads and tasks.", href: `${base}/team?add=1`, done: members > 1, detail: members > 1 ? `${members} people` : undefined },
  ];
  if (products >= 0) steps.splice(3, 0, { key: "products", title: "Add products with BIS proof", why: "Only BIS-certified toys can be quoted or listed.", href: `${base}/r/products`, done: products > 0, detail: products ? `${products} products` : undefined });
  const env = process.env;
  const connections: SetupStep[] = [
    { key: "razorpay", title: "Razorpay payment links", why: "Invoices go out with a pay link and mark themselves paid.", href: `${base}/receivables/integrations`, done: env.RAZORPAY_ENABLED === "true" && Boolean(env.RAZORPAY_KEY_ID) },
    { key: "n8n", title: "Automation server (n8n)", why: "Sends emails, reminders and posts; brings replies back.", href: "/group/automation", done: Boolean(env.N8N_BASE_URL) },
    { key: "mailboxes", title: "Sending mailboxes", why: "Warm-up takes 2–3 weeks, so add them as soon as you can.", href: `${base}/settings#accounts`, done: accounts > 0, detail: accounts ? `${accounts} accounts` : undefined },
    { key: "ai", title: "AI replies and AI calls", why: "Anthropic key for replies; ElevenLabs for calls and recordings.", href: `${base}/settings#ai`, done: Boolean(env.ANTHROPIC_API_KEY) },
  ];
  // Clients, invoices and payment links come in phase 2.
  if (!receivablesOn()) {
    for (const k of ["clients", "invoices"]) { const i = steps.findIndex((x) => x.key === k); if (i >= 0) steps.splice(i, 1); }
    const r = connections.findIndex((x) => x.key === "razorpay"); if (r >= 0) connections.splice(r, 1);
  }
  const done = steps.filter((s) => s.done).length;
  return { steps, connections, done, total: steps.length };
}
