import type { SupabaseAdminClient } from "@/db/supabase.admin";

/**
 * Rate limit scopes matching the 'action' column in rate_limits table
 */
export type RateLimitScope = "reset_password";

/**
 * Rate limit result for client communication
 */
export interface RateLimitResult {
  allowed: boolean;
  retry_after_seconds?: number;
  attempts_count?: number;
}

/**
 * RateLimitService - Handles rate limiting for sensitive auth operations
 *
 * Uses the rate_limits table with 30-minute bucket granularity:
 * - Limit: 3 attempts per 30 minutes per user+action
 * - Uses service role client to bypass RLS
 * - Thread-safe through database-level locking
 *
 * Implementation details:
 * - bucket_30m is auto-calculated by database trigger
 * - Index idx_rl_bucket optimizes count queries
 * - Only enforces limit if user_id can be resolved
 */
export class RateLimitService {
  /**
   * Maximum attempts allowed per 30-minute window
   */
  private static readonly MAX_ATTEMPTS = 3;

  /**
   * Window duration in seconds (30 minutes)
   */
  private static readonly WINDOW_SECONDS = 30 * 60;

  /**
   * Check rate limit and record attempt if allowed
   *
   * @param supabase - Admin client with service role key
   * @param userId - UUID of the user attempting the action
   * @param scope - Type of action (reset_password)
   * @returns RateLimitResult indicating if allowed and retry time
   */
  static async checkAndRecord(
    supabase: SupabaseAdminClient,
    userId: string,
    scope: RateLimitScope
  ): Promise<RateLimitResult> {
    try {
      // Calculate current 30-minute bucket
      const now = new Date();
      const bucketStart = new Date(
        Math.floor(now.getTime() / (1000 * this.WINDOW_SECONDS)) * (1000 * this.WINDOW_SECONDS)
      );
      const bucketEnd = new Date(bucketStart.getTime() + this.WINDOW_SECONDS * 1000);

      // Count attempts in current bucket
      const { data: attempts, error: countError } = await supabase
        .from("rate_limits")
        .select("occurred_at", { count: "exact" })
        .eq("user_id", userId)
        .eq("action", scope)
        .gte("occurred_at", bucketStart.toISOString())
        .lt("occurred_at", bucketEnd.toISOString());

      if (countError) {
        // eslint-disable-next-line no-console
        console.error("[RateLimitService] Error counting attempts:", countError);
        // On error, allow the request (fail open for better UX)
        return { allowed: true };
      }

      const attemptsCount = attempts?.length || 0;

      // Check if limit exceeded
      if (attemptsCount >= this.MAX_ATTEMPTS) {
        // Calculate seconds until bucket expires
        const retryAfterSeconds = Math.ceil((bucketEnd.getTime() - now.getTime()) / 1000);

        return {
          allowed: false,
          retry_after_seconds: retryAfterSeconds,
          attempts_count: attemptsCount,
        };
      }

      // Record this attempt
      const { error: insertError } = await supabase.from("rate_limits").insert({
        user_id: userId,
        action: scope,
        occurred_at: now.toISOString(),
      });

      if (insertError) {
        // eslint-disable-next-line no-console
        console.error("[RateLimitService] Error recording attempt:", insertError);
        // Still allow the request even if we couldn't record it
      }

      return {
        allowed: true,
        attempts_count: attemptsCount + 1,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[RateLimitService] Unexpected error:", error);
      // Fail open - allow the request
      return { allowed: true };
    }
  }

  /**
   * Resolve user_id from email using admin API
   *
   * @param supabase - Admin client with service role key
   * @param email - Email address to lookup
   * @returns user_id if found, null otherwise
   */
  static async getUserIdByEmail(supabase: SupabaseAdminClient, email: string): Promise<string | null> {
    try {
      const normalizedEmail = email.trim().toLowerCase();

      // Use Supabase Admin API to list users by email
      const { data, error } = await supabase.auth.admin.listUsers();

      if (error) {
        // eslint-disable-next-line no-console
        console.error("[RateLimitService] Error listing users:", error);
        return null;
      }

      // Find user by email (case-insensitive match)
      const user = data.users.find((u) => u.email?.toLowerCase() === normalizedEmail);

      return user?.id || null;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[RateLimitService] Error resolving user by email:", error);
      return null;
    }
  }
}
