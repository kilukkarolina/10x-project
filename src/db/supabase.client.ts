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
 * Supabase client for server-side API endpoints
 *
 * Configuration:
 * - autoRefreshToken: false (server-side, no token refresh needed)
 * - persistSession: false (stateless server requests)
 * - Uses anon key (public access level)
 *
 * Usage:
 * - Import in API routes via context.locals.supabase (preferred)
 * - Direct import acceptable for non-auth operations
 * - For auth operations, use supabaseBrowser (client-side) or supabaseAdmin (server-side with elevated privileges)
 *
 * DEVELOPMENT MODE (CURRENT):
 * - RLS is temporarily DISABLED on main tables (see migration 20251111090000)
 * - Using DEFAULT_USER_ID in domain API endpoints until full auth integration
 *
 * AUTH INTEGRATION (IN PROGRESS):
 * - Login/register flows use supabaseBrowser (client-side)
 * - Rate limiting uses supabaseAdmin (service role)
 * - Domain endpoints will be updated to extract user_id from session
 *
 * PRODUCTION MODE (FUTURE):
 * - RLS will be RE-ENABLED for security
 * - Auth middleware will extract user context from session
 * - All API endpoints will use authenticated user_id
 * - DEFAULT_USER_ID will be removed from domain services
 *
 * Note: Re-enable RLS before production deployment (see .ai/re-enable-rls-checklist.md)
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
 *
 * TEMPORARY: Used by domain API endpoints (transactions, goals, etc.) until
 * full auth integration replaces it with real authenticated user_id.
 *
 * Auth endpoints (login, register, reset-password) do NOT use this.
 * They extract user_id from Supabase Auth session or lookup by email.
 *
 * TODO: Remove after integrating auth with domain endpoints.
 */
export const DEFAULT_USER_ID = "4eef0567-df09-4a61-9219-631def0eb53e";
