import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanyContext } from "@/lib/workspace";
import { todayInBusinessTz } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { designFor } from "@/domain/design";
import { PageHead } from "@/components/dp/shell";
import { LeadRow, RouteBuilder } from "@/components/field/field-client";
import { funnel } from "@/lib/field-sales";
import { loadFieldLeads, weekStart } from "@/lib/field-data";
import { saveRouteAction } from "./actions";
import { Box, FieldTabs } from "./tabs";

export const metadata: Metadata = { title: "Field sales" };

/** Field Sales home: today's route, follow-ups due, owners back today, and today's and this week's numbers. */
export default async function FieldToday({ params, searchParams }: PageProps<"/c/[slug]/field">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCompanyContext(slug);
  if (!ctx.can("crm.write")) notFound();
  const today = todayInBusinessTz();
  const monday = weekStart(today);
  const team = sp.who === "team" && ctx.can("crm.read_all");
  let visitsQ = ctx.supabase.from("field_visits").select("outcome, amount_minor, visited_at").eq("organization_id", ctx.company.id).gte("visited_at", `${monday}T00:00:00+05:30`);
  if (!team) visitsQ = visitsQ.eq("created_by", ctx.userId);
  const [leads, { data: plan }, { data: visits }] = await Promise.all([
    loadFieldLeads(ctx),
    ctx.supabase.from("field_route_plans").select("contact_ids").eq("organization_id", ctx.company.id).eq("user_id", ctx.userId).eq("plan_date", today).maybeSingle(),
    visitsQ.limit(5000),
  ]);
  const vs = (visits ?? []) as { outcome: string; amount_minor: number | null; visited_at: string }[];
  const istDay = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const todays = vs.filter((v) => istDay(v.visited_at) === today);
  const stats = (rows: typeof vs) => ({ ...funnel(rows.map((r) => r.outcome)), rupees: rows.reduce((s, r) => s + Number(r.amount_minor ?? 0), 0) });
  const t = stats(todays), w = stats(vs);
  const due = leads.filter((l) => l.next_follow_up_on && l.next_follow_up_on <= today);
  const back = leads.filter((l) => l.owner_back_at && istDay(l.owner_back_at) === today).sort((a, b) => a.owner_back_at!.localeCompare(b.owner_back_at!));
  const d = designFor(slug);
  const rows: [string, keyof typeof t][] = [["Visits", "visits"], ["Owners met", "met"], ["Demos", "demos"], ["Interested", "interested"], ["Advances paid", "paid"]];
  const steps: [string, number][] = [["Visits", w.visits], ["Demos", w.demos], ["Interested", w.interested], ["Paid", w.paid]];
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
  return (
    <>
      <PageHead own={d.own} treat="Plan, navigate and log visits" title="Field sales" tag="Today." />
      <FieldTabs slug={slug} current="" note={sp.note} />
      <Box title="Today's route" aside={<span style={{ fontSize: 13, color: "#6B6B6B" }}>up to 9 stops</span>}>
        <RouteBuilder slug={slug} leads={leads} initial={(plan?.contact_ids as string[] | undefined) ?? []} today={today} save={saveRouteAction.bind(null, slug)} />
      </Box>
      {back.length > 0 && (
        <Box title="Owners back today">
          {back.map((l) => <div key={l.id}><div style={{ fontSize: 13, fontWeight: 700, color: "#D97706", paddingTop: 8 }}>Back at {time(l.owner_back_at!)}</div><LeadRow l={l} slug={slug} /></div>)}
        </Box>
      )}
      <Box title="Follow-ups due" aside={<span style={{ fontSize: 13, color: "#6B6B6B" }}>{due.length}</span>}>
        {due.length === 0 ? <div style={{ fontSize: 14, color: "#6B6B6B", paddingBottom: 4 }}>Nothing due. Visit new leads from the list.</div> : due.slice(0, 30).map((l) => <LeadRow key={l.id} l={l} slug={slug} />)}
      </Box>
      <Box title={team ? "Team numbers" : "My numbers"} aside={ctx.can("crm.read_all") ? <a href={`/c/${slug}/field${team ? "" : "?who=team"}`} style={{ fontSize: 13.5, fontWeight: 700 }}>{team ? "Show mine" : "Show team"}</a> : undefined}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
          <thead><tr><th style={{ textAlign: "left", fontSize: 12, color: "#6B6B6B", fontWeight: 600, padding: "4px 0" }} /><th style={{ textAlign: "right", fontSize: 12, color: "#6B6B6B", fontWeight: 600 }}>Today</th><th style={{ textAlign: "right", fontSize: 12, color: "#6B6B6B", fontWeight: 600 }}>This week</th></tr></thead>
          <tbody>
            {rows.map(([l, k]) => <tr key={k} style={{ borderTop: "1px solid #EFEBE1" }}><td style={{ padding: "9px 0" }}>{l}</td><td style={{ textAlign: "right", fontWeight: 800 }}>{t[k]}</td><td style={{ textAlign: "right", fontWeight: 800 }}>{w[k]}</td></tr>)}
            <tr style={{ borderTop: "1px solid #EFEBE1" }}><td style={{ padding: "9px 0" }}>₹ collected</td><td style={{ textAlign: "right", fontWeight: 800 }}>{formatMoney(t.rupees)}</td><td style={{ textAlign: "right", fontWeight: 800 }}>{formatMoney(w.rupees)}</td></tr>
          </tbody>
        </table>
      </Box>
      <Box title="This week's funnel">
        {steps.map(([l, n], i) => {
          const pct = w.visits ? Math.round((n / w.visits) * 100) : 0;
          const prev = i > 0 ? steps[i - 1][1] : 0;
          return (
            <div key={l} style={{ padding: "6px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><b>{l}</b><span>{n}{i > 0 && prev ? ` · ${Math.round((n / prev) * 100)}% of ${steps[i - 1][0].toLowerCase()}` : ""}</span></div>
              <div style={{ height: 12, background: "#F1EDE3", borderRadius: 6, marginTop: 4, overflow: "hidden" }}><div style={{ width: `${i === 0 ? (w.visits ? 100 : 0) : pct}%`, height: "100%", background: "var(--co-btn)", borderRadius: 6 }} /></div>
            </div>
          );
        })}
        <div style={{ fontSize: 12.5, color: "#6B6B6B", marginTop: 6 }}>Week from Monday {monday.slice(8, 10)}/{monday.slice(5, 7)}. Demos count visits where a demo was shown, including ones that ended interested or paid.</div>
      </Box>
    </>
  );
}
