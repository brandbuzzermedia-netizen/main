// Grounding check for written copy: every figure in a block must be one the
// report data contains, written the same way. Claude's text is checked with
// this before anything is saved; a block that fails keeps its current text.

/** Figures as written ("81,560", "₹23.35", "98.4%", "10.6K", "2.1×", "+49"), normalised for comparison. */
export function figures(text: string): string[] {
  return (text.match(/[₹+−-]?\d[\d,]*(?:\.\d+)?\s?[%×xK]?/g) ?? []).map(normaliseFigure).filter(Boolean);
}

export function normaliseFigure(raw: string): string {
  let s = raw.trim().replace(/^[₹+−-]/, "").replace(/,/g, "").replace(/\s/g, "");
  const k = /K$/.test(s);
  s = s.replace(/[%×xK]$/, "");
  // "12.0" and "12" are the same figure; keep decimals otherwise exactly.
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  return k ? `${s}k` : s;
}

/** The set of figures a writer may use: everything in the facts and the drafts. */
export function allowedFigures(sources: string[]): Set<string> {
  const set = new Set<string>();
  for (const src of sources) figures(src).forEach((f) => set.add(f));
  return set;
}

export interface GroundingResult {
  ok: boolean;
  /** Figures in the text that are not in the allowed set. */
  unknown: string[];
}

export function checkGrounding(text: string, allowed: Set<string>): GroundingResult {
  const unknown = [...new Set(figures(text).filter((f) => !allowed.has(f)))];
  return { ok: unknown.length === 0, unknown };
}
