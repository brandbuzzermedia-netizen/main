/** Money is stored as integer minor units (cents, pence, fils) next to an ISO currency. */

const SCALE: Record<string, number> = { USD: 100, GBP: 100, AED: 100, CAD: 100, AUD: 100, EUR: 100, INR: 100 };

export function minorUnits(currency: string): number {
  return SCALE[currency.toUpperCase()] ?? 100;
}

/**
 * Parses "450000", "$450,000", "450k", "1.2m", "AED 2,500,000". Returns minor units, or null for
 * empty input, or NaN when the text is not a number.
 */
export function parseAmount(raw: string | null | undefined, currency: string): number | null {
  const v = (raw ?? "").trim().toLowerCase().replace(/[a-z]{3}\s+/, "").replace(/[\s,$£€]/g, "");
  if (!v) return null;
  const m = /^(\d+(?:\.\d+)?)([km]?)$/.exec(v);
  if (!m) return Number.NaN;
  const mult = m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1;
  return Math.round(Number(m[1]) * mult * minorUnits(currency));
}

export function formatMoney(minor: number | null | undefined, currency: string, opts: { compact?: boolean } = {}): string {
  if (minor === null || minor === undefined) return "—";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    notation: opts.compact ? "compact" : "standard",
  }).format(minor / minorUnits(currency));
}

export function formatBudget(min: number | null, max: number | null, currency: string | null): string {
  if (!currency || (min === null && max === null)) return "—";
  if (min !== null && max !== null) return `${formatMoney(min, currency, { compact: true })}–${formatMoney(max, currency, { compact: true })}`;
  if (max !== null) return `up to ${formatMoney(max, currency, { compact: true })}`;
  return `from ${formatMoney(min, currency, { compact: true })}`;
}

export function minorToInput(minor: number | null | undefined, currency: string): string {
  return minor === null || minor === undefined ? "" : String(minor / minorUnits(currency));
}
