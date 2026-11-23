import { parseCsv } from "@/integrations/swipe/csv";
import { toE164 } from "@/lib/lead-import";

/** Field Sales: statuses, segments, distances, route links and CSV import. Pure functions, no I/O. */

export const FIELD_STATUSES = ["to_visit", "owner_absent", "demo_shown", "interested", "advance_paid", "delivered", "final_paid", "lost"] as const;
export type FieldStatus = (typeof FIELD_STATUSES)[number];
export const STATUS_LABEL: Record<FieldStatus, string> = {
  to_visit: "To visit", owner_absent: "Owner absent", demo_shown: "Demo shown", interested: "Interested",
  advance_paid: "Advance paid", delivered: "Delivered", final_paid: "Final paid", lost: "Lost",
};
/** Pin and chip colours, one per status. */
export const STATUS_COLOUR: Record<FieldStatus, string> = {
  to_visit: "#2563EB", owner_absent: "#D97706", demo_shown: "#7C3AED", interested: "#DB2777",
  advance_paid: "#059669", delivered: "#0D9488", final_paid: "#15803D", lost: "#6B7280",
};

export const SEGMENTS = ["car_detailing", "used_car_dealer", "garage", "other"] as const;
export type Segment = (typeof SEGMENTS)[number];
export const SEGMENT_LABEL: Record<Segment, string> = { car_detailing: "Car detailing", used_car_dealer: "Used-car dealer", garage: "Garage", other: "Other" };

export const SOURCES = ["Walk-in", "Referral", "Google Maps", "Other"] as const;

