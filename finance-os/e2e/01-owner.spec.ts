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
  await expect(page).not.toHaveURL(/add=1/); // the save redirects back to the board when done
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

test("receivables live under the company's own address, and old links still work", async ({ page }) => {
  for (const p of ["", "/clients", "/invoices", "/payments", "/tasks", "/integrations", "/invoices/new", "/payments/new", "/invoices/import", "/payments/import"]) {
    const res = await page.goto(`/c/demo-gbs/receivables${p}`);
    expect(res?.status(), p).toBe(200);
    await expectHealthy(page);
  }
  await page.goto("/c/demo-gbs/receivables/invoices");
  const first = page.locator('a[href^="/c/demo-gbs/receivables/invoices/"]').filter({ hasText: /\S/ }).first();
  const href = await first.getAttribute("href");
  expect(href).toBeTruthy();
  expect((await page.goto(href!))?.status()).toBe(200);
  await expectHealthy(page);

  await page.goto("/switch?to=demo-gbs");
  await page.goto("/invoices");
  await expect(page).toHaveURL(/\/c\/demo-gbs\/receivables\/invoices$/);
  // A company the user is not a member of is not found, even by its address.
  expect((await page.goto("/c/someone-else/receivables"))?.status()).toBe(404);
});

test("a client created in receivables opens on its own page", async ({ page }) => {
  const code = `E2E${Date.now() % 100000}`;
  await page.goto("/c/demo-gbs/receivables/clients/new");
  await page.fill("input[name=client_code]", code);
  await page.fill("input[name=legal_name]", `E2E Client ${code}`);
  await page.locator("form button[type=submit]").last().click();
  await expect(page).toHaveURL(/\/c\/demo-gbs\/receivables\/clients\/[0-9a-f-]{36}$/);
  await expect(page.getByText(`E2E Client ${code}`).first()).toBeVisible();
});

test("outreach has every channel, and a WhatsApp message can be logged", async ({ page }) => {
  await page.goto("/c/demo-gbs/outreach");
  const tabs = page.getByRole("navigation", { name: "Outreach channels" });
  for (const ch of ["Email", "WhatsApp", "LinkedIn", "Cold calls", "Facebook", "Instagram", "Meta ads"]) await expect(tabs.getByRole("link", { name: ch })).toBeVisible();
  for (const ch of ["email", "linkedin", "calls", "facebook", "instagram", "meta-ads"]) {
    expect((await page.goto(`/c/demo-gbs/outreach?ch=${ch}`))?.status(), ch).toBe(200);
    await expectHealthy(page);
  }
  // A lead to message (the demo data has none).
  await page.goto("/c/demo-gbs/leads?add=1");
  await page.fill("input[name=full_name]", `E2E Lead ${Date.now()}`);
  await page.locator("form button[type=submit]").last().click();
  await page.waitForLoadState("networkidle");
  await page.goto("/c/demo-gbs/outreach?ch=whatsapp");
  const before = Number(await page.locator("text=Messages logged").locator("xpath=following-sibling::div[1]").textContent());
  await page.selectOption("select[name=outcome]", "positive");
  await page.getByRole("button", { name: "Log message" }).click();
  await expect(page).toHaveURL(/ch=whatsapp/);
  await expect(page.locator("text=Messages logged").locator("xpath=following-sibling::div[1]")).toHaveText(String(before + 1));
  // Every company has the same channels.
  await page.goto("/c/demo-la-pinoz/outreach?ch=instagram");
  await expect(page.getByRole("navigation", { name: "Outreach channels" }).getByRole("link", { name: "Meta ads" })).toBeVisible();
});

