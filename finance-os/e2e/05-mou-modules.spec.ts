import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { OWNER_STATE, skipLoader } from "./helpers";

/** More of Us OS modules, in every company: menu, follow-ups, research, proposals, targets, call list. */
test.use({ storageState: OWNER_STATE });
test.beforeEach(async ({ page }) => skipLoader(page));
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now() % 100000;

test("the menu has the More of Us OS sections and modules", async ({ page }) => {
  await page.goto("/c/demo-gbs");
  const nav = page.locator("aside nav");
  for (const t of ["Overview", "Sales", "Finance", "Dashboard", "Research board", "Follow-ups", "Proposals", "Invoices", "Team & targets"]) await expect(nav).toContainText(t);
  await expect(page.locator("h1")).toContainText(/Good (morning|afternoon|evening),/);
});

test("follow-ups: add one and move it across the board", async ({ page }) => {
  await page.goto("/c/demo-gbs/followups?add=1");
  await page.fill("input[name=title]", `Call back ${run}`);
  await page.getByRole("button", { name: "Save" }).click();
  const card = page.locator("article").filter({ hasText: `Call back ${run}` });
  await expect(card).toBeVisible();
  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await card.getByLabel(`Move Call back ${run} to`).selectOption("in_progress");
  await expect(page.locator("section[aria-label='In progress']")).toContainText(`Call back ${run}`);
  await saved;
  await page.reload();
  await expect(page.locator("section[aria-label='In progress']")).toContainText(`Call back ${run}`);
});

test("research board: add a card and move it", async ({ page }) => {
  await page.goto("/c/demo-gbs/research?add=1");
  await page.fill("input[name=title]", `Research ${run}`);
  await page.fill("input[name=account]", "Timber Association");
  await page.selectOption("select[name=priority]", "high");
  await page.getByRole("button", { name: "Save" }).click();
  const card = page.locator("article").filter({ hasText: `Research ${run}` });
  await expect(card).toContainText("High priority");
  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await card.getByLabel(`Move Research ${run} to`).selectOption("done");
  await saved;
  await page.reload();
  await expect(page.locator("section[aria-label='Done']")).toContainText(`Research ${run}`);
});

test("proposals: numbered, sent moves the deal to Proposal, accepted marks it Won", async ({ page }) => {
  await page.goto("/c/demo-gbs/pipeline?add=1");
  await page.fill("input[name=title]", `Proposal deal ${run}`);
  await page.getByRole("button", { name: /Create deal|Save/ }).first().click();
  await expect(page).not.toHaveURL(/add=1/);
  await page.goto("/c/demo-gbs/proposals?add=1");
  await page.fill("input[name=title]", `Website ${run}`);
  await page.fill("input[name=client_name]", "Aerostyle");
  await page.selectOption("select[name=deal_id]", { label: `Proposal deal ${run}` });
  await page.fill("input[name=amount]", "100000");
  await page.selectOption("select[name=status]", "sent");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("moved to Proposal");
  const row = page.locator("div").filter({ hasText: `Website ${run}` }).filter({ has: page.getByRole("button", { name: "Accepted", exact: true }) }).last();
  await expect(row).toContainText("₹1,18,000");
  await expect(row).toContainText(/GBS-P-\d{3}|[A-Z]+-P-\d{3}/);
  await row.getByRole("button", { name: "Accepted", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("marked Won");
  const { data } = await admin().from("deals").select("closed_at, stage:pipeline_stages(kind)").eq("title", `Proposal deal ${run}`).single();
  expect((data!.stage as unknown as { kind: string }).kind).toBe("won");
  expect(data!.closed_at).not.toBeNull();
});

test("sales settings and team targets", async ({ page }) => {
  await page.goto("/c/demo-gbs/settings#sales");
  const f = page.locator("#sales form");
  await f.locator("input[name=monthly_target]").fill("1500000");
  await f.locator("textarea[name=services]").fill("Strategy & consulting\nWebsite\nPerformance marketing");
  const me = (await page.locator(".dp-me-text").first().innerText()).split("\n")[0].trim();
  await f.locator("textarea[name=member_targets]").fill(`${me}: 1000000\nNobody Here: 5`);
  await f.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator("#sales [role=status]")).toContainText("Not matched to a team member: Nobody Here");
  await page.goto("/c/demo-gbs/team");
  await expect(page.getByText("target", { exact: false }).first()).toBeVisible();
  await expect(page.locator("article").filter({ hasText: me }).first()).toContainText("Target ₹10");
  await expect(page.locator("article").filter({ hasText: me }).first().getByRole("link", { name: "Their pipeline" })).toBeVisible();
});

test("outreach: the call list board moves a lead forward", async ({ page }) => {
  const db = admin();
  const { data: org } = await db.from("organizations").select("id").eq("slug", "demo-gbs").single();
  await db.from("contacts").insert({ organization_id: org!.id, full_name: `Caller ${run}`, lead_status: "new", source: "Referral" });
  await page.goto("/c/demo-gbs/outreach");
  await expect(page.locator("h1")).toContainText("Reach out.");
  const card = page.locator("article").filter({ hasText: `Caller ${run}` });
  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await card.getByLabel(`Move Caller ${run} to`).selectOption("contacted");
  await saved;
  await page.reload();
  await expect(page.locator("section[aria-label='Reached out']")).toContainText(`Caller ${run}`);
});
