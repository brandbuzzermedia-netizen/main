import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests against a real local Supabase stack (`supabase start`) and the dev server.
 * The dev server is needed because the demo group can only be created in development.
 * Tests share one database, so they run in order on one worker.
 */
const port = Number(process.env.E2E_PORT ?? 3000);
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${port}`, trace: "off", viewport: { width: 1440, height: 900 } },
  webServer: { command: `npx next dev -p ${port}`, url: `http://localhost:${port}/login`, reuseExistingServer: true, timeout: 180_000 },
});
