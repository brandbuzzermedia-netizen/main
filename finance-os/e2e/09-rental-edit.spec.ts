import { expect, test } from "@playwright/test";
import { expectHealthy, OWNER_STATE, skipLoader } from "./helpers";

test.use({ storageState: OWNER_STATE });
test.beforeEach(async ({ page }) => skipLoader(page));

test("rental unit: set up unit, tenant and rent on one page, then edit and end the lease", async ({ page }) => {
  const name = `Shop ${Date.now() % 100000}`;
  await page.goto("/c/demo-gbs/rental/new");
  await page.fill("input[name=label]", name);
  await page.selectOption("select[name=use_type]", "commercial");
  await page.fill("textarea[name=address]", "12 MG Road, Bengaluru");
  await page.fill("input[name=tenant_name]", "Glow Salon LLP");
  await page.fill("input[name=tenant_phone]", "9876543210");
  await page.fill("input[name=rent]", "45000");
  await page.fill("input[name=deposit]", "135000");
  await page.fill("input[name=start_date]", "2026-04-01");
  await page.fill("input[name=escalation_pct]", "5");
  await page.fill("input[name=escalation_every_months]", "12");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expectHealthy(page);
  await expect(page.locator("input[name=tenant_phone]")).toHaveValue("+919876543210");
  await expect(page.locator("input[name=rent]")).toHaveValue("45000");

  // Edit the rent.
  await page.fill("input[name=rent]", "48000");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expect(page.locator("input[name=rent]")).toHaveValue("48000");

  // A bad value is explained, not crashed on.
  await page.fill("input[name=escalation_every_months]", "");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Escalation needs both");

  // The company's rental tab shows the unit with an Edit button.
  await page.goto("/c/demo-gbs/finance?tab=rental");
  await expect(page.getByRole("link", { name: `Edit ${name}` })).toBeVisible();

  // End the lease: the unit becomes vacant.
  await page.getByRole("link", { name: `Edit ${name}` }).click();
  await page.check("input[name=end_lease]");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Lease ended");
  await expect(page.locator("input[name=tenant_name]")).toHaveValue("");
});
