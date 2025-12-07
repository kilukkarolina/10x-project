/**
 * E2E tests for Authentication flows
 * Tests with real Supabase Auth and Ethereal Email
 */

import { test, expect } from "@playwright/test";
import { generateTestUser, cleanupTestUser, login } from "./helpers/test-data";

test.describe("Authentication", () => {
  test.describe("Login Flow", () => {
    test("should show error for invalid credentials", async ({ page }) => {
      await page.goto("/auth/login");

      await page.fill('[name="email"]', "wrong@example.com");
      await page.fill('[name="password"]', "wrongpassword");
      await page.click('button[type="submit"]');

      // Wait for error message
      // Adjust selector based on your actual error display
      await expect(page.locator("text=/invalid.*credentials/i")).toBeVisible();
    });

    test("should redirect to dashboard after successful login", async ({ page }) => {
      // This test requires a pre-existing verified user in your test Supabase project
      // You can create one manually or in a setup script

      const testEmail = "verified-test-user@example.com"; // Replace with actual test user
      const testPassword = "TestPassword123!"; // Replace with actual password

      await page.goto("/auth/login");

      await page.fill('[name="email"]', testEmail);
      await page.fill('[name="password"]', testPassword);
      await page.click('button[type="submit"]');

      // Should redirect to dashboard
      await expect(page).toHaveURL("/dashboard", { timeout: 10000 });

      // Verify dashboard loaded
      await expect(page.locator("h1")).toContainText(/dashboard/i);
    });
  });

  test.describe("Registration Flow", () => {
    test("should show validation error for weak password", async ({ page }) => {
      await page.goto("/auth/register");

      const { email } = generateTestUser();

      await page.fill('[name="email"]', email);
      await page.fill('[name="password"]', "weak"); // Too weak
      await page.click('button[type="submit"]');

      // Should show password requirements error
      await expect(page.locator("text=/password.*requirements/i")).toBeVisible({ timeout: 5000 });
    });

    test("should show confirmation message after registration", async ({ page }) => {
      const { email, password } = generateTestUser();

      await page.goto("/auth/register");

      await page.fill('[name="email"]', email);
      await page.fill('[name="password"]', password);
      await page.click('button[type="submit"]');

      // Should show email verification message
      await expect(page.locator("text=/check.*email|verify.*email/i")).toBeVisible({ timeout: 10000 });

      // Cleanup
      await cleanupTestUser(email);
    });

    // Full registration flow with email verification
    // This requires Ethereal Email setup
    test.skip("full registration with email verification", async ({ page }) => {
      // This is a placeholder for full E2E registration test
      // Requires:
      // 1. Supabase SMTP configured with Ethereal
      // 2. EtherealMailClient implementation completed
      // 3. Email parsing logic

      const { email, password } = generateTestUser();

      // 1. Register
      await page.goto("/auth/register");
      await page.fill('[name="email"]', email);
      await page.fill('[name="password"]', password);
      await page.click('button[type="submit"]');

      // 2. Wait for confirmation message
      await expect(page.locator("text=/check.*email/i")).toBeVisible();

      // 3. Get verification link from email (requires implementation)
      // const verificationLink = await ethereal.getLastVerificationLink(email);

      // 4. Click verification link
      // await page.goto(verificationLink);

      // 5. Verify account activated
      // await expect(page.locator('text=/email.*confirmed/i')).toBeVisible();

      // 6. Login
      // await login(page, email, password);
      // await expect(page).toHaveURL('/dashboard');

      // Cleanup
      await cleanupTestUser(email);
    });
  });

  test.describe("Logout Flow", () => {
    test("should redirect to login page after logout", async ({ page }) => {
      // Login first
      const testEmail = "verified-test-user@example.com";
      const testPassword = "TestPassword123!";

      await login(page, testEmail, testPassword);

      // Should be on dashboard
      await expect(page).toHaveURL("/dashboard");

      // Click logout (adjust selector based on your implementation)
      await page.click('[aria-label="Logout"]');

      // Should redirect to login
      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 5000 });
    });
  });
});
