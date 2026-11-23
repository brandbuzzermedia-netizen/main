import { describe, expect, it } from "vitest";
import { autoPick, distanceKm, formatKm, funnel, MAX_ROUTE_STOPS, navigateUrl, nearestNext, planFieldImport, routeUrl, segmentOf } from "@/lib/field-sales";

// Bengaluru points
const HSR = { lat: 12.9116, lng: 77.6474 };
const KORA = { lat: 12.9352, lng: 77.6245 };
const INDIRA = { lat: 12.9784, lng: 77.6408 };
const WHITEFIELD = { lat: 12.9698, lng: 77.75 };

describe("distances", () => {
  it("measures Bengaluru distances sensibly", () => {
    expect(distanceKm(HSR, KORA)).toBeGreaterThan(3);
    expect(distanceKm(HSR, KORA)).toBeLessThan(4);
    expect(distanceKm(HSR, HSR)).toBe(0);
    expect(formatKm(0.42)).toBe("420 m");
    expect(formatKm(3.456)).toBe("3.5 km");
    expect(formatKm(14.2)).toBe("14 km");
  });
  it("orders stops nearest-next from my location; stops without coordinates go last", () => {
    const stops = [{ id: "w", ...WHITEFIELD }, { id: "x", lat: null, lng: null }, { id: "i", ...INDIRA }, { id: "k", ...KORA }];
    expect(nearestNext(HSR, stops).map((s) => s.id)).toEqual(["k", "i", "w", "x"]);
  });
});

describe("Google Maps links", () => {
  it("navigate opens directions to the coordinates", () => {
    const u = new URL(navigateUrl({ ...KORA, place_id: "ChIJabc" }));
    expect(u.origin + u.pathname).toBe("https://www.google.com/maps/dir/");
    expect(u.searchParams.get("api")).toBe("1");
    expect(u.searchParams.get("destination")).toBe("12.9352,77.6245");
    expect(u.searchParams.get("destination_place_id")).toBe("ChIJabc");
  });
  it("navigate falls back to the address when there are no coordinates", () => {
    const u = new URL(navigateUrl({ lat: null, lng: null, company_name: "Shine", address: "HSR Layout" }));
    expect(u.searchParams.get("destination")).toBe("Shine, HSR Layout");
  });
  it("a route has origin, the last stop as destination and the rest as waypoints, in order", () => {
    const u = new URL(routeUrl(HSR, [KORA, INDIRA, WHITEFIELD])!);
    expect(u.searchParams.get("origin")).toBe("12.9116,77.6474");
    expect(u.searchParams.get("destination")).toBe("12.9698,77.75");
    expect(u.searchParams.get("waypoints")).toBe("12.9352,77.6245|12.9784,77.6408");
    expect(u.searchParams.get("travelmode")).toBe("driving");
  });
  it("a route keeps at most 9 stops and works without my location", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ lat: 12.9 + i / 100, lng: 77.6 }));
    const u = new URL(routeUrl(null, many)!);
    expect(u.searchParams.get("origin")).toBeNull();
    expect(u.searchParams.get("waypoints")!.split("|")).toHaveLength(MAX_ROUTE_STOPS - 1);
    expect(routeUrl(HSR, [])).toBeNull();
    expect(new URL(routeUrl(HSR, [KORA])!).searchParams.get("waypoints")).toBeNull();
  });
});

describe("today's route auto-pick", () => {
  it("takes follow-ups due first, then the nearest To visit leads, up to 9", () => {
    const leads = [
      { id: "due", field_status: "interested", next_follow_up_on: "2026-11-23", ...WHITEFIELD },
      { id: "future", field_status: "demo_shown", next_follow_up_on: "2026-11-30", ...KORA },
      { id: "lost", field_status: "lost", next_follow_up_on: "2026-11-20", ...KORA },
      { id: "far", field_status: "to_visit", next_follow_up_on: null, ...INDIRA },
      { id: "near", field_status: "to_visit", next_follow_up_on: null, ...KORA },
      { id: "nopin", field_status: "to_visit", next_follow_up_on: null, lat: null, lng: null },
    ];
    expect(autoPick(leads, "2026-11-23", HSR).map((l) => l.id)).toEqual(["due", "near", "far"]);
    const lots = Array.from({ length: 15 }, (_, i) => ({ id: String(i), field_status: "to_visit", next_follow_up_on: null, lat: 12.9, lng: 77.6 + i / 100 }));
    expect(autoPick(lots, "2026-11-23", HSR)).toHaveLength(9);
  });
});

describe("week funnel", () => {
  it("counts visits, owners met, demos, interested and paid", () => {
    expect(funnel(["owner_absent", "demo_shown", "interested", "paid_advance", "not_interested"])).toEqual({ visits: 5, met: 4, demos: 3, interested: 2, paid: 1 });
  });
});

describe("bulk add", () => {
  it("reads a CSV, normalises phones, guesses segments and drops duplicates by phone", () => {
    const csv = "Business name,Owner,Phone,Area,Category,Lat,Lng\n" +
      "Shine Detailing,Ravi,98450 12345,HSR Layout,Ceramic coating,12.9116,77.6474\n" +
      "Shine Again,Ravi,+91 98450-12345,HSR,detailing,,\n" +
      "Anil Motors,Anil,08022223333,Koramangala,Pre-owned cars,,\n" +
      "No Phone Garage,Raj,,BTM,Garage,,\n";
    const p = planFieldImport(csv);
    expect(p.total).toBe(4);
    expect(p.duplicatesInFile).toBe(1);
    expect(p.invalid).toBe(1); // the row without a phone
    expect(p.rows.map((r) => r.company_name)).toEqual(["Shine Detailing", "Anil Motors"]);
    expect(p.rows[1].field_segment).toBe("used_car_dealer");
    expect(p.rows[0]).toMatchObject({ company_name: "Shine Detailing", full_name: "Ravi", phone_e164: "+919845012345", whatsapp_e164: "+919845012345", field_segment: "car_detailing", area: "HSR Layout", lat: 12.9116, lng: 77.6474 });
  });
  it("accepts rows pasted from a spreadsheet (tab-separated)", () => {
    const p = planFieldImport("Business\tPhone\tType\nCity Garage\t9988776655\tworkshop\n");
    expect(p.rows).toEqual([expect.objectContaining({ company_name: "City Garage", full_name: "City Garage", phone_e164: "+919988776655", field_segment: "garage", lat: null })]);
  });
  it("guesses segments from words", () => {
    expect(segmentOf("PPF studio")).toBe("car_detailing");
    expect(segmentOf("Used cars")).toBe("used_car_dealer");
    expect(segmentOf("Tyre and alignment")).toBe("garage");
    expect(segmentOf("Cafe")).toBe("other");
  });
});
