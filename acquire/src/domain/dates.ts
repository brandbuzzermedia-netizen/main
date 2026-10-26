/** Dates are stored in UTC and shown in the organization's (or recipient's) time zone. */

export function formatDate(iso: string | null | undefined, timeZone = "UTC"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined, timeZone = "UTC"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(iso));
}

/** Start of "today" in a time zone, as a UTC instant. */
export function startOfDay(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const elapsedMs = ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsedMs);
}

/** Value for <input type="datetime-local"> in a given time zone. */
export function toLocalInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Reads a datetime-local value as wall-clock time in `timeZone`; returns ISO UTC or null. */
export function fromLocalInput(value: string | null | undefined, timeZone: string): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const asUtc = new Date(`${value}:00Z`);
  // Offset of the zone at that moment: format the UTC guess in the zone and compare.
  const shown = new Date(`${toLocalInput(asUtc.toISOString(), timeZone)}:00Z`);
  const offset = shown.getTime() - asUtc.getTime();
  return new Date(asUtc.getTime() - offset).toISOString();
}
