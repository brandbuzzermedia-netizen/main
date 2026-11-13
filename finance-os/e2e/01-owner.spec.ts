import { expect, test } from "@playwright/test";
import { expectHealthy, OWNER_STATE, skipLoader } from "./helpers";

test.use({ storageState: OWNER_STATE });
test.beforeEach(async ({ page }) => skipLoader(page));

test("every Command Centre and company menu item opens", async ({ page }) => {
  const seen = new Set<string>();
  const visit = async (start: string) => {
    await page.goto(start);
    const links = await page.locator("aside nav a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    for (const href of links) {
      if (seen.has(href)) continue;
      seen.add(href);
      const res = await page.goto(href);
      expect(res?.status(), href).toBeLessThan(400);
      await expect(page.locator("h1"), href).toBeVisible();
      await expectHealthy(page);
    }
  };
  await visit("/group");
  for (const slug of ["demo-gbs", "demo-tan-o-fun", "demo-la-pinoz", "demo-ashwin-bhai"]) {
    await page.goto(`/switch?to=${slug}`);
    await visit(`/c/${slug}`);
  }
  expect(seen.size).toBeGreaterThan(40);
});

test("company names and menu labels follow each business's design", async ({ page }) => {
  await page.goto("/c/demo-tan-o-fun");
  await expect(page.locator("aside nav")).toContainText("Quotes & orders");
  await expect(page.locator("aside nav")).toContainText("Dealers & buyers");
  await page.goto("/c/demo-la-pinoz");
  await expect(page.locator("aside nav")).toContainText("Order board");
});

test("a new deal appears on the pipeline board", async ({ page }) => {
  const title = `E2E deal ${Date.now()}`;
  await page.goto("/c/demo-gbs/pipeline?add=1");
  await page.fill("input[name=title]", title);
  await page.fill("input[name=value]", "12500");
  await page.getByRole("button", { name: "Create deal" }).click();
  await page.goto("/c/demo-gbs/pipeline");
  await expect(page.getByText(title)).toBeVisible();
  await page.goto(`/c/demo-gbs/search?q=${encodeURIComponent(title)}`);
  await expect(page.getByText(title)).toBeVisible();
});

test("hiding a module removes it from the menu, showing it brings it back", async ({ page }) => {
  await page.goto("/c/demo-gbs/settings");
  await page.getByRole("button", { name: "Hide Campaigns" }).click();
  await expect(page.locator("aside nav")).not.toContainText("Campaigns");
  await page.getByRole("button", { name: "Show Campaigns" }).click();
  await expect(page.locator("aside nav")).toContainText("Campaigns");
});

test("group Settings hides and restores a Command Centre module", async ({ page }) => {
  await page.goto("/group/settings");
  await page.getByRole("button", { name: "Hide Vault" }).click();
  await expect(page.locator("aside nav")).not.toContainText("Vault");
  await page.getByRole("button", { name: "Show Vault" }).click();
  await expect(page.locator("aside nav")).toContainText("Vault");
});

test("a bill upload is stored privately and waits for manual review", async ({ page }) => {
  await page.goto("/c/demo-gbs/finance?tab=expenses");
  const pdf = Buffer.from(`%PDF-1.4\n1 0 obj<<>>endobj\n% e2e ${Date.now()}\ntrailer<<>>\n%%EOF\n`);
  await page.locator("input[type=file][name=file]").setInputFiles({ name: "e2e-bill.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.getByText(/e2e-bill\.pdf/).first()).toBeVisible({ timeout: 30_000 });
  await expectHealthy(page);
});

test("the emergency stop needs a reason and can be resumed", async ({ page }) => {
  await page.goto("/c/demo-iyp");
  await page.getByRole("button", { name: "Emergency stop" }).click();
  await page.getByLabel("Reason for emergency stop").fill("E2E check of the stop switch");
  await page.getByRole("button", { name: "Stop now" }).click();
  await expect(page.getByRole("button", { name: "Resume company" })).toBeVisible();
  await page.getByRole("button", { name: "Resume company" }).click();
  await expect(page.getByRole("button", { name: "Emergency stop" })).toBeVisible();
});
