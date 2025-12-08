/**
 * E2E tests for Dashboard
 * Verifies critical user journey: login -> view dashboard
 */

import { test, expect } from "@playwright/test";
import { login, cleanupMainTestUserData } from "./helpers/test-data";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    // Use credentials from environment variables for security and configurability
    const testEmail = process.env.E2E_USERNAME;
    const testPassword = process.env.E2E_PASSWORD;

    if (!testEmail || !testPassword) {
      throw new Error("E2E_USERNAME and E2E_PASSWORD environment variables must be set for E2E tests.");
    }

    await login(page, testEmail, testPassword);
  });

  // Cleanup main test user data after each test for isolation
  test.afterEach(async () => {
    await cleanupMainTestUserData();
  });

  test("should display dashboard after login", async ({ page }) => {
    // Should be on dashboard (may include query params like ?month=2025-12)
    await expect(page).toHaveURL(/\/dashboard(\?|$)/);

    // Verify dashboard loaded
    await expect(page.locator('[data-test-id="dashboard"]')).toBeVisible();
  });

  test("should display 4 metric cards when data exists", async ({ page }) => {
    // Per PRD: Dashboard shows 4 cards (Dochód, Wydatki, Odłożone netto, Wolne środki)
    // If there's no data, empty state is shown instead

    // Check if there's data (metric cards visible) or empty state
    const hasData = await page.locator('[data-test-id="metric-card-income"]').isVisible();

    if (hasData) {
      // If data exists, all 4 cards should be visible
      await expect(page.locator('[data-test-id="metric-card-income"]')).toBeVisible();
      await expect(page.locator('[data-test-id="metric-card-expenses"]')).toBeVisible();
      await expect(page.locator('[data-test-id="metric-card-net-saved"]')).toBeVisible();
      await expect(page.locator('[data-test-id="metric-card-free-cash-flow"]')).toBeVisible();
    } else {
      // If no data, empty state should be visible
      await expect(page.locator("text=Brak danych w tym miesiącu")).toBeVisible();
    }
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
});
