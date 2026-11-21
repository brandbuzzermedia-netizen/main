import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { EMPLOYEE, EMPLOYEE_STATE, OWNER_STATE } from "./helpers";

/** Congratulations with celebration, the super admin console, and the admin's employee view. */
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const noLoader = (page: import("@playwright/test").Page) => page.addInitScript(() => {
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
});
const run = Date.now() % 100000;

test.describe.serial("congratulations", () => {
  test("an admin congratulates a sales rep from Team & targets", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: OWNER_STATE })).newPage();
    await noLoader(page);
    await page.addInitScript(() => { (window as Window & { __dpNoCelebrate?: boolean }).__dpNoCelebrate = true; });
    await page.goto("/c/demo-gbs/team");
    const card = page.locator("article").filter({ hasText: /Demo Sales Rep|e2e-rep/ }).first();
    await card.getByRole("button", { name: "Congratulate" }).click();
    await card.getByLabel("Message").fill(`Brilliant week ${run}`);
    await card.getByRole("button", { name: "Send" }).click();
    await expect(card).toContainText("Congratulated");
  });

  test("the rep gets a celebration once, then it is gone", async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: EMPLOYEE_STATE })).newPage();
    await noLoader(page);
    await page.goto("/c/demo-gbs");
    const dlg = page.getByRole("dialog", { name: "Congratulations" });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText("Congratulations,");
    await expect(dlg).toContainText(`Brilliant week ${run}`);
    const saved = page.waitForResponse((r) => r.request().method() === "POST");
    await dlg.getByRole("button", { name: "Thank you" }).click();
    await saved;
    await page.reload();
    await page.waitForTimeout(1200);
    await expect(page.getByRole("dialog", { name: "Congratulations" })).toBeHidden();
  });
});

test("super admin console: access table, role change and bulk access", async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: OWNER_STATE })).newPage();
  await noLoader(page);
  await page.addInitScript(() => { (window as Window & { __dpNoCelebrate?: boolean }).__dpNoCelebrate = true; });
  await page.goto("/group");
  await expect(page.locator("aside nav")).toContainText("Admin console");
  await expect(page.locator(".dp-me-text")).toContainText("Super admin");
  await page.goto("/group/admin");
  await expect(page.locator("h1")).toContainText("Admin console");
  const cell = page.getByLabel(/in Tan O' Fun$/).first();
  await expect(cell).toBeVisible();
  // Bulk access: an existing user gets two companies at once.
  await page.fill("input[name=email]", EMPLOYEE);
  await page.selectOption("select[name=role]", "staff");
  await page.locator("label").filter({ hasText: /^Tan O' Fun$/ }).locator("input").check();
  await page.getByRole("button", { name: "Give access" }).click();
  await expect(page.getByRole("status")).toContainText(/now has access|problems/);
  // Change that role from the table.
  const repCell = page.locator("tr").filter({ hasText: EMPLOYEE }).getByLabel(/in Tan O' Fun$/);
  await repCell.selectOption("sales_rep");
  await expect(page.locator("tr").filter({ hasText: EMPLOYEE }).getByText("Saved").first()).toBeVisible();
  const db = admin();
  const { data: org } = await db.from("organizations").select("id").eq("slug", "demo-tan-o-fun").single();
  const { data: u } = await db.from("users").select("id").eq("email", EMPLOYEE).single();
  expect((await db.from("memberships").select("role").eq("organization_id", org!.id).eq("user_id", u!.id).single()).data?.role).toBe("sales_rep");
  // Put things back: the demo rep only belongs to Get Bee Seen (other tests rely on it).
  await db.from("memberships").delete().eq("organization_id", org!.id).eq("user_id", u!.id);
  await db.from("invitations").delete().eq("organization_id", org!.id).eq("email", EMPLOYEE);
});

test("admin employee view: see a rep's home, read-only", async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: OWNER_STATE })).newPage();
  await noLoader(page);
  await page.addInitScript(() => { (window as Window & { __dpNoCelebrate?: boolean }).__dpNoCelebrate = true; });
  await page.goto("/c/demo-gbs/team");
  await page.locator("article").filter({ hasText: /Demo Sales Rep|e2e-rep/ }).first().getByRole("link", { name: "Employee view" }).click();
  await expect(page.getByRole("status")).toContainText("Employee view of");
  await expect(page.getByText("My target this month")).toBeVisible();
  await expect(page.getByText("Leads to call")).toBeVisible();
  await page.getByRole("link", { name: "Exit preview ×" }).click();
  await expect(page.locator("h1")).toContainText(/Good (morning|afternoon|evening)/);
});
