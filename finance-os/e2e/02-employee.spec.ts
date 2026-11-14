import { expect, test } from "@playwright/test";
import { EMPLOYEE_STATE, skipLoader } from "./helpers";

test.use({ storageState: EMPLOYEE_STATE });
test.beforeEach(async ({ page }) => skipLoader(page));

test("a sales rep sees only their own work and no finance", async ({ page }) => {
  await page.goto("/c/demo-gbs");
  await expect(page.locator("h1")).toContainText("Hello");
  const nav = page.locator("aside nav");
  await expect(nav).toContainText("Pipeline");
  for (const hidden of ["Finance", "Team", "Settings", "Reports"]) await expect(nav).not.toContainText(hidden);
  expect((await page.goto("/c/demo-gbs/finance"))?.status()).toBe(404);
  expect((await page.goto("/c/demo-gbs/settings"))?.status()).toBe(404);
});

test("a company member cannot open another company or the Command Centre", async ({ page }) => {
  expect((await page.goto("/c/demo-tan-o-fun"))?.status()).toBe(404);
  await page.goto("/group");
  await expect(page).not.toHaveURL(/\/group$/);
});

test("the rep's search does not reveal finance documents", async ({ page }) => {
  await page.goto("/c/demo-gbs/search?q=e2e-bill");
  await expect(page.getByText("e2e-bill.pdf")).toHaveCount(0);
});
