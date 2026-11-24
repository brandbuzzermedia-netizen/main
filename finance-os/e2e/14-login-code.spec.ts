import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { expectHealthy, skipLoader } from "./helpers";

/** Sign in with the code from the email (the iPhone-friendly way): nothing has to be opened from the email. */
const MAIL = "http://127.0.0.1:54324/api/v1";
async function latestCode(to: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAIL}/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json() as { messages: { ID: string }[] };
    if (list.messages?.length) {
      const msg = await (await fetch(`${MAIL}/message/${list.messages[0].ID}`)).json() as { HTML: string; Subject: string };
      const code = /letter-spacing:6px[^>]*>\s*(\d{6,10})\s*</.exec(msg.HTML)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no sign-in email arrived");
}

test("sign in with the emailed code; a wrong code is refused", async ({ page }) => {
  const email = `code-${Date.now()}@example.test`;
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  await admin.auth.admin.createUser({ email, email_confirm: true });
  await skipLoader(page);
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();
  const code = await latestCode(email);
  expect(code).toMatch(/^\d{8}$/);

  await page.fill("input[name=code]", "00000000");
  await page.getByRole("button", { name: "Sign in with the code" }).click();
  await expect(page.getByText("That code is wrong or has expired")).toBeVisible();

  await page.fill("input[name=code]", code);
  await page.getByRole("button", { name: "Sign in with the code" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await expectHealthy(page);
});
