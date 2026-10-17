/** Calendar dates are ISO "YYYY-MM-DD" strings. "Today" is always Asia/Kolkata. */

export const BUSINESS_TZ = "Asia/Kolkata";

export class DateParseError extends Error {}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new DateParseError(`${d}-${m}-${y} is not a real date`);
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function year(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

/**
 * Parse dates as Indian exports write them. Day comes first, never month:
 * "17-10-2026" (Swipe's documented format), "17/10/2026", "17.10.26", "17 Oct 2026",
 * "17-Oct-2026", and ISO "2026-10-17".
 */
export function parseFlexibleDate(input: string): string {
  const s = input.trim();
  if (!s) throw new DateParseError("Date is empty");
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) return iso(year(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-,]*(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[m[2].toLowerCase().slice(0, m[2].toLowerCase().startsWith("sept") ? 4 : 3)];
    if (!month) throw new DateParseError(`"${input}" has an unknown month`);
    return iso(year(m[3]), month, Number(m[1]));
  }
  throw new DateParseError(`"${input}" is not a recognised date (use DD-MM-YYYY)`);
}

export function todayInBusinessTz(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}
