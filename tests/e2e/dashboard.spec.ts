/**
 * E2E tests for Dashboard
 * Verifies critical user journey: login -> view dashboard
 */

import { test, expect } from "@playwright/test";
import { login } from "./helpers/test-data";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    // Replace with actual test user credentials from your Supabase test project
    const testEmail = "verified-test-user@example.com";
    const testPassword = "TestPassword123!";

    await login(page, testEmail, testPassword);
  });

  test("should display dashboard after login", async ({ page }) => {
    // Should be on dashboard
    await expect(page).toHaveURL("/dashboard");

    // Verify main heading
    await expect(page.locator("h1")).toBeVisible();

    // Verify dashboard loaded (look for key elements)
    // Adjust selectors based on your actual dashboard structure
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
  });

  test("should display 4 metric cards", async ({ page }) => {
    // Per PRD: Dashboard shows 4 cards (Dochód, Wydatki, Odłożone netto, Wolne środki)
    // Adjust selectors based on your actual implementation

    const cards = page.locator('[data-testid^="metric-card"]');
    await expect(cards).toHaveCount(4, { timeout: 10000 });
  });

  test("should allow navigation to transactions", async ({ page }) => {
    // Click on transactions link
    await page.click('a[href="/transactions"]');

    // Should navigate to transactions page
    await expect(page).toHaveURL("/transactions", { timeout: 5000 });
  });

  test("should allow navigation to goals", async ({ page }) => {
    // Click on goals link
    await page.click('a[href="/goals"]');

    // Should navigate to goals page
    await expect(page).toHaveURL("/goals", { timeout: 5000 });
  });

  test("should take screenshot of dashboard for visual regression", async ({ page }) => {
    // Visual regression testing using Playwright screenshots
    // First run will create baseline, subsequent runs will compare

    await expect(page).toHaveScreenshot("dashboard-view.png", {
      fullPage: true,
      // Optional: mask dynamic content
      mask: [page.locator('[data-testid="current-time"]')],
    });
  });
});
