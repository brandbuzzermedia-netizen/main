// Conflicting figures. When a platform-reported number disagrees with the
// number calculated from other confirmed figures, neither is used until a
// reviewer chooses one.
import { analyze } from "../analysis.ts";
import type { DataConflict, ReportData, ReportDoc } from "./types.ts";

/** Smallest gap (percentage points) treated as a conflict rather than rounding. */
const TOLERANCE = 0.1;

export function detectConflicts(d: ReportData, resolutions: ReportDoc["resolutions"] = {}): DataConflict[] {
  const out: DataConflict[] = [];
  const calc = analyze(d).calcGrowth;
  if (d.ig.growth != null && calc != null && Math.abs(calc - d.ig.growth) > TOLERANCE) {
    out.push({ metric: "ig.growth", label: "Follower growth", reported: d.ig.growth, calculated: calc, chosen: resolutions["ig.growth"] ?? null });
  }
  return out;
}

/** The data the client report is rendered from, with conflicts applied. */
export function resolveData(doc: ReportDoc): { data: ReportData; conflicts: DataConflict[] } {
  const conflicts = detectConflicts(doc.data, doc.resolutions);
  const data: ReportData = { ...doc.data, ig: { ...doc.data.ig } };
  for (const c of conflicts) {
    if (c.metric === "ig.growth") data.ig.growth = c.chosen === "reported" ? c.reported : c.chosen === "calculated" ? c.calculated : null;
  }
  return { data, conflicts };
}

/** A copy of the document whose data is ready to render for the client. */
export const clientReady = (doc: ReportDoc): ReportDoc => ({ ...doc, data: resolveData(doc).data });
