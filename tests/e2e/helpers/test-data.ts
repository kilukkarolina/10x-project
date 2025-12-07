/**
 * Test data helpers for E2E tests
 */

import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Generate unique test user credentials
 */
export function generateTestUser() {
  const timestamp = Date.now();
  return {
    email: `e2e-test-${timestamp}@example.com`,
    password: "TestPassword123!",
  };
}

/**
 * Cleanup test user using Supabase Admin API
 * Call this in test cleanup to remove users created during E2E tests
 */
export async function cleanupTestUser(email: string) {
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    // eslint-disable-next-line no-console
    console.warn("⚠️  Skipping user cleanup: Missing Supabase credentials");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Get user by email
    const {
      data: { users },
    } = await supabase.auth.admin.listUsers();
    const user = users.find((u) => u.email === email);

    if (user) {
      await supabase.auth.admin.deleteUser(user.id);
      // eslint-disable-next-line no-console
      console.log(`🧹 Cleaned up test user: ${email}`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to cleanup test user:", error);
  }
}

/**
 * Login helper for E2E tests
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for navigation to dashboard
  await page.waitForURL("/dashboard", { timeout: 10000 });
}

/**
 * Logout helper for E2E tests
 */
export async function logout(page: Page) {
  // Adjust selector based on your actual logout button
  await page.click('[aria-label="Logout"]');
  await page.waitForURL("/auth/login", { timeout: 5000 });
}
