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

      // Wait for form to be ready
      await page.waitForLoadState("networkidle");

      // Fill form fields using name selectors (more reliable)
      await page.fill('[name="email"]', "test@gmail.com");
      await page.fill('[name="password"]', "WrongPassword123!");

      // Click submit button using data-test-id
      await page.click('[data-test-id="login-submit"]');

      // Wait for error message to appear
      const errorMessage = page.locator('[data-test-id="login-error-message"]');
      await expect(errorMessage).toBeVisible({ timeout: 10000 });
      await expect(errorMessage).toContainText("Nieprawidłowy e-mail lub hasło");
    });

    test("should redirect to dashboard after successful login", async ({ page }) => {
      // This test requires a pre-existing verified user in your test Supabase project
      // Credentials are loaded from environment variables

      const testEmail = process.env.E2E_USERNAME;
      const testPassword = process.env.E2E_PASSWORD;

      if (!testEmail || !testPassword) {
        throw new Error("E2E_USERNAME and E2E_PASSWORD environment variables must be set for E2E tests.");
      }

      await page.goto("/auth/login");
      await page.waitForLoadState("networkidle");

      await page.fill('[name="email"]', testEmail);
      await page.fill('[name="password"]', testPassword);
      await page.click('[data-test-id="login-submit"]');

      // Should redirect to dashboard (may include query params like ?month=2025-12)
      await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 10000 });
    });
  });

  test.describe("Registration Flow", () => {
    test("should show validation error for weak password", async ({ page }) => {
      await page.goto("/auth/register");
      await page.waitForLoadState("networkidle");

      const { email } = generateTestUser();

      await page.fill('[name="email"]', email);
      await page.fill('[name="password"]', "weak"); // Too weak

      // Password requirements should appear when typing
      const passwordRequirements = page.locator('[data-test-id="password-requirements"]');
      await expect(passwordRequirements).toBeVisible({ timeout: 5000 });

      // Submit button should be disabled for weak password
      const submitButton = page.locator('[data-test-id="register-submit"]');
      await expect(submitButton).toBeDisabled();
    });

    test("should redirect to dashboard after successful registration", async ({ page }) => {
      const { email, password } = generateTestUser();

      await page.goto("/auth/register");
      await page.waitForLoadState("networkidle");

      await page.fill('[name="email"]', email);
      await page.fill('[name="password"]', password);
      await page.fill('[name="confirmPassword"]', password);

      await page.click('[data-test-id="register-submit"]');

      // Should redirect to dashboard (auto-login after registration)
      await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 10000 });

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
      const testEmail = process.env.E2E_USERNAME;
      const testPassword = process.env.E2E_PASSWORD;

      if (!testEmail || !testPassword) {
        throw new Error("E2E_USERNAME and E2E_PASSWORD environment variables must be set for E2E tests.");
      }

      await login(page, testEmail, testPassword);

      // Should be on dashboard (may include query params like ?month=2025-12)
      await expect(page).toHaveURL(/\/dashboard(\?|$)/);

      // Click logout button
      await page.click('[data-test-id="logout-button"]');

      // Should redirect to login
      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 5000 });
    });
  });
});
