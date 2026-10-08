/** Small text helpers shared by scoring and quality checks. */

export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

export function words(s: string): string[] {
  return normalize(s)
    .replace(/[^\p{L}\p{N}#@'\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Whole-phrase, case-insensitive containment ("wooden door" matches "Wooden doors"). */
export function containsPhrase(haystack: string, phrase: string): boolean {
  const p = normalize(phrase).trim().replace(/^#/, "");
  if (!p) return false;
  const h = normalize(haystack);
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s_-]+");
  return new RegExp(`(^|[^\\p{L}\\p{N}])#?${escaped}(s|es)?($|[^\\p{L}\\p{N}])`, "u").test(h);
}

export function matchedPhrases(haystack: string, phrases: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of phrases) {
    const key = normalize(p).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (containsPhrase(haystack, p)) out.push(p);
  }
  return out;
}

export const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function listToSentence(items: string[], max = 3): string {
  const xs = items.slice(0, max);
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
