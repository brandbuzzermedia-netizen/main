// Number, money and date formatting shared by the report and the studio.
// Ported from the prototype helpers so the rendered report matches it exactly.

export type Num = number | null | undefined;

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const f0 = (n: Num) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
export const f1 = (n: Num) => (n == null ? "—" : (Math.round(n * 10) / 10).toLocaleString("en-US"));
export const f2 = (n: Num) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Compact thousands: 12900 -> "12.9K". */
export const K = (n: Num) => (n == null ? "—" : n >= 1000 ? Math.round(n / 100) / 10 + "K" : String(n));
export const INR = (n: Num) => (n == null ? "—" : "₹" + f2(n));
export const PCT = (n: Num, d = 1) => (n == null ? "—" : n.toFixed(d) + "%");
/** Signed whole number with a true minus sign: +49, −12. */
export const sgn = (n: Num) => (n == null ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + f0(Math.abs(n)));

/**
 * Dates are ISO calendar days ("2026-08-14"). They are parsed as UTC so the
 * server (PDF) and the browser (preview) agree whatever their time zones.
 */
export function parseDay(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}
export const fDay = (s: string) => {
  const d = parseDay(s);
  return d.d + " " + MONTHS[d.m].slice(0, 3);
};
export const fLong = (s: string) => {
  const d = parseDay(s);
  return d.d + " " + MONTHS[d.m] + " " + d.y;
};
export const fDate = (s: string) => fDay(s) + " " + parseDay(s).y;
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

// Colour helpers for the client palette and placeholder cover art.
export const hexA = (h: string) => {
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
};
export const toHex = (a: number[]) =>
  "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const mix = (a: string, b: string, t: number) => {
  const x = hexA(a), y = hexA(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
};

export const avg = <T,>(a: T[], f: (x: T) => Num) =>
  a.length ? a.reduce((s, x) => s + (f(x) || 0), 0) / a.length : null;
export const sum = <T,>(a: T[], f: (x: T) => Num) => a.reduce((s, x) => s + (f(x) || 0), 0);
