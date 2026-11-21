/**
 * Reporting periods. Dates are ISO "YYYY-MM-DD"; `end` is exclusive.
 * The Indian financial year runs 1 April to 31 March by default (fyStartMonth = 4) and is
 * configurable per group or entity. FY 2026-27 is 2026-04-01 .. 2027-03-31.
 */

export const PERIOD_KEYS = ["month", "last_month", "quarter", "fy"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export type Period = { key: PeriodKey; label: string; start: string; end: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number) => `${y}-${pad(m)}-01`;

/** First day of the month `offset` months from (y, m). Months are 1-12. */
function shift(y: number, m: number, offset: number): [number, number] {
  const idx = y * 12 + (m - 1) + offset;
  return [Math.floor(idx / 12), (idx % 12) + 1];
}

export function parsePeriodKey(value: string | string[] | undefined): PeriodKey {
  const v = Array.isArray(value) ? value[0] : value;
  return (PERIOD_KEYS as readonly string[]).includes(v ?? "") ? (v as PeriodKey) : "month";
}

/** The financial year containing `today`, e.g. { startYear: 2026, label: "FY 2026-27" }. */
export function financialYear(today: string, fyStartMonth = 4) {
  const [y, m] = today.split("-").map(Number);
  const startYear = m >= fyStartMonth ? y : y - 1;
  const [ey, em] = shift(startYear, fyStartMonth, 12);
  const label = fyStartMonth === 1 ? `FY ${startYear}` : `FY ${startYear}-${String(startYear + 1).slice(2)}`;
  return { startYear, start: ymd(startYear, fyStartMonth), end: ymd(ey, em), label };
}

/** Income-tax assessment year for the FY (India): FY 2026-27 → AY 2027-28. */
export function assessmentYearLabel(fyStartYear: number) {
  return `AY ${fyStartYear + 1}-${String(fyStartYear + 2).slice(2)}`;
}

export function periodRange(key: PeriodKey, today: string, fyStartMonth = 4): Period {
  const [y, m] = today.split("-").map(Number);
  const monthName = (yy: number, mm: number) =>
    new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(yy, mm - 1, 1)));
  switch (key) {
    case "month": {
      const [ny, nm] = shift(y, m, 1);
      return { key, label: monthName(y, m), start: ymd(y, m), end: ymd(ny, nm) };
    }
    case "last_month": {
      const [py, pm] = shift(y, m, -1);
      return { key, label: monthName(py, pm), start: ymd(py, pm), end: ymd(y, m) };
    }
    case "quarter": {
      // Quarters follow the financial year: Q1 is the first three months of the FY.
      const fy = financialYear(today, fyStartMonth);
      const monthsIn = (y * 12 + m) - (fy.startYear * 12 + fyStartMonth);
      const q = Math.floor(monthsIn / 3);
      const [qy, qm] = shift(fy.startYear, fyStartMonth, q * 3);
      const [ey, em] = shift(qy, qm, 3);
      return { key, label: `Q${q + 1} ${fy.label}`, start: ymd(qy, qm), end: ymd(ey, em) };
    }
    case "fy": {
      const fy = financialYear(today, fyStartMonth);
      return { key, label: fy.label, start: fy.start, end: fy.end };
    }
  }
}

export const PERIOD_TABS: { key: PeriodKey; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "quarter", label: "Quarter" },
  { key: "fy", label: "FY" },
];

/** Monday-start week containing `today`, end exclusive. */
export function weekRange(today: string) {
  const d = new Date(`${today}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  const start = new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
  const end = new Date(d.getTime() + (7 - dow) * 86_400_000).toISOString().slice(0, 10);
  return { start, end };
}
