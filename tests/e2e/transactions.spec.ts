/**
 * E2E tests for Transactions
 * Verifies adding income and expense transactions
 */

import { test, expect } from "@playwright/test";
import { login, cleanupMainTestUserData } from "./helpers/test-data";

test.describe("Transactions", () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    const testEmail = process.env.E2E_USERNAME;
    const testPassword = process.env.E2E_PASSWORD;

    if (!testEmail || !testPassword) {
      throw new Error("E2E_USERNAME and E2E_PASSWORD environment variables must be set for E2E tests.");
    }

    await login(page, testEmail, testPassword);

    // Navigate to transactions page
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");
  });

  // Cleanup main test user data after each test for isolation
  test.afterEach(async () => {
    await cleanupMainTestUserData();
  });

  test("should add income transaction (SALARY)", async ({ page }) => {
    // Click "Add transaction" button
    await page.click('[data-test-id="add-transaction-button"]');

    // Wait for modal to appear and be fully loaded
    await expect(page.getByRole("heading", { name: "Dodaj transakcję" })).toBeVisible();
    await page.waitForTimeout(500); // Wait for React hydration

    // Select INCOME type
    await page.click('[data-test-id="transaction-type-income"]');

    // Select SALARY category
    await page.click('[data-test-id="transaction-category-select"]');
    await page.getByRole("option", { name: "Wynagrodzenie" }).click();

    // Fill amount
    await page.fill('[name="amount"]', "5000.00");

    // Fill date (today)
    const today = new Date().toISOString().split("T")[0];
    await page.fill('[name="date"]', today);

    // Fill note (optional)
    await page.fill('[name="note"]', "Wypłata za grudzień");

    // Check if there are any validation errors before submitting
    const validationErrors = await page.locator(".text-destructive").count();
    if (validationErrors > 0) {
      const errorText = await page.locator(".text-destructive").first().textContent();
      throw new Error(`Validation error found: ${errorText}`);
    }

    // Submit form
    await page.getByRole("button", { name: "Dodaj" }).click();

    // Wait for modal to close
    await expect(page.getByRole("heading", { name: "Dodaj transakcję" })).not.toBeVisible({ timeout: 10000 });

    // Verify transaction appears in the list
    await expect(page.locator("text=Wynagrodzenie")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=5 000,00 zł")).toBeVisible();
  });

  test("should add expense transaction (GROCERIES)", async ({ page }) => {
    // Click "Add transaction" button
    await page.click('[data-test-id="add-transaction-button"]');

    // Wait for modal to appear
    await expect(page.getByRole("heading", { name: "Dodaj transakcję" })).toBeVisible();

    // EXPENSE type should be selected by default, but let's make it explicit
    await page.click('[data-test-id="transaction-type-expense"]');

    // Select GROCERIES category
    await page.click('[data-test-id="transaction-category-select"]');
    await page.getByRole("option", { name: "Zakupy spożywcze" }).click();

    // Fill amount
    await page.fill('[name="amount"]', "250.50");

    // Fill date (today)
    const today = new Date().toISOString().split("T")[0];
    await page.fill('[name="date"]', today);

    // Fill note (optional)
    await page.fill('[name="note"]', "Zakupy w Biedronce");

    // Submit form
    await page.click('[data-test-id="transaction-form-submit"]');

    // Wait for modal to close and transaction to appear in the list
    await expect(page.getByRole("heading", { name: "Dodaj transakcję" })).not.toBeVisible({ timeout: 10000 });

    // Verify transaction appears in the list
    await expect(page.locator("text=Zakupy spożywcze")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=250,50 zł")).toBeVisible();
  });

  test("should show validation error for missing category", async ({ page }) => {
    // Click "Add transaction" button
    await page.click('[data-test-id="add-transaction-button"]');

    // Wait for modal to appear
    await expect(page.getByRole("heading", { name: "Dodaj transakcję" })).toBeVisible();

    // Fill amount without selecting category
    await page.fill('[name="amount"]', "100.00");

    // Try to submit
    await page.click('[data-test-id="transaction-form-submit"]');

    // Should show validation error
    await expect(page.locator("text=Kategoria jest wymagana")).toBeVisible();
  });

  test("should show validation error for invalid amount", async ({ page }) => {
    // Click "Add transaction" button
    await page.click('[data-test-id="add-transaction-button"]');

    // Wait for modal to appear
    await expect(page.getByRole("heading", { name: "Dodaj transakcję" })).toBeVisible();

    // Select category
    await page.click('[data-test-id="transaction-category-select"]');
    await page.getByRole("option", { name: "Zakupy spożywcze" }).click();

    // Fill invalid amount (negative)
    await page.fill('[name="amount"]', "0");

    // Try to submit
    await page.click('[data-test-id="transaction-form-submit"]');

    // Should show validation error
    await expect(page.locator("text=/Kwota musi być dodatnia/")).toBeVisible();
  });
});
