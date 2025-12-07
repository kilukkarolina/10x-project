import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    `Missing Supabase Admin configuration. Please check .env file has:\n` +
      `PUBLIC_SUPABASE_URL=your_project_url\n` +
      `SUPABASE_SERVICE_ROLE_KEY=your_service_role_key\n\n` +
      `Current values: URL=${supabaseUrl ? "SET" : "MISSING"}, SERVICE_ROLE_KEY=${supabaseServiceRoleKey ? "SET" : "MISSING"}`
  );
}

/**
 * Supabase Admin client with service role key
 *
 * SECURITY WARNING: This client bypasses Row Level Security (RLS)
 * and has full database access. Use ONLY in server-side code.
 *
 * Usage:
 * - Rate limiting operations (write to rate_limits table)
 * - User lookup by email (auth.admin API)
 * - Email generation/resend operations
 * - Any operations requiring elevated privileges
 *
 * NEVER:
 * - Expose this client to the browser
 * - Use in client-side components
 * - Include in browser bundles
 *
 * Storage:
 * - No session persistence
 * - No auto token refresh (not needed for service role)
 */
export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export type SupabaseAdminClient = typeof supabaseAdmin;
