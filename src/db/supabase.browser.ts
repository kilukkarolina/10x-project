import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

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
 * Supabase client for browser/React components with SSR support
 *
 * Configuration:
 * - Uses createBrowserClient from @supabase/ssr
 * - Automatically manages cookies for SSR compatibility
 * - Syncs auth state between browser localStorage and cookies
 * - autoRefreshToken: true - automatically refreshes expired tokens
 *
 * Usage:
 * - Import this client in React components for auth operations
 * - signInWithPassword, signUp, signOut, etc.
 * - Auth state is automatically synced with server-side middleware
 * - Cookies are automatically set for server-side session access
 *
 * Note: This client should ONLY be used in client-side React components.
 * For server-side operations, use context.locals.supabase from middleware.
 */
export const supabaseBrowser = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);

export type SupabaseBrowserClient = typeof supabaseBrowser;
