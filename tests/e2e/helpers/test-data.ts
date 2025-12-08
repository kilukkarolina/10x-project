/**
 * Test data helpers for E2E tests
 */

import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load test environment variables from project root
// This file is in tests/e2e/helpers/, so we need to go up 3 levels
dotenv.config({ path: resolve(__dirname, "../../../.env.test") });

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
      // Delete profile first (foreign key constraint)
      await supabase.from("profiles").delete().eq("user_id", user.id);

      // Then delete auth user
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
 * Ensure profile exists for user
 * Creates profile record if it doesn't exist
 */
export async function ensureUserProfile(userId: string) {
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    // eslint-disable-next-line no-console
    console.warn("⚠️  Skipping profile creation: Missing Supabase credentials");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Check if profile exists
    const { data: existingProfile } = await supabase.from("profiles").select("user_id").eq("user_id", userId).single();

    if (!existingProfile) {
      // Create profile
      await supabase.from("profiles").insert({
        user_id: userId,
        email_confirmed: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      // eslint-disable-next-line no-console
      console.log(`✅ Created profile for user: ${userId}`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to ensure user profile:", error);
  }
}

/**
 * Login helper for E2E tests
 * Automatically ensures user profile exists before login
 */
export async function login(page: Page, email: string, password: string) {
  // First, ensure the user has a profile in the database
  // This is needed because Supabase doesn't auto-create profiles
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (supabaseUrl && supabaseServiceKey) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user by email
    const {
      data: { users },
    } = await supabase.auth.admin.listUsers();
    const user = users.find((u) => u.email === email);

    if (user) {
      await ensureUserProfile(user.id);
    }
  }

  await page.goto("/auth/login");
  await page.waitForLoadState("networkidle");

  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
  await page.click('[data-test-id="login-submit"]');

  // Wait for navigation to dashboard (may include query params)
  await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 10000 });
}

/**
 * Logout helper for E2E tests
 */
export async function logout(page: Page) {
  // Adjust selector based on your actual logout button
  await page.click('[aria-label="Logout"]');
  await page.waitForURL("/auth/login", { timeout: 5000 });
}

/**
 * Cleanup main test user data (but keep the user account)
 * This should be called in afterEach to ensure test isolation
 * Deletes: transactions, goals, goal_events, audit_log, rate_limits
 * Auto-updates: monthly_metrics (via triggers when transactions/goal_events are deleted)
 * Preserves: profile and auth.users record
 */
export async function cleanupMainTestUserData() {
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const mainTestUserId = process.env.E2E_USERNAME_ID;

  if (!supabaseUrl || !supabaseServiceKey || !mainTestUserId) {
    // eslint-disable-next-line no-console
    console.warn("⚠️  Skipping test data cleanup: Missing credentials");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Delete data in order to respect foreign key constraints
    // Note: monthly_metrics is NOT deleted - it's auto-managed by triggers
    await supabase.from("rate_limits").delete().eq("user_id", mainTestUserId);
    await supabase.from("audit_log").delete().eq("owner_user_id", mainTestUserId);
    await supabase.from("goal_events").delete().eq("user_id", mainTestUserId);
    await supabase.from("goals").delete().eq("user_id", mainTestUserId);
    await supabase.from("transactions").delete().eq("user_id", mainTestUserId);

    // eslint-disable-next-line no-console
    console.log("✅ Cleaned up main test user data");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("❌ Failed to cleanup main test user data:", error);
  }
}
