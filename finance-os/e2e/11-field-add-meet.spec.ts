import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { expectHealthy, OWNER_STATE, skipLoader } from "./helpers";

test.use({ storageState: OWNER_STATE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  geolocation: { latitude: 12.9352, longitude: 77.6245, accuracy: 10 }, permissions: ["geolocation"] });
test.beforeEach(async ({ page }) => skipLoader(page));
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now() % 100000;

test("add options: hub, quick add with location, Google Maps link, from your leads, area search without a key", async ({ page }) => {
  await page.goto("/c/demo-gbs/field/add");
  await expectHealthy(page);
  for (const name of ["Quick add", "Full form", "Search Google Maps", "Paste or upload a list", "From your leads"]) await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();

  // Quick add: name, phone, segment, one tap; the pin is where you stand.
  await page.getByRole("link", { name: /Quick add/ }).click();
  await page.fill("input[name=company_name]", `Quick Garage ${run}`);
  await page.fill("input[name=phone]", `96${String(run).padStart(5, "0")}321`);
  await page.getByRole("radio", { name: "Garage" }).click();
  await page.getByRole("button", { name: "Save here" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Lead added.");
  await expect(page.getByRole("link", { name: "Navigate" })).toHaveAttribute("href", /destination=12\.9352%2C77\.6245/);

  // Full form: a Google Maps link fills the name and the pin.
  await page.goto("/c/demo-gbs/field/leads/new");
  await page.fill("input[aria-label='Google Maps link']", `https://www.google.com/maps/place/Linked+Detailing+${run}/@12.95,77.6,15z/data=!3d12.9401!4d77.6102`);
  await page.getByRole("button", { name: "Fill" }).click();
  await expect(page.getByText("Pin set: 12.94010, 77.61020")).toBeVisible();
  await expect(page.locator("input[name=company_name]")).toHaveValue(`Linked Detailing ${run}`);
  await page.fill("input[aria-label='Google Maps link']", "https://example.com/not-maps");
  await page.getByRole("button", { name: "Fill" }).click();
  await expect(page.getByText("Paste a Google Maps link")).toBeVisible();

  // From your leads: an outreach lead joins the field list.
  const db = admin();
  const { data: org } = await db.from("organizations").select("id").eq("slug", "demo-gbs").single();
  await db.from("contacts").insert({ organization_id: org!.id, full_name: `Apollo Owner ${run}`, company_name: `Apollo Garage ${run}`, source: "Apollo" });
  await page.goto(`/c/demo-gbs/field/from-leads?q=Apollo Garage ${run}`);
  await page.getByRole("checkbox").first().check();
  await page.selectOption("select[name=segment]", "garage");
  await page.getByRole("button", { name: "Add ticked leads to field list" }).click();
  await expect(page.getByRole("status").first()).toHaveText("1 lead(s) added to your field list.");
  const { data: joined } = await db.from("contacts").select("field_status, field_segment").eq("company_name", `Apollo Garage ${run}`).single();
  expect(joined).toEqual({ field_status: "to_visit", field_segment: "garage" });

  // Area search explains it needs the Maps key when there is none.
  await page.goto("/c/demo-gbs/field/search");
  await expect(page.getByText(/Google Maps is not switched on yet|places for/)).toBeVisible();
});

test("meetings: booked in the OS, with Add to Google Calendar when Google is not connected", async ({ page }) => {
  await page.goto("/c/demo-gbs/field/quick");
  await page.fill("input[name=company_name]", `Meet Detailing ${run}`);
  await page.fill("input[name=phone]", `95${String(run).padStart(5, "0")}654`);
  await page.getByRole("button", { name: "Save here" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Lead added.");
  const tomorrow = new Date(Date.now() + 5.5 * 3600_000 + 86400_000).toISOString().slice(0, 10);
  await page.fill("input[name=date]", tomorrow);
  await page.fill("input[name=time]", "15:30");
  await page.fill("input[name=email]", "owner@meet-detailing.in");
  await page.getByRole("button", { name: "Book meeting" }).click();
  await expect(page.getByRole("status").first()).toContainText("Meeting saved in the OS");
  await expect(page.getByText(`Demo: Meet Detailing ${run}`)).toBeVisible();
  const add = page.getByRole("link", { name: "Add to Google Calendar" });
  await expect(add).toHaveAttribute("href", /calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
  await expect(add).toHaveAttribute("href", /add=owner%40meet-detailing\.in/);
  await expect(add).toHaveAttribute("href", new RegExp(`dates=${tomorrow.replace(/-/g, "")}T100000Z`));
  await expect(page.locator("input[name=next_follow_up_on]")).toHaveValue(tomorrow);
});
