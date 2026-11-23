import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { expectHealthy, OWNER_STATE, skipLoader } from "./helpers";

/**
 * The Google-Maps-style finder against a stand-in Maps script (no real Google calls, no key spent).
 * Runs only when the dev server was started with NEXT_PUBLIC_GOOGLE_MAPS_KEY set (any value).
 */
test.skip(!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY, "needs NEXT_PUBLIC_GOOGLE_MAPS_KEY on the dev server");
test.use({ storageState: OWNER_STATE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  geolocation: { latitude: 12.9116, longitude: 77.6474, accuracy: 10 }, permissions: ["geolocation"] });
const run = Date.now() % 100000;
const STUB = `
  const place = (id, name, lat, lng, rating, n, phone) => ({ id, displayName: name, formattedAddress: name + ", HSR Layout, Bengaluru", location: { lat: () => lat, lng: () => lng },
    nationalPhoneNumber: phone, rating, userRatingCount: n, websiteURI: "https://" + id + ".example", primaryTypeDisplayName: "Car detailing service", businessStatus: "OPERATIONAL", googleMapsURI: "https://maps.google.com/?cid=" + id });
  class Base { constructor() {} addListener() {} setMap() {} }
  window.__searches = [];
  window.google = { maps: {
    Map: class extends Base { fitBounds() {} panTo() {} getBounds() { return null; } setCenter() {} setZoom() {} },
    Marker: class extends Base {}, InfoWindow: class extends Base {}, LatLngBounds: class { extend() {} getCenter() {} }, SymbolPath: { CIRCLE: 0 },
    importLibrary: async () => ({ Place: { searchByText: async (req) => { window.__searches.push(req); return { places: [
      place("pA${run}", "Gloss Garage ${run}", 12.912, 77.648, 4.7, 312, "098450 ${String(run).padStart(5, "0")}"),
      place("pB${run}", "Shine Studio ${run}", 12.92, 77.64, 4.1, 45, null) ] }; } } }) } };
  window.__dpMapsReady && window.__dpMapsReady();`;

test("find on Google Maps: search, see ratings, add one, add the rest from the selection bar", async ({ page }) => {
  await skipLoader(page);
  await page.route("https://maps.googleapis.com/maps/api/js**", (r) => r.fulfill({ contentType: "text/javascript", body: STUB }));
  await page.goto("/c/demo-gbs/leads");
  await page.getByRole("link", { name: "Find on Google Maps" }).click();
  await expectHealthy(page);
  await page.waitForLoadState("networkidle"); // the finder must be hydrated and the map ready
  await page.getByRole("button", { name: "Car detailing" }).first().click();
  await expect(page.getByText(`1. Gloss Garage ${run}`)).toBeVisible();
  await expect(page.getByText("4.7 ★")).toBeVisible();
  await expect(page.getByText("(312)")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __searches: { textQuery: string }[] }).__searches[0].textQuery)).toBe("Car detailing in Bengaluru");

  // Hide small shops with the reviews filter.
  await page.selectOption("select:near(:text('Reviews'))", "100");
  await expect(page.getByText(`Shine Studio ${run}`)).toHaveCount(0);
  await page.selectOption("select:near(:text('Reviews'))", "0");

  // One tap adds a lead (and puts it on the field list).
  await page.locator(`#res-0`).getByRole("button", { name: "Add lead" }).click();
  await expect(page.getByRole("status")).toContainText("Added 1 lead(s). They are on your field visit list.");
  await expect(page.locator(`#res-0`).getByText("Added")).toBeVisible();

  // Tick the other one and add it from the bottom bar.
  await page.getByLabel(`Select Shine Studio ${run}`).check();
  await page.getByRole("button", { name: "Add 1 as leads" }).click();
  await expect(page.locator("#res-1").getByText("Added")).toBeVisible();

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data } = await db.from("contacts").select("company_name, place_id, field_status, source, phone_e164, notes, lat").in("place_id", [`pA${run}`, `pB${run}`]).order("company_name");
  expect(data).toHaveLength(2);
  expect(data![0]).toMatchObject({ company_name: `Gloss Garage ${run}`, field_status: "to_visit", source: "Google Maps", phone_e164: `+9198450${String(run).padStart(5, "0")}`, lat: 12.912 });
  expect(data![0].notes).toContain("Google rating 4.7 (312 reviews)");

  // Searching again marks both as already added.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Car detailing" }).first().click();
  await expect(page.locator("#res-0").getByText("Added")).toBeVisible();
  await expect(page.locator("#res-1").getByText("Added")).toBeVisible();
});
