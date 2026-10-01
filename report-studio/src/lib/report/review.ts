// Staff-only review list for a report: what to check before it is shared.
// Never rendered into the client report.
import { hasPrevious } from "../analysis.ts";
import type { ReportData, ReportDoc } from "./types.ts";

export type Warning = ["medium" | "low", string];

export function reviewWarnings(doc: ReportDoc, data: ReportData): Warning[] {
  const warns: Warning[] = [];
  const samples = data.content.filter((c) => c.provenance === "sample").length;
  if (samples) warns.push(["medium", `${samples} of ${data.content.length} pieces carry sample figures (only fields confirmed in the brief are real). Replace them with extracted data before sending.`]);
  if (doc.isDemo && !Object.keys(doc.uploads).length) warns.push(["medium", "Source screenshot pages show placeholder renders of the figures, not the uploaded screenshots."]);
  if (!doc.isDemo && !Object.values(doc.uploads).some((l) => l?.length)) warns.push(["medium", "No source screenshots attached, so the report has no source pages and its figures cannot be checked against them. Add them under Edit data."]);
  if (!data.content.length && doc.sections.content) warns.push(["medium", "No posts entered, so the content pages show no pieces."]);
  warns.push(["low", "“Why it performed this way” is hedged on purpose. Visual causes need creative-file review."]);
  if (!hasPrevious(data)) warns.push(["medium", "No previous-month data, so month-over-month is hidden."]);
  ([["profileVisits", "Profile visits"], ["websiteClicks", "Website clicks"]] as const).forEach(([k, l]) => {
    if (data.ig[k] == null) warns.push(["low", `${l} not in uploaded data. Shown as unavailable.`]);
  });
  if (data.outcomes.sales == null) warns.push(["medium", "No sales data, so the report states sales attribution is unavailable."]);
  return warns;
}