test("growth systems: LinkedIn steps and posts, Reddit keywords, AI calls, and invoicing a won deal", async ({ page }) => {
  // LinkedIn: sequences, today's tasks and a post that publishes only after approval.
  await page.goto("/c/demo-gbs/outreach?ch=linkedin");
  for (const t of ["Today's tasks", "Posts", "Campaigns", "Accounts today"]) await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "+ LinkedIn engagement" }).click();
  await expect(page.getByRole("status")).toContainText("LinkedIn engagement");
  await page.fill("textarea[name=body]", `E2E post ${Date.now()}`);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("publishes after approval");
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect(page.getByText("Approved, waiting to publish").first()).toBeVisible();

  // Reddit keywords.
  await page.goto("/c/demo-gbs/outreach?ch=reddit");
  await page.fill("input[name=keyword]", `agency ${Date.now() % 10000}`);
  await page.getByRole("button", { name: "Watch" }).click();
  await expect(page.getByRole("button", { name: "Remove" }).first()).toBeVisible();

  // AI calls tab explains the disclosure rule.
  await page.goto("/c/demo-gbs/outreach?ch=ai-calls");
  await expect(page.getByText("Every call says it is an AI assistant at the start")).toBeVisible();

  // Won deal → invoice.
  await page.goto("/c/demo-gbs/pipeline?add=1");
  const title = `E2E won ${Date.now()}`;
  await page.fill("input[name=title]", title);
  await page.fill("input[name=account_name]", `E2E Buyer ${Date.now() % 10000}`);
  await page.fill("input[name=value]", "50000");
  await page.getByRole("button", { name: "Create deal" }).click();
  await expect(page).not.toHaveURL(/add=1/); // the save redirects back to the board when done
  await page.goto("/c/demo-gbs/pipeline");
  await page.getByText(title).click();
  await page.selectOption("select[name=stage_id]", { label: "Won" });
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.getByRole("button", { name: "Move" }).click()]);
  await page.waitForLoadState("networkidle");
  await page.goto("/c/demo-gbs/pipeline?view=closed");
  await page.getByText(title).click();
  await page.getByRole("button", { name: "Create invoice and payment link" }).click();
  await expect(page).toHaveURL(/\/receivables\/invoices\/[0-9a-f-]{36}/);
  await expect(page.locator("body")).toContainText("59,000");
});

test("payment rules: an owner sets when work stops for late payers", async ({ page }) => {
  await page.goto("/c/demo-gbs/settings");
  await page.fill("input[name=warn_after_days]", "5");
  await page.fill("input[name=hold_after_days]", "20");
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Payment rules saved." })).toBeVisible();
  await page.goto("/c/demo-gbs/finance");
  await expect(page.getByText("work stops at 20 days")).toBeVisible();
  await page.goto("/c/demo-gbs/settings");
  await page.fill("input[name=warn_after_days]", "3");
  await page.fill("input[name=hold_after_days]", "15");
  await page.getByRole("button", { name: "Save rules" }).click();
});

test("campaigns can be paused and resumed inside a company's Outreach", async ({ page }) => {
  await page.goto("/c/demo-gbs/outreach?ch=email");
  await page.getByRole("button", { name: "+ Email outreach" }).click();
  await page.goto("/c/demo-gbs/outreach");
  const row = page.locator("div").filter({ has: page.getByRole("link", { name: "Email outreach" }) }).filter({ has: page.getByRole("button", { name: /Pause|Resume|Start/ }) }).last();
  await row.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("status")).toContainText("Campaign paused");
  await expect(page.getByText("Paused", { exact: true }).first()).toBeVisible();
  await page.locator("div").filter({ has: page.getByRole("link", { name: "Email outreach" }) }).filter({ has: page.getByRole("button", { name: "Resume" }) }).last().getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("status")).toContainText("Campaign running");
  await page.getByRole("link", { name: "Email outreach" }).first().click();
  await expect(page.getByText("Leads in this campaign")).toBeVisible();
});

test("sending accounts: add a mailbox with a platform limit; pause all campaigns", async ({ page }) => {
  await page.goto("/c/demo-gbs/settings#accounts");
  const form = page.locator("#accounts form:has(select[name=channel])");
  await form.locator("select[name=channel]").selectOption("linkedin");
  await form.locator("select[name=kind]").selectOption("page");
  await form.locator("input[name=label]").fill("Too many");
  await form.locator("input[name=address]").fill("https://www.linkedin.com/company/x");
  await form.locator("input[name=daily_limit]").fill("100");
  await form.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("status").filter({ hasText: "at most 25 a day" })).toBeVisible();
  const f2 = page.locator("#accounts form:has(select[name=channel])");
  await f2.locator("select[name=channel]").selectOption("email");
  await f2.locator("select[name=kind]").selectOption("mailbox");
  await f2.locator("input[name=label]").fill(`Sales mailbox ${Date.now() % 1000}`);
  await f2.locator("input[name=address]").fill("sales2@example.test");
  await f2.locator("input[name=daily_limit]").fill("50");
  await f2.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Account added." })).toBeVisible();
  await page.goto("/c/demo-gbs/outreach?ch=email");
  await expect(page.getByText("Accounts today")).toBeVisible();
  await expect(page.getByText("warming up").first()).toBeVisible();
  await page.goto("/c/demo-gbs/outreach");
  await page.getByRole("button", { name: "Pause all campaigns" }).click();
  await expect(page.getByRole("status")).toContainText("All campaigns paused");
  await page.getByRole("button", { name: "Resume all" }).click();
  await page.goto("/c/demo-gbs/outreach?ch=twitter");
  await expect(page.getByText("No bulk or unsolicited automated DMs or mentions")).toBeVisible();
});
