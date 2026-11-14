import { expect, test } from "@playwright/test";
import { EMPLOYEE, OWNER_STATE, PASSWORD, signIn, skipLoader } from "./helpers";
import { totp } from "./totp";

async function createUser(email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const r = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  expect(r.ok || r.status === 422).toBeTruthy();
}

test.describe("people and access", () => {
  test.use({ storageState: OWNER_STATE });
  test.beforeEach(async ({ page }) => skipLoader(page));

  test("an invitation becomes a membership on first confirmed sign-in", async ({ page, browser }) => {
    const email = `invitee-${Date.now()}@example.test`;
    await page.goto("/c/demo-gbs/team?add=1");
    await page.fill("input[name=email]", email);
    await page.selectOption("select[name=role]", "staff");
    await page.getByRole("button", { name: "Add member" }).click();
    await expect(page.getByText(/is invited/)).toBeVisible();
    await page.goto("/c/demo-gbs/team");
    await expect(page.getByText(email)).toBeVisible();

    await createUser(email); // the person confirms their email (here: created already confirmed)
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const invitee = await ctx.newPage();
    await skipLoader(invitee);
    await signIn(invitee, email);
    await invitee.goto("/c/demo-gbs");
    await expect(invitee.locator("aside")).toBeVisible();
    await invitee.goto("/c/demo-gbs/finance");
    await expect(invitee.getByText("Open ledger & approvals")).toHaveCount(0); // staff see no company figures
    await ctx.close();
  });

  test("deactivating keeps a record and can be undone", async ({ page }) => {
    await page.goto("/c/demo-gbs/team");
    await page.locator(`a:has(span[title="${EMPLOYEE}"])`).first().click();
    await page.getByRole("link", { name: "Deactivate access…" }).click();
    await page.fill("input[name=reason]", "E2E: temporary removal");
    await page.getByRole("button", { name: "Deactivate access" }).click();
    await expect(page.getByText("Former members")).toBeVisible();
    await expect(page.getByText("E2E: temporary removal")).toBeVisible();
    await page.getByRole("button", { name: "Restore" }).first().click();
    await expect(page.getByText("E2E: temporary removal")).toHaveCount(0);
  });
});

test("an owner sets up two-step sign-in, requires it, and is asked for a code next time", async ({ browser }) => {
  const stamp = Date.now();
  const email = `mfa-owner-${stamp}@example.test`;
  const slug = `mfa-${stamp}`;
  await createUser(email);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await skipLoader(page);
  await signIn(page, email);
  await page.getByRole("textbox", { name: "Family group name" }).fill(`MFA Group ${stamp}`);
  await page.getByRole("button", { name: "Create group" }).click();
  await page.goto("/group/settings");
  await page.fill("#add input[name=name]", "MFA Test Co");
  await page.fill("#add input[name=slug]", slug);
  await page.locator("#add button[type=submit]").click();
  await expect(page.locator(`option[value="${slug}"]`)).toHaveCount(1);

  // Turning the requirement on needs MFA in use first.
  await page.goto(`/switch?to=${slug}`);
  await page.goto(`/c/${slug}/settings`);
  await page.getByRole("button", { name: "Require two-step sign-in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "two-step" })).toBeVisible();

  // Enrol with an authenticator app.
  await page.goto("/mfa");
  await page.getByRole("button", { name: "Set up an authenticator app" }).click();
  const secret = (await page.locator("code").textContent())!.trim();
  await page.fill("input[name=code]", totp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).not.toHaveURL(/\/mfa/);

  await page.goto(`/c/${slug}/settings`);
  await page.getByRole("button", { name: "Require two-step sign-in" }).click();
  await expect(page.getByRole("button", { name: "Stop requiring two-step sign-in" })).toBeVisible();
  await ctx.close();

  // A fresh password sign-in is only aal1: a code is asked for before any workspace opens.
  const ctx2 = await browser.newContext();
  const again = await ctx2.newPage();
  await skipLoader(again);
  await signIn(again, email);
  await again.goto(`/c/${slug}/finance`);
  await expect(again).toHaveURL(/\/mfa/);
  await again.waitForTimeout(31_000); // a TOTP code can be used once; wait for the next one
  await again.fill("input[name=code]", totp(secret));
  await again.getByRole("button", { name: "Verify" }).click();
  await expect(again).not.toHaveURL(/\/mfa/);
  expect((await again.goto(`/c/${slug}/finance`))?.status()).toBe(200);
  await ctx2.close();
});
