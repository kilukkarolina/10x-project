import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Load test environment variables
dotenv.config({ path: ".env.test" });

export default defineConfig({
  testDir: "./tests/e2e",

  // Run tests sequentially for stability (per guidelines)
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker as per playwright-e2e-testing.mdc

  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],

  // Global teardown to clean up Supabase database after all tests
  globalTeardown: "./tests/e2e/helpers/global-teardown.ts",

  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:3004",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    // Timeout per action
    actionTimeout: 10000,
  },

  // Only Chromium/Desktop Chrome as per guidelines
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start dev server locally (optional, can be disabled if running manually)
  // The dev:e2e script loads .env.test automatically
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev:e2e",
        url: "http://localhost:3004",
        reuseExistingServer: true,
        timeout: 120000,
      },
});