export const OUTCOMES = ["owner_absent", "demo_shown", "interested", "paid_advance", "not_interested"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const OUTCOME_LABEL: Record<Outcome, string> = { owner_absent: "Owner absent", demo_shown: "Demo shown", interested: "Interested", paid_advance: "Paid advance", not_interested: "Not interested" };

export type Point = { lat: number; lng: number };
export const hasPoint = (p: { lat: number | string | null; lng: number | string | null }): boolean => p.lat !== null && p.lng !== null && p.lat !== "" && p.lng !== "";
export const toPoint = (p: { lat: number | string | null; lng: number | string | null }): Point | null => (hasPoint(p) ? { lat: Number(p.lat), lng: Number(p.lng) } : null);

/** Distance in kilometres along the earth's surface (haversine). */
export function distanceKm(a: Point, b: Point): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export const formatKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`);

/** Sorts stops nearest-next: start at `from`, always go to the closest stop not yet visited. Stops without coordinates go last, in order. */
export function nearestNext<T extends { lat: number | string | null; lng: number | string | null }>(from: Point | null, stops: T[]): T[] {
  const located = stops.filter(hasPoint);
  const rest = stops.filter((s) => !hasPoint(s));
  const out: T[] = [];
  let here = from ?? (located[0] ? toPoint(located[0]) : null);
  const left = [...located];
  while (left.length && here) {
    let best = 0, bestD = Infinity;
    left.forEach((s, i) => { const d = distanceKm(here!, toPoint(s)!); if (d < bestD) { bestD = d; best = i; } });
    const [next] = left.splice(best, 1);
    out.push(next);
    here = toPoint(next);
  }
  return [...out, ...rest];
}

export const MAX_ROUTE_STOPS = 9;
const ll = (p: Point) => `${Number(p.lat.toFixed(6))},${Number(p.lng.toFixed(6))}`;

/** Google Maps directions to one place (opens the Maps app on phones). Falls back to an address search when there are no coordinates. */
export function navigateUrl(lead: { lat: number | string | null; lng: number | string | null; address?: string | null; company_name?: string | null; place_id?: string | null }): string {
  const p = toPoint(lead);
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("destination", p ? ll(p) : [lead.company_name, lead.address].filter(Boolean).join(", ") || "Bengaluru");
  if (lead.place_id) u.searchParams.set("destination_place_id", lead.place_id);
  u.searchParams.set("travelmode", "driving");
  return u.toString();
}

/** One Google Maps directions link through up to 9 stops in the given order: the last stop is the destination, the others are waypoints. */
export function routeUrl(from: Point | null, stops: Point[]): string | null {
  const s = stops.slice(0, MAX_ROUTE_STOPS);
  if (!s.length) return null;
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  if (from) u.searchParams.set("origin", ll(from));
  u.searchParams.set("destination", ll(s[s.length - 1]));
  if (s.length > 1) u.searchParams.set("waypoints", s.slice(0, -1).map(ll).join("|"));
  u.searchParams.set("travelmode", "driving");
  return u.toString();
}

/** Plain Google Maps link that shows a point (used where there is no Maps key). */
export const placeUrl = (p: Point) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ll(p))}`;

/** Auto-pick for today's route: follow-ups due today or earlier first, then the nearest "To visit" leads, up to 9. */
export function autoPick<T extends { id: string; field_status: string | null; next_follow_up_on: string | null; lat: number | string | null; lng: number | string | null }>(leads: T[], today: string, from: Point | null): T[] {
  const due = leads.filter((l) => l.field_status !== "lost" && l.next_follow_up_on && l.next_follow_up_on <= today && hasPoint(l))
    .sort((a, b) => (a.next_follow_up_on! < b.next_follow_up_on! ? -1 : 1));
  const picked = due.slice(0, MAX_ROUTE_STOPS);
  const ids = new Set(picked.map((l) => l.id));
  let toVisit = leads.filter((l) => l.field_status === "to_visit" && !ids.has(l.id) && hasPoint(l));
  if (from) toVisit = toVisit.sort((a, b) => distanceKm(from, toPoint(a)!) - distanceKm(from, toPoint(b)!));
  return [...picked, ...toVisit].slice(0, MAX_ROUTE_STOPS);
}

/** Week funnel from visit outcomes: visits -> demos -> interested -> paid. */
export function funnel(outcomes: string[]) {
  const visits = outcomes.length;
  const met = outcomes.filter((o) => o !== "owner_absent").length;
  const demos = outcomes.filter((o) => o === "demo_shown" || o === "interested" || o === "paid_advance").length;
  const interested = outcomes.filter((o) => o === "interested" || o === "paid_advance").length;
  const paid = outcomes.filter((o) => o === "paid_advance").length;
  return { visits, met, demos, interested, paid };
}

// ---- Bulk add ----

const SYN: Record<string, string[]> = {
  company_name: ["business", "business name", "company", "company name", "name of business", "shop", "shop name", "title", "name"],
  full_name: ["owner", "owner name", "contact", "contact name", "person"],
  phone: ["phone", "phone number", "mobile", "mobile number", "contact number", "number"],
  whatsapp: ["whatsapp", "whatsapp number", "wa"],
  segment: ["segment", "category", "type"],
  address: ["address", "full address", "location"],
  area: ["area", "locality", "neighbourhood", "neighborhood"],
  lat: ["lat", "latitude"],
  lng: ["lng", "lon", "long", "longitude"],
  source: ["source"],
  notes: ["notes", "note", "remarks"],
};
type Col = keyof typeof SYN;
export type FieldImportRow = { company_name: string; full_name: string; phone_e164: string | null; whatsapp_e164: string | null; field_segment: Segment;
  address: string | null; area: string | null; lat: number | null; lng: number | null; source: string; notes: string | null };
export type FieldImportPlan = { rows: FieldImportRow[]; total: number; invalid: number; duplicatesInFile: number; mapped: Partial<Record<Col, string>> };

export function segmentOf(raw: string): Segment {
  const s = raw.toLowerCase();
  if (/detail|ceramic|ppf|coating|wash/.test(s)) return "car_detailing";
  if (/used|pre.?owned|second.?hand|dealer/.test(s)) return "used_car_dealer";
  if (/garage|workshop|service|mechanic|repair|tyre|tire/.test(s)) return "garage";
  return "other";
}

/**
 * Pasted rows or a CSV with a header row. A row needs a business name and a valid phone.
 * Duplicates within the file are dropped by phone; duplicates already in the OS are checked by the caller.
 * Tab-separated text (pasted from a spreadsheet) works too.
 */
export function planFieldImport(text: string, maxRows = 2000): FieldImportPlan {
  const tsv = text.includes("\t") && !text.split("\n")[0].includes(",");
  const all = (tsv ? text.split(/\r?\n/).map((l) => l.split("\t")) : parseCsv(text)).filter((r) => r.some((c) => c.trim() !== ""));
  const [header = [], ...body] = all;
  const idx: Partial<Record<Col, number>> = {};
  const mapped: Partial<Record<Col, string>> = {};
  header.forEach((h, i) => {
    const n = h.trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");
    const c = (Object.keys(SYN) as Col[]).find((k) => idx[k] === undefined && SYN[k].includes(n));
    if (c) { idx[c] = i; mapped[c] = h.trim(); }
  });
  const get = (r: string[], c: Col) => (idx[c] === undefined ? "" : (r[idx[c]!] ?? "").trim());
  const seen = new Set<string>();
  const rows: FieldImportRow[] = [];
  let invalid = 0, dup = 0;
  for (const r of body.slice(0, maxRows)) {
    const company = get(r, "company_name").slice(0, 200);
    const phone = toE164(get(r, "phone")) ?? toE164(get(r, "whatsapp"));
    if (!company || !phone) { invalid++; continue; }
    if (seen.has(phone)) { dup++; continue; }
    seen.add(phone);
    const lat = Number(get(r, "lat")), lng = Number(get(r, "lng"));
    const ok = get(r, "lat") !== "" && get(r, "lng") !== "" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const src = get(r, "source");
    rows.push({
      company_name: company, full_name: (get(r, "full_name") || company).slice(0, 200), phone_e164: phone, whatsapp_e164: toE164(get(r, "whatsapp")) ?? phone,
      field_segment: segmentOf(get(r, "segment") || company), address: get(r, "address").slice(0, 500) || null, area: get(r, "area").slice(0, 120) || null,
      lat: ok ? Number(lat.toFixed(6)) : null, lng: ok ? Number(lng.toFixed(6)) : null,
      source: (SOURCES as readonly string[]).find((s) => s.toLowerCase() === src.toLowerCase()) ?? (src ? "Other" : "Other"), notes: get(r, "notes").slice(0, 4000) || null,
    });
  }
  return { rows, total: Math.min(body.length, maxRows), invalid, duplicatesInFile: dup, mapped };
}
