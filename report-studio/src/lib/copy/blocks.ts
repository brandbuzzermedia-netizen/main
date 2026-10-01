// Every editable copy block in a report, in page order, with the label the
// text editor shows. Ids match the generators in ./generators.ts.
import type { ReportDoc } from "../report/types.ts";

export interface BlockInfo {
  id: string;
  page: string;
  label: string;
}

const list = (prefix: string, page: string, labels: string[]): BlockInfo[] => labels.map((label, i) => ({ id: `${prefix}.${i}`, page, label }));

export function reportBlocks(doc: ReportDoc): BlockInfo[] {
  const s = doc.sections, out: BlockInfo[] = [];
  if (s.exec) out.push({ id: "exec", page: "Executive summary", label: "Summary" }, ...list("t", "Executive summary", ["Takeaway 1", "Takeaway 2", "Takeaway 3", "Takeaway 4", "Takeaway 5"]));
  if (s.social) out.push(...list("w", "What we worked on", ["Content strategy", "Social media", "Reels", "Paid media", "Optimisation"]));
  if (s.ig) out.push({ id: "ig_what", page: "Instagram performance", label: "What happened" }, { id: "ig_means", page: "Instagram performance", label: "What this means" }, { id: "ig_next", page: "Instagram performance", label: "What we should do next" });
  if (s.content) {
    doc.data.content.forEach((c, i) => out.push({ id: `why.${c.id}`, page: "Content breakdown", label: `Why it performed: post ${i + 1} (${c.date}, ${c.theme})` }));
    out.push(...list("cw", "Content insights", ["What worked 1", "What worked 2", "What worked 3"]), ...list("cn", "Content insights", ["What did not work 1", "What did not work 2", "What did not work 3"]), ...list("ct", "Content insights", ["What to test 1", "What to test 2", "What to test 3"]));
  }
  if (s.meta && doc.data.meta.spend != null) {
    out.push({ id: "camp_obs", page: "Campaign performance", label: "Campaign observation" }, { id: "camp_int", page: "Campaign performance", label: "Client-friendly interpretation" });
    out.push({ id: "pd_data", page: "Paid media insights", label: "Data" }, { id: "pd_obs", page: "Paid media insights", label: "Observation" }, { id: "pd_int", page: "Paid media insights", label: "Interpretation" }, { id: "pd_act", page: "Paid media insights", label: "Action" });
  }
  if (s.impact || s.leads) out.push({ id: "imp", page: "Business impact", label: "Summary" });
  if (s.mom && Object.values(doc.data.prev).some((v) => v != null)) out.push({ id: "mom", page: "Month over month", label: "Explanation" });
  if (s.recs) out.push(...list("rc", "Next month strategy", ["Content", "Paid media", "Audience", "Creatives", "Conversion"]));
  return out;
}
