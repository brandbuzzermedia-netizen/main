import type { Metadata } from "next";
import { getGroupContext } from "@/lib/workspace";
import { GroupHead } from "@/lib/group-head";
import { financialYear } from "@/domain/periods";
import { todayInBusinessTz } from "@/domain/dates";
import { ListView, NOTES } from "@/views/list";
import { addDays } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { loadFunnel, pct } from "@/lib/funnel";
import { C } from "@/components/dp/theme";

export const metadata: Metadata = { title: "Reports" };

export default async function GroupReports({ searchParams }: PageProps<"/group/reports">) {
  const g = await getGroupContext();
  const sp = await searchParams;
  const days = sp.days === "90" ? 90 : sp.days === "7" ? 7 : 30;
  const since = addDays(todayInBusinessTz(), -days);
  const cos = g.registry.filter((c) => g.access.get(c.id)?.permissions.has("crm.read_all"));
  const funnels = await Promise.all(cos.map(async (c) => ({ c, f: await loadFunnel(g.supabase, c.id, since, g.access.get(c.id)!.permissions.has("finance.read")) })));
  const th = { textAlign: "right", padding: "8px 10px", fontSize: 12, color: C.muted, fontWeight: 600, whiteSpace: "nowrap" } as const;
  const td = { textAlign: "right", padding: "9px 10px", borderTop: `1px solid ${C.line2}`, fontSize: 14, whiteSpace: "nowrap" } as const;
  const fy = financialYear(todayInBusinessTz(), g.group.fy_start_month);
  const [title, lines] = NOTES.reports;
  return (
    <>
      <GroupHead title="Reports" />
      {funnels.length > 0 && (
        <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 26px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "var(--co-font, inherit)", fontSize: 22, fontWeight: 500 }}>Lead to cash by company · last {days} days</div>
            <nav aria-label="Period" style={{ display: "flex", gap: 6 }}>
              {[7, 30, 90].map((n) => <a key={n} href={`/group/reports?days=${n}`} aria-current={n === days ? "page" : undefined} style={{ fontSize: 13, fontWeight: 600, padding: "4px 10px", borderRadius: 7, textDecoration: "none", border: `1px solid ${C.btnLine}`, color: n === days ? "#fff" : C.ink, background: n === days ? C.ink : "transparent" }}>{n} days</a>)}
            </nav>
          </div>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={{ ...th, textAlign: "left" }}>COMPANY</th><th style={th}>LEADS</th><th style={th}>TOUCHES</th><th style={th}>REPLIES</th><th style={th}>MEETINGS</th><th style={th}>WON</th><th style={th}>COLLECTED</th></tr></thead>
              <tbody>
                {funnels.map(({ c, f }) => (
                  <tr key={c.id}>
                    <td style={{ ...td, textAlign: "left" }}><a href={`/c/${c.slug}/reports?days=${days}`} style={{ color: C.ink, fontWeight: 600, textDecoration: "none" }}>{c.name}</a></td>
                    <td style={td}>{f.leads}</td><td style={td}>{f.touches}</td>
                    <td style={td}>{f.replies} <span style={{ color: C.faint, fontSize: 12 }}>{pct(f.replies, f.leads)}</span></td>
                    <td style={td}>{f.meetings}</td>
                    <td style={td}>{f.won} <span style={{ color: C.faint, fontSize: 12 }}>{formatMoney(f.wonMinor, "INR", { compact: true })}</span></td>
                    <td style={td}>{f.collectedMinor === null ? "—" : formatMoney(f.collectedMinor, "INR", { compact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ListView vm={{
        chips: [{ l: "Export (logged)" }, { l: "CSV" }, { l: "PDF" }], head: ["REPORT", "PERIOD", "STATUS", "OWNER"],
        rows: [
          { a: "Owner pack: Command Centre", b: "Month", c: "Ready", d: "Group", href: "/group" },
          { a: "Group finance and company comparison", b: fy.label, c: "Ready", d: "Finance", href: "/group/finance" },
          { a: "Group pipeline", b: "Live", c: "Ready", d: "Sales", href: "/group/pipeline" },
          { a: "Rental statement by unit", b: fy.label, c: "Ready", d: "Finance", href: "/group/rental" },
          { a: "Filing status", b: fy.label, c: "Ready", d: "Finance", href: "/group/tax" },
          { a: "Automation health", b: "30 days", c: "Ready", d: "Operations", href: "/group/automation" },
        ],
        empty: "", noteTitle: title, noteLines: lines,
      }} />
    </>
  );
}
