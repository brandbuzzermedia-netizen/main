import { chromium, expect, type FullConfig } from "@playwright/test";
import { EMPLOYEE, EMPLOYEE_STATE, OWNER, OWNER_STATE, PASSWORD, signIn, skipLoader } from "./helpers";

async function ensureUser(email: string, name: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("E2E needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from `supabase status`.");
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error("E2E only runs against a local Supabase stack.");
  const r = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } }),
  });
  if (!r.ok && r.status !== 422) throw new Error(`Could not create ${email}: ${r.status} ${await r.text()}`);
}

/** Creates the owner (with the demo group) and a sales rep in the demo Get Bee Seen workspace. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  await ensureUser(OWNER, "E2E Owner");
  await ensureUser(EMPLOYEE, "E2E Rep");
  const browser = await chromium.launch();
  const owner = await browser.newPage({ baseURL });
  await skipLoader(owner);
  await signIn(owner, OWNER);
  const demo = owner.getByRole("button", { name: "Create demo group" });
  if (await demo.count()) {
    await demo.click();
    await expect(owner.locator("aside")).toBeVisible({ timeout: 120_000 });
  }
  const rep = await browser.newPage({ baseURL });
  await signIn(rep, EMPLOYEE); // a person signs in once before an owner can add them
  await owner.goto("/c/demo-gbs/team");
  if (!(await owner.locator(`span[title="${EMPLOYEE}"]`).count())) {
    await owner.goto("/c/demo-gbs/team?add=1");
    await owner.fill("input[name=email]", EMPLOYEE);
    await owner.selectOption("select[name=role]", "sales_rep");
    await owner.getByRole("button", { name: "Add member" }).click();
    await expect(owner.getByText(`${EMPLOYEE} added.`)).toBeVisible();
  }
  await owner.context().storageState({ path: OWNER_STATE });
  await rep.context().storageState({ path: EMPLOYEE_STATE });
  await browser.close();
}
