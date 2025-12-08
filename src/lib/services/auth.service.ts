import type { APIContext } from "astro";
import type { SupabaseClient } from "@/db/supabase.client";

/**
 * AuthService - Helper functions for authentication in API endpoints
 *
 * Provides utilities for extracting and validating user sessions
 * in server-side API routes.
 *
 * Note: Using class with static methods as a namespace alternative
 * for better tree-shaking and explicit imports.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AuthService {
  /**
   * Get authenticated user ID from request
   *
   * Extracts user_id from Supabase session by reading auth cookies.
   * Uses the server-side Supabase client (anon key, no persistence).
   *
   * Usage in API endpoints:
   * ```typescript
   * const userId = await AuthService.getUserId(context);
   * if (!userId) {
   *   return new Response(JSON.stringify({ error: "Unauthorized" }), {
   *     status: 401,
   *     headers: { "Content-Type": "application/json" }
   *   });
   * }
   * ```
   *
   * @param context - Astro API context
   * @returns user_id if authenticated, null otherwise
   */
  static async getUserId(context: APIContext): Promise<string | null> {
    try {
      const supabase = context.locals.supabase;

      // Get session from cookies (Supabase automatically reads auth cookies)
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error || !session) {
        return null;
      }

      return session.user.id;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[AuthService] Error getting user ID:", error);
      return null;
    }
  }

  /**
   * Get authenticated user ID or return error response
   *
   * Convenience method that combines getUserId() with 401 error response.
   * Returns either the user_id or a Response object (401 Unauthorized).
   *
   * Usage in API endpoints:
   * ```typescript
   * const userIdOrResponse = await AuthService.getUserIdOrUnauthorized(context);
   * if (userIdOrResponse instanceof Response) {
   *   return userIdOrResponse; // Return 401
   * }
   * const userId = userIdOrResponse; // String
   * ```
   *
   * @param context - Astro API context
   * @returns user_id (string) or 401 Response
   */
  static async getUserIdOrUnauthorized(context: APIContext): Promise<string | Response> {
    try {
      const supabase = context.locals.supabase;

      // Get session from cookies
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      // No session at all
      if (error || !session) {
        return new Response(
          JSON.stringify({
            error: "Unauthorized",
            message: "Musisz być zalogowany, aby wykonać tę operację.",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      return session.user.id;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[AuthService] Error in getUserIdOrUnauthorized:", error);
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Musisz być zalogowany, aby wykonać tę operację.",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  /**
   * Get user session for more detailed info
   *
   * Returns full session object including user metadata, email, etc.
   * Use sparingly - most endpoints only need user_id.
   *
   * @param supabase - Supabase client
   * @returns Session object or null
   */
  static async getSession(supabase: SupabaseClient) {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error || !session) {
        return null;
      }

      return session;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[AuthService] Error getting session:", error);
      return null;
    }
  }
}
