/**
 * Global teardown for E2E tests
 * Cleans up the Supabase test database after all tests
 *
 * This script:
 * 1. Connects to Supabase using service role key
 * 2. Deletes all data from business tables
 * 3. Preserves the main test user (raketap480@alexida.com)
 * 4. Preserves dictionary tables (transaction_categories, goal_types)
 * 5. Does NOT delete monthly_metrics (auto-managed by triggers)
 */

import { createClient } from "@supabase/supabase-js";

async function globalTeardown() {
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const mainTestUserId = process.env.E2E_USERNAME_ID;

  if (!supabaseUrl || !supabaseServiceKey) {
    // eslint-disable-next-line no-console
    console.warn("⚠️  Skipping database cleanup: Missing Supabase credentials");
    // eslint-disable-next-line no-console
    console.warn("    Make sure .env.test has PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY");
    return;
  }

  if (!mainTestUserId) {
    // eslint-disable-next-line no-console
    console.warn("⚠️  Skipping database cleanup: Missing E2E_USERNAME_ID");
    // eslint-disable-next-line no-console
    console.warn("    Make sure .env.test has E2E_USERNAME_ID with the main test user UUID");
    return;
  }

  // eslint-disable-next-line no-console
  console.log("\n🧹 Starting database cleanup...");

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    // Step 1: Delete data from business tables (in order to respect foreign keys)
    // Note: monthly_metrics is NOT deleted - it's auto-managed by triggers

    // 1a. Delete rate_limits (no FK dependencies)
    const { error: rateLimitsError } = await supabase.from("rate_limits").delete().neq("user_id", mainTestUserId);

    if (rateLimitsError) {
      // eslint-disable-next-line no-console
      console.error("❌ Failed to delete rate_limits:", rateLimitsError);
    } else {
      // eslint-disable-next-line no-console
      console.log("✅ Cleaned up rate_limits");
    }

    // 1b. Delete audit_log (no FK dependencies)
    const { error: auditLogError } = await supabase.from("audit_log").delete().neq("owner_user_id", mainTestUserId);

    if (auditLogError) {
      // eslint-disable-next-line no-console
      console.error("❌ Failed to delete audit_log:", auditLogError);
    } else {
      // eslint-disable-next-line no-console
      console.log("✅ Cleaned up audit_log");
    }

    // 1c. Delete goal_events (depends on goals)
    const { error: goalEventsError } = await supabase.from("goal_events").delete().neq("user_id", mainTestUserId);

    if (goalEventsError) {
      // eslint-disable-next-line no-console
      console.error("❌ Failed to delete goal_events:", goalEventsError);
    } else {
      // eslint-disable-next-line no-console
      console.log("✅ Cleaned up goal_events");
    }

    // 1d. Delete goals
    const { error: goalsError } = await supabase.from("goals").delete().neq("user_id", mainTestUserId);

    if (goalsError) {
      // eslint-disable-next-line no-console
      console.error("❌ Failed to delete goals:", goalsError);
    } else {
      // eslint-disable-next-line no-console
      console.log("✅ Cleaned up goals");
    }

    // 1e. Delete transactions
    const { error: transactionsError } = await supabase.from("transactions").delete().neq("user_id", mainTestUserId);

    if (transactionsError) {
      // eslint-disable-next-line no-console
      console.error("❌ Failed to delete transactions:", transactionsError);
    } else {
      // eslint-disable-next-line no-console
      console.log("✅ Cleaned up transactions");
    }

    // Step 2: Delete profiles (except main test user)
    // This also triggers cascade delete of auth.users via Supabase
    const { data: profilesToDelete, error: profilesFetchError } = await supabase
      .from("profiles")
      .select("user_id")
      .neq("user_id", mainTestUserId);

    if (profilesFetchError) {
      // eslint-disable-next-line no-console
      console.error("❌ Failed to fetch profiles:", profilesFetchError);
    } else if (profilesToDelete && profilesToDelete.length > 0) {
      // Delete profiles
      const { error: profilesDeleteError } = await supabase.from("profiles").delete().neq("user_id", mainTestUserId);

      if (profilesDeleteError) {
        // eslint-disable-next-line no-console
        console.error("❌ Failed to delete profiles:", profilesDeleteError);
      } else {
        // eslint-disable-next-line no-console
        console.log(`✅ Cleaned up ${profilesToDelete.length} profile(s)`);
      }

      // Delete corresponding auth users
      for (const profile of profilesToDelete) {
        try {
          await supabase.auth.admin.deleteUser(profile.user_id);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`❌ Failed to delete auth user ${profile.user_id}:`, error);
        }
      }
      // eslint-disable-next-line no-console
      console.log(`✅ Cleaned up ${profilesToDelete.length} auth user(s)`);
    } else {
      // eslint-disable-next-line no-console
      console.log("✅ No additional profiles to clean up");
    }

    // eslint-disable-next-line no-console
    console.log("🎉 Database cleanup completed successfully\n");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("❌ Database cleanup failed:", error);
    throw error;
  }
}

export default globalTeardown;
