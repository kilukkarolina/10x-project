import { createClient } from "@supabase/supabase-js";

import type { Database } from "../db/database.types";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    `Missing Supabase configuration. Please check .env file has:\n` +
      `PUBLIC_SUPABASE_URL=your_project_url\n` +
      `PUBLIC_SUPABASE_ANON_KEY=your_anon_key\n\n` +
      `Current values: URL=${supabaseUrl ? "SET" : "MISSING"}, KEY=${supabaseAnonKey ? "SET" : "MISSING"}`
  );
}

/**
 * Supabase client for API endpoints
 *
 * DEVELOPMENT MODE (CURRENT):
 * - RLS is temporarily DISABLED on main tables (see migration 20251111090000)
 * - Using anon key - sufficient for testing without auth
 * - Auth middleware not yet implemented
 *
 * PRODUCTION MODE (FUTURE):
 * - RLS will be RE-ENABLED for security
 * - Auth middleware will provide user context (context.locals.user)
 * - RLS policies will enforce user-based access control
 *
 * Note: Re-enable RLS and implement auth before production deployment
 */
export const supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export type SupabaseClient = typeof supabaseClient;

/**
 * Default user ID for development/testing
 * This user is seeded in migration 20251109120500_seed_test_user.sql
 * Used when auth is not yet implemented
 */
export const DEFAULT_USER_ID = "4eef0567-df09-4a61-9219-631def0eb53e";
