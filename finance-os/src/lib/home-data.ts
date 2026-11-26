import "server-only";
import type { CompanyContext } from "@/lib/workspace";
import { loadCompanyDashboard } from "@/lib/dashboard-data";
import { designFor } from "@/domain/design";
import { addDays, formatTime, todayInBusinessTz } from "@/domain/dates";
import { formatShort } from "@/domain/money";
import type { Period } from "@/domain/periods";
import type { DeskRow, HomeVM } from "@/views/company-home";

const NO = "—";

/** Builds the owner home for one company from recorded data only. */
export async function loadHomeVM(ctx: CompanyContext, period: Period, periodKey: string): Promise<HomeVM> {
  const c = ctx.company;
  const d = designFor(c.slug);
  const base = `/c/${c.slug}`;
  const today = todayInBusinessTz();
  const dash = await loadCompanyDashboard(ctx, period);
  const p = dash.pipeline;
  const stages = [...dash.crm.stages].sort((a, b) => a.position - b.position);
  const firstStage = stages.find((s) => s.kind !== "won" && s.kind !== "lost")?.name ?? "lead";
  const canAuto = ctx.can("automation.manage") || ctx.can("automation.approve");
  const [autoDefs, autoRuns] = await Promise.all([
    canAuto ? ctx.supabase.from("automation_definitions").select("id", { count: "exact", head: true }).eq("organization_id", c.id).eq("enabled", true) : Promise.resolve({ count: 0 }),
    canAuto ? ctx.supabase.from("automation_runs").select("status").eq("organization_id", c.id).in("status", ["pending_approval", "failed"]) : Promise.resolve({ data: [] }),
  ]);
  const runs = ((autoRuns as { data: { status: string }[] | null }).data ?? []);

  // Closer Desk: the design's five decisions, ranked by money at stake.
  const by = new Map(dash.desk.map((x) => [x.key, x]));
  const hot = by.get("hot"), mt = by.get("meetings"), pr = by.get("proposals"), st = by.get("stalled"), col = by.get("collections");
  const rows: (DeskRow & { money: number; order: number })[] = [
    { key: "meetings", t: "Qualified meetings to prepare", s: mt ? `${mt.count} in the next 7 days · account brief for each` : "None in the next 7 days", a: "Open", href: `${base}/meetings`, money: mt?.atStakeMinor ?? 0, order: 0 },
    { key: "hot", t: "Hot deals", s: hot ? `${hot.detail.replace(/^Largest: /, "")} · ${formatShort(hot.atStakeMinor)}` : "No deals marked hot", a: "Open", href: `${base}/pipeline?view=hot`, money: hot?.atStakeMinor ?? 0, order: 1 },
    { key: "proposals", t: "Proposals awaiting decision", s: pr ? `${pr.count} out · ${formatShort(pr.atStakeMinor)} · follow-up drafts need approval` : "No proposals out", a: "Review", href: `${base}/pipeline?view=proposals`, money: pr?.atStakeMinor ?? 0, order: 2 },
    { key: "stalled", t: "Stalled deals", s: st ? `${st.count} with no activity for 7+ days` : "No activity for 7+ days: none", a: "Nudge", href: `${base}/pipeline?view=stalled`, money: st?.atStakeMinor ?? 0, order: 3 },
    { key: "collections", t: "Collections", s: !dash.finance ? "Needs finance access" : col ? `${col.count} invoice(s) past due · ${formatShort(col.atStakeMinor)}` : "No invoices past due", a: "Chase", href: `${base}/finance?tab=overview`, money: col?.atStakeMinor ?? 0, order: 4 },
  ];
  rows.sort((a, b) => b.money - a.money || a.order - b.order);

  const kpis = await kpiSet(ctx, d.kpis, period, today, dash);
  const empty = d.empty && c.lifecycle_status !== "active" && dash.crm.deals.length === 0 ? d.empty : undefined;
  const todays = dash.todaysMeetings.map((m) => ({ time: formatTime(m.starts_at), title: m.title }));
  return {
    own: d.own, treat: d.treat, title: c.name, period: periodKey, base,
    cta: { label: `+ New ${firstStage.toLowerCase()}`, href: `${base}/pipeline?add=1` },
    empty, desk: rows,
    bars: stages.filter((s) => s.kind !== "lost").map((s) => ({ n: s.name, cnt: p.byStage.find((b) => b.stageId === s.id)?.count ?? 0 })),
    kpis, today: todays,
    auto: { live: autoDefs.count ?? 0, pending: runs.filter((r) => r.status === "pending_approval").length, failed: runs.filter((r) => r.status === "failed").length, href: canAuto ? `${base}/automation` : null },
    footnote: p.otherCurrencyOpen ? `${p.otherCurrencyOpen} open deal(s) in another currency are counted by stage but not added to ${c.base_currency} totals.` : undefined,
  };
}

