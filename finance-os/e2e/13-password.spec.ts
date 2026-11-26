import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { expectHealthy, skipLoader } from "./helpers";

/** A person sets their own password from the profile menu, then signs in with it. Uses its own throwaway user. */
test("set password from the profile menu, then sign in with it", async ({ page }) => {
  const email = `pw-${Date.now()}@example.test`;
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  await admin.auth.admin.createUser({ email, password: "Temp-pass-12345", email_confirm: true });
  await skipLoader(page);
  await page.goto("/login");
  await page.getByText("Sign in with a password").click();
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Temp-pass-12345");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);

  await page.goto("/account/password");
  await expectHealthy(page);
  await expect(page.getByText(`Your sign-in ID is your email: ${email}`)).toBeVisible();
  await expect(page.locator("input[name=password]")).toHaveAttribute("minlength", "10");
  await page.fill("input[name=password]", "mango-river-lamp-42");
  await page.fill("input[name=again]", "mango-river-lamp-43");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("status")).toHaveText("The two passwords do not match.");
  await page.fill("input[name=password]", "mango-river-lamp-42");
  await page.fill("input[name=again]", "mango-river-lamp-42");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("heading", { name: "Password saved" })).toBeVisible();

  // Sign out, then in with the new password.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByText("Sign in with a password").click();
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "mango-river-lamp-42");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
});
