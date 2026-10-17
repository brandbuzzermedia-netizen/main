/**
 * Money is always an integer count of minor units (paise for INR).
 * Never parse amounts with parseFloat: "0.1 + 0.2" style drift is unacceptable in a ledger.
 */

export type Minor = number;

export class MoneyParseError extends Error {}

const MAX_SAFE_MINOR = Number.MAX_SAFE_INTEGER;

/**
 * Parse a human or spreadsheet amount into minor units.
 * Accepts "₹1,23,456.78", "Rs. 1,234", "1234.5", "(1,000.00)" (negative), "-50".
 * Rejects more than two decimals, stray letters and empty input.
 */
export function parseMoneyToMinor(input: string | number, { allowNegative = false } = {}): Minor {
  let raw = typeof input === "number" ? numberToPlainString(input) : input;
  raw = raw.trim();
  if (raw === "") throw new MoneyParseError("Amount is empty");

  let negative = false;
  if (/^\(.*\)$/.test(raw)) {
    negative = true;
    raw = raw.slice(1, -1).trim();
  }
  raw = raw.replace(/^(₹|rs\.?|inr)\s*/i, "").replace(/\s*(₹|rs\.?|inr)$/i, "");
  if (raw.startsWith("-")) {
    negative = !negative;
    raw = raw.slice(1).trim();
  }
  raw = raw.replace(/^(₹|rs\.?|inr)\s*/i, "");
  raw = raw.replace(/[,\s]/g, "");

  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(raw);
  if (!match) throw new MoneyParseError(`"${typeof input === "string" ? input : raw}" is not a valid amount`);

  const rupees = match[1];
  const paise = (match[2] ?? "").padEnd(2, "0");
  const minor = Number(rupees) * 100 + Number(paise);
  if (!Number.isSafeInteger(minor) || minor > MAX_SAFE_MINOR) throw new MoneyParseError("Amount is too large");
  if (negative && minor !== 0 && !allowNegative) throw new MoneyParseError("Amount cannot be negative");
  return negative ? -minor : minor;
}

function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) throw new MoneyParseError("Amount is not a finite number");
  // Spreadsheet numbers like 1180 or 1180.5. Round to 2dp textually to avoid binary artefacts.
  return n.toFixed(2);
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Format minor units for display, e.g. 12345678 → "₹1,23,456.78" (Indian digit grouping). */
export function formatMoney(minor: Minor, currency = "INR", { compact = false } = {}): string {
  const key = `${currency}:${compact}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: compact ? 0 : 2,
      maximumFractionDigits: compact ? 0 : 2,
    });
    formatters.set(key, f);
  }
  return f.format(minor / 100);
}

/** Minor units → plain decimal string for form inputs, e.g. 590000 → "5900.00". */
export function minorToInput(minor: Minor | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
