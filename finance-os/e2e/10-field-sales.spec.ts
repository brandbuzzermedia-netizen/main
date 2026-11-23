import { expect, test } from "@playwright/test";
import { expectHealthy, OWNER_STATE, skipLoader } from "./helpers";

// A phone in HSR Layout, Bengaluru, with location allowed.
test.use({ storageState: OWNER_STATE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  geolocation: { latitude: 12.9116, longitude: 77.6474, accuracy: 15 }, permissions: ["geolocation"] });
test.beforeEach(async ({ page }) => skipLoader(page));

const run = Date.now() % 100000;
const phone = `98${String(run).padStart(5, "0")}123`;
const shop = `Shine Detailing ${run}`;

test("field sales: add at the shop, check in, advance paid hands off to delivery", async ({ page }) => {
  await page.goto("/c/demo-gbs/field");
  await expectHealthy(page);
  await expect(page.getByRole("heading", { name: "Today's route" })).toBeVisible();

  // Add a lead standing at the shop: the pin comes from the phone's location.
  await page.getByRole("link", { name: "+ Add" }).click();
  await page.getByRole("link", { name: /Full form/ }).click();
  await page.fill("input[name=company_name]", shop);
  await page.fill("input[name=owner_name]", "Ravi");
  await page.fill("input[name=phone]", phone);
  await page.selectOption("select[name=segment]", "car_detailing");
  await page.fill("input[name=area]", "HSR Layout");
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByText("Pin set: 12.91160, 77.64740")).toBeVisible();
  await page.getByRole("button", { name: "Add lead" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Lead added.");
  const leadUrl = page.url().split("?")[0];
  await expect(page.getByRole("link", { name: "Navigate" })).toHaveAttribute("href", /destination=12\.9116%2C77\.6474/);
  await expect(page.getByRole("link", { name: "Call" })).toHaveAttribute("href", `tel:+91${phone}`);

  // The same phone again opens the existing lead instead of a duplicate.
  await page.goto("/c/demo-gbs/field/leads/new");
  await page.fill("input[name=company_name]", "Duplicate shop");
  await page.fill("input[name=phone]", phone);
  await page.getByRole("button", { name: "Add lead" }).click();
  await expect(page.getByRole("status").first()).toContainText("already a lead");
  expect(page.url().split("?")[0]).toBe(leadUrl);

  // Check in: owner absent, back at 4 PM tomorrow.
  await page.getByRole("button", { name: "Check in here" }).click();
  await expect(page.getByText(/Location captured/)).toBeVisible();
  await page.getByText("Owner back at, amount, note").click();
  const tomorrow = new Date(Date.now() + 5.5 * 3600_000 + 86400_000).toISOString().slice(0, 10);
  await page.fill("input[name=owner_back_at]", `${tomorrow}T16:00`);
  await page.getByRole("button", { name: "Owner absent" }).click();
  await expect(page.getByRole("status").first()).toContainText("owner absent");
  await expect(page.getByText(/Owner back/).first()).toBeVisible();

  // Next visit: demo shown and interested in one go, then the advance.
  await page.getByRole("button", { name: "Check in here" }).click();
  await page.getByRole("button", { name: "Interested", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("interested");
  await page.getByRole("button", { name: "Check in here" }).click();
  await page.getByRole("button", { name: "Paid advance" }).click();
  await expect(page.getByRole("status").first()).toContainText("Enter the advance amount");
  // The check-in panel stays open for the amount.
  await page.getByRole("button", { name: "Add my location" }).click();
  await expect(page.getByText(/Location captured/)).toBeVisible();
  await page.getByText("Owner back at, amount, note").click();
  await page.fill("input[name=amount]", "7500");
  await page.getByRole("button", { name: "Paid advance" }).click();
  await expect(page.getByRole("status").first()).toContainText("Advance logged");
  await expect(page.getByText("Collected ₹7,500.00")).toBeVisible();

  // Handoff to the delivery team: due in 7 days, brand details and a logo.
  await page.getByRole("link", { name: /Open handoff/ }).click();
  await page.fill("input[name=brand_colours]", "#0B3D91 blue");
  await page.fill("textarea[name=services]", "Ceramic coating ₹25,000");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await page.setInputFiles("input[name=logo]", { name: "logo.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Saved.");
  await expect(page.getByAltText("Client logo")).toBeVisible();
  await page.goto("/c/demo-gbs/field/handoffs");
  await expect(page.getByRole("link", { name: new RegExp(shop) })).toBeVisible();
});

test("field sales: bulk add skips duplicates, near me sorts by distance, today's route opens Google Maps", async ({ page }) => {
  const p2 = `97${String(run).padStart(5, "0")}456`;
  await page.goto("/c/demo-gbs/field/import");
  await page.fill("textarea[name=text]", `Business name,Owner,Phone,Area,Segment,Lat,Lng\nKoramangala Motors ${run},Anil,${p2},Koramangala,Used cars,12.9352,77.6245\nRepeat ${run},X,${p2},BTM,Garage,,\n`);
  await page.getByRole("button", { name: "Add leads" }).click();
  await expect(page.getByRole("status").first()).toContainText("Added 1 lead(s).");
  await expect(page.getByRole("status").first()).toContainText("1 duplicate row(s)");

  await page.goto(`/c/demo-gbs/field/leads?q=${run}`);
  await page.getByRole("button", { name: "Near me" }).click();
  await expect(page.getByText("Sorted by distance from you.")).toBeVisible();
  await expect(page.getByText(/^\d+(\.\d)? km$/).first()).toBeVisible();

  await page.goto("/c/demo-gbs/field");
  await page.getByRole("button", { name: "Auto-pick" }).click();
  const route = page.getByRole("link", { name: /Open route in Google Maps/ });
  await expect(route).toHaveAttribute("href", /origin=12\.9116%2C77\.6474/); // origin appears once the phone's location is read
  const href = (await route.getAttribute("href"))!;
  expect(href).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&origin=12\.9116%2C77\.6474&destination=/);
  await page.reload();
  await expect(page.getByRole("link", { name: /Open route in Google Maps/ })).toBeVisible(); // the route is saved for today

  // Without a Maps key the map falls back to the list with Google Maps links.
  await page.goto("/c/demo-gbs/field/map");
  await expect(page.getByText(/Map view needs a Google Maps key|Google Maps did not load/)).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`Navigate to Koramangala Motors ${run}`) })).toHaveAttribute("href", /destination=12\.9352%2C77\.6245/);
});
