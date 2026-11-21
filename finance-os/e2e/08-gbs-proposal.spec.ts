import { expect, test } from "@playwright/test";
import { expectHealthy, OWNER_STATE, skipLoader } from "./helpers";

test.use({ storageState: OWNER_STATE });
test.beforeEach(async ({ page }) => skipLoader(page));

test("GBS proposal: company details in, branded draft out, edit and open the document", async ({ page }) => {
  const company = `Bloom Salon ${Date.now() % 100000}`;
  await page.goto("/c/demo-gbs/proposals?brand=1");
  await page.fill("input[name=company]", company);
  await page.fill("input[name=industry]", "Salon and spa");
  await page.fill("input[name=city]", "Bengaluru");
  await page.check("input[name=svc_performance]");
  await page.fill("input[name=price_performance]", "25000");
  await page.check("input[name=svc_automation]");
  await page.fill("input[name=price_automation]", "40000");
  await page.getByRole("button", { name: "Research and draft" }).click();
  await expect(page).toHaveURL(/\/c\/demo-gbs\/proposals\/[0-9a-f-]{36}/);
  await expectHealthy(page);
  await expect(page.getByText("What research found")).toBeVisible();
  await expect(page.getByText(/First month/)).toContainText("65,000");

  // Edit a price: the amount follows.
  const prices = page.locator("textarea[name=pricing_rows]");
  await prices.fill((await prices.inputValue()).replace("| 25000 |", "| 30000 |"));
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expect(page.getByText(/First month/)).toContainText("70,000");

  // The print-ready document in the GBS format.
  const href = await page.getByRole("link", { name: "Open proposal (PDF)" }).getAttribute("href");
  await page.goto(href!);
  await expect(page.getByText("Proposal for")).toBeVisible();
  await expect(page.getByText(company).first()).toBeVisible();
  await expect(page.getByText("The Growth Opportunity").first()).toBeVisible();
  await expect(page.getByText("Commercials & Pricing")).toBeVisible();
  await expect(page.getByText("₹30,000/mo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();

  // Listed with the other proposals, as a draft.
  await page.goto("/c/demo-gbs/proposals");
  await expect(page.getByRole("link", { name: /Performance Marketing \+ Lead Automation proposal/ }).first()).toBeVisible();
});

test("GBS proposal: a service without a price is refused", async ({ page }) => {
  await page.goto("/c/demo-gbs/proposals?brand=1");
  await page.fill("input[name=company]", "No Price Co");
  await page.check("input[name=svc_seo]");
  await page.getByRole("button", { name: "Research and draft" }).click();
  await expect(page.getByRole("status")).toContainText("Enter a price for every service you chose.");
});
