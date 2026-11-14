import { expect, type Page } from "@playwright/test";

export const PASSWORD = "E2e-pass-12345";
export const OWNER = "e2e-owner@example.test";
export const EMPLOYEE = "e2e-rep@example.test";
export const OWNER_STATE = "e2e/.auth/owner.json";
export const EMPLOYEE_STATE = "e2e/.auth/employee.json";

/** Skips the workspace entry animation so screens can be asserted straight away. */
export async function skipLoader(page: Page) {
  await page.addInitScript(() => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
  });
}

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByText("Sign in with a password").click();
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.waitForLoadState("networkidle");
}

/** Fails if the page shows the app's error boundary or Next's error overlay text. */
export async function expectHealthy(page: Page) {
  await expect(page.locator("body")).not.toContainText(/Something went wrong|Unhandled Runtime Error|Application error/);
}
