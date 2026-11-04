// Edit tools for copy blocks: shorten and expand. Neither adds a figure:
// expand only appends a fixed sentence about where the figures come from.
import type { Analysis } from "../analysis.ts";
import { EXT } from "./generators.ts";

/** The first sentence only. */
export function shorten(text: string): string {
  const first = text.trim().split(/(?<=[.!?])\s+/)[0];
  return first || text.trim();
}

const DEFAULT_EXT = "This is calculated directly from the uploaded platform data for the reporting period.";

/** Adds one sentence of context, once. */
export function expand(id: string, text: string, A: Analysis): string {
  const extra = EXT[id.split(".")[0]]?.(A) ?? DEFAULT_EXT;
  return text.includes(extra) ? text : `${text.trim()} ${extra}`;
}
