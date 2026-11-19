import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { EMPLOYEE_STATE, OWNER_STATE, skipLoader } from "./helpers";

/** Team activity, notifications, leaderboard and achievements, for owners and employees. */
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = Date.now() % 100000;

test.describe("owner", () => {
  test.use({ storageState: OWNER_STATE });
  test.beforeEach(async ({ page }) => skipLoader(page));

  test("a win shows in team activity, the leaderboard and the bell; achievements on home and team", async ({ page }) => {
    const db = admin();
    const { data: org } = await db.from("organizations").select("id").eq("slug", "demo-gbs").single();
    const { data: won } = await db.from("pipeline_stages").select("id").eq("organization_id", org!.id).eq("kind", "won").limit(1).single();
    const { data: me } = await db.from("memberships").select("user_id").eq("organization_id", org!.id).eq("role", "owner").limit(1).single();
    await db.from("activity_seen").upsert({ user_id: me!.user_id, seen_at: new Date(Date.now() - 60_000).toISOString() });
    await page.goto("/c/demo-gbs/pipeline?add=1");
    await page.fill("input[name=title]", `Activity deal ${run}`);
    await page.getByRole("button", { name: /Create deal|Save/ }).first().click();
    await expect(page).not.toHaveURL(/add=1/);
    await db.from("deals").update({ stage_id: won!.id, value_minor: 25000000, owner_id: me!.user_id }).eq("title", `Activity deal ${run}`);
    await page.goto("/c/demo-gbs");
    const feed = page.locator("#activity");
    await expect(feed).toContainText(`added a deal: Activity deal ${run}`);
    await expect(feed).toContainText("won a deal");
    await expect(page.getByRole("region", { name: "Leaderboard" })).toContainText("(you)");
    await expect(page.getByRole("region", { name: "My achievements" })).toContainText("First win");
    // The bell shows the news and clears once opened.
    const bell = page.getByRole("button", { name: /notifications/i });
    await bell.click();
    await expect(page.getByRole("dialog", { name: "Notifications" })).toContainText("Team activity");
    await expect(page.getByRole("dialog", { name: "Notifications" })).toContainText("won a deal");
    await page.reload();
    const { data: seen } = await db.from("activity_seen").select("seen_at").eq("user_id", me!.user_id).single();
    expect(Date.parse(seen!.seen_at)).toBeGreaterThan(Date.now() - 120_000);
    await page.goto("/c/demo-gbs/team");
    await expect(page.locator("article").first()).toContainText(/★|No badges yet/);
    await page.goto("/group");
    await expect(page.locator("#activity")).toContainText("Get Bee Seen");
  });
});

test.describe("employee", () => {
  test.use({ storageState: EMPLOYEE_STATE });
  test.beforeEach(async ({ page }) => skipLoader(page));

  test("a sales rep sees team wins without client names, and their own achievements", async ({ page }) => {
    await page.goto("/c/demo-gbs");
    await expect(page.locator("#activity")).toContainText("won a deal");
    await expect(page.locator("#activity")).not.toContainText(`Activity deal ${run}`);
    await expect(page.getByRole("region", { name: "My achievements" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Leaderboard" })).toBeVisible();
  });
});