type Dash = Awaited<ReturnType<typeof loadCompanyDashboard>>;

async function kpiSet(ctx: CompanyContext, set: string, period: Period, today: string, dash: Dash): Promise<HomeVM["kpis"]> {
  const sb = ctx.supabase, org = ctx.company.id, base = `/c/${ctx.company.slug}`;
  const p = dash.pipeline;
  const open = { l: "Open pipeline", s: p.probabilitiesSet ? `Weighted ${formatShort(p.weightedMinor)}` : `${p.openCount} deals · set stage probabilities`, v: formatShort(p.openValueMinor), href: `${base}/pipeline` };
  const fin = ctx.can("finance.read");
  const ops = ctx.can("operations.read");
  switch (set) {
    case "agency": {
      const [clients, ledger] = await Promise.all([
        fin ? sb.from("clients").select("monthly_retainer_minor").eq("organization_id", org).eq("service_status", "active").gt("monthly_retainer_minor", 0) : Promise.resolve({ data: null }),
        fin ? sb.from("ledger_entries").select("entry_type, status, txn_date, accounting_date, amount_minor, base_amount_minor, settled_minor, settled_on, currency, id, organization_id").eq("organization_id", org).in("entry_type", ["pass_through_out"]) : Promise.resolve({ data: null }),
      ]);
      const mrr = (clients.data ?? []).reduce((s, x) => s + Number(x.monthly_retainer_minor), 0);
      const passOut = (ledger.data ?? []).filter((r) => ["approved", "partially_settled", "settled"].includes(r.status as string) && (r.txn_date as string) >= period.start && (r.txn_date as string) < period.end).reduce((s, r) => s + Number(r.amount_minor), 0);
      return [open,
        { l: "Won this month", s: `${p.won.count} deal${p.won.count === 1 ? "" : "s"} won`, v: formatShort(p.won.valueMinor) },
        { l: "Retainer MRR", s: fin ? `${(clients.data ?? []).length} retainers` : "Needs finance access", v: fin ? formatShort(mrr) : NO, href: fin ? `/c/${ctx.company.slug}/receivables/clients` : undefined },
        { l: "Ad spend (pass-through)", s: "Not agency revenue", v: fin ? formatShort(passOut) : NO }];
    }
    case "products": {
      const { data } = ops ? await sb.from("orders").select("kind, status, total_minor, advance_received_minor").eq("organization_id", org) : { data: null };
      const o = (data ?? []) as { kind: string; status: string; total_minor: number; advance_received_minor: number }[];
      const quotes = o.filter((x) => x.status === "quoted");
      const live = o.filter((x) => !["delivered", "cancelled", "returned"].includes(x.status));
      const supply = o.filter((x) => ["supplier_po", "packed", "dispatched"].includes(x.status));
      const delivered = o.filter((x) => x.status === "delivered" && x.total_minor > x.advance_received_minor);
      return [
        { l: "Open quotes", s: `${quotes.length} quotes`, v: ops ? formatShort(quotes.reduce((s, x) => s + x.total_minor, 0)) : NO, href: `${base}/pipeline` },
        { l: "Advances held", s: "Verified 50%", v: ops ? formatShort(live.filter((x) => x.kind === "b2b").reduce((s, x) => s + x.advance_received_minor, 0)) : NO },
        { l: "Orders in supply", s: "PO raised, not yet delivered", v: ops ? String(supply.length) : NO },
        { l: "Balance due", s: `${delivered.length} delivered`, v: ops ? formatShort(delivered.reduce((s, x) => s + x.total_minor - x.advance_received_minor, 0)) : NO }];
    }
    case "ecommerce": {
      const { data } = ops ? await sb.from("orders").select("channel, total_minor, created_at, status").eq("organization_id", org).gte("created_at", `${period.start}T00:00:00+05:30`).lt("created_at", `${period.end}T00:00:00+05:30`) : { data: null };
      const o = ((data ?? []) as { channel: string; total_minor: number; status: string }[]).filter((x) => !["cancelled", "returned"].includes(x.status));
      const rev = o.reduce((s, x) => s + x.total_minor, 0);
      return [
        { l: "Store revenue", s: "Recorded orders", v: ops ? formatShort(rev) : NO },
        { l: "Orders", s: o.length ? `AOV ${formatShort(Math.round(rev / o.length))}` : "No orders yet", v: ops ? String(o.length) : NO },
        { l: "ROAS", s: "Needs ad spend data", v: NO },
        { l: "Service pipeline", s: `${p.openCount} enquiries`, v: formatShort(p.openValueMinor), href: `${base}/pipeline` }];
    }
    case "partner": {
      const [agr, rec, visits] = await Promise.all([
        ctx.can("finance.sensitive") ? sb.from("commission_agreements").select("status").eq("organization_id", org) : Promise.resolve({ data: null }),
        fin ? sb.from("commission_receivables").select("commission_minor, status").eq("organization_id", org).neq("status", "received") : Promise.resolve({ data: null }),
        sb.from("meetings").select("id", { count: "exact", head: true }).eq("organization_id", org).gte("starts_at", `${period.start}T00:00:00+05:30`).lt("starts_at", `${period.end}T00:00:00+05:30`),
      ]);
      const signed = (agr.data ?? []).some((a) => a.status === "signed");
      const handed = dash.crm.deals.filter((x) => x.last_activity_at >= `${period.start}`).length;
      return [
        { l: "Leads handed off", s: "This month", v: String(handed), href: `${base}/pipeline` },
        { l: "Site visits", s: "Booked", v: String(visits.count ?? 0) },
        { l: "Closed", s: "Partner confirmed", v: String(p.won.count) },
        { l: "Commission receivable", s: signed ? "Signed terms" : "Terms pending", v: rec.data ? formatShort(rec.data.reduce((s, x) => s + Number(x.commission_minor), 0)) : NO }];
    }
    case "loans": {
      const { data } = await sb.from("contacts").select("consent_basis, created_at").eq("organization_id", org);
      const cs = (data ?? []) as { consent_basis: string; created_at: string }[];
      return [
        { l: "Applicants", s: "This month", v: String(cs.filter((x) => x.created_at.slice(0, 10) >= period.start).length), href: `${base}/leads` },
        { l: "Consent recorded", s: "Complete", v: String(cs.filter((x) => x.consent_basis !== "none").length) },
        { l: "With provider", s: "Status only", v: String(p.openCount) },
        { l: "Disbursed", s: "Confirmed", v: String(p.won.count) }];
    }
    case "restaurant": {
      const { data } = ops ? await sb.from("outlet_daily_sales").select("sale_date, orders_count, gross_minor, platform_commission_minor").eq("organization_id", org).gte("sale_date", period.start).lt("sale_date", addDays(today, 1)) : { data: null };
      const rows = (data ?? []) as { sale_date: string; orders_count: number; gross_minor: number; platform_commission_minor: number }[];
      const todayRows = rows.filter((x) => x.sale_date === today);
      return [
        { l: "Orders today", s: "All channels", v: ops ? String(todayRows.reduce((s, x) => s + x.orders_count, 0)) : NO },
        { l: "Kitchen queue", s: "Live · needs POS sync", v: NO },
        { l: "Low stock items", s: "Alerts · needs stock data", v: NO },
        { l: "Outlet P&L (MTD)", s: rows.length ? "Gross less platform commission" : "Needs daily close", v: ops && rows.length ? formatShort(rows.reduce((s, x) => s + x.gross_minor - x.platform_commission_minor, 0)) : NO }];
    }
    default:
      return [open,
        { l: "Weighted", s: "Forecast", v: p.probabilitiesSet ? formatShort(p.weightedMinor) : NO },
        { l: "Meetings this week", s: NO, v: String(dash.meetingsThisWeek), href: `${base}/meetings` },
        { l: "Follow-ups due", s: "Open", v: String(dash.overdueTasks + dash.crm.tasks.filter((t) => t.due_on === today).length), href: `${base}/meetings` }];
  }
}
