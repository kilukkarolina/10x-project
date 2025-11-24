import type { APIRoute } from "astro";
import { PriorityGoalMetricsQuerySchema } from "@/lib/schemas/priority-goal-metrics.schema";
import { getPriorityGoalMetrics } from "@/lib/services/goal.service";
import { supabaseClient, DEFAULT_USER_ID } from "@/db/supabase.client";

/**
 * GET /api/v1/metrics/priority-goal
 *
 * Returns priority goal progress with monthly change calculation.
 *
 * Query Parameters:
 * - month (optional): Month in YYYY-MM format (default: current month)
 *
 * Success Response: 200 OK
 * {
 *   "goal_id": "uuid",
 *   "name": "Wakacje w Grecji",
 *   "type_code": "VACATION",
 *   "type_label": "Wakacje",
 *   "target_amount_cents": 500000,
 *   "current_balance_cents": 175000,
 *   "progress_percentage": 35.0,
 *   "monthly_change_cents": 50000,
 *   "month": "2025-01"
 * }
 *
 * Error Responses:
 * - 400 Bad Request: Invalid month format
 * - 404 Not Found: No priority goal set
 * - 500 Internal Server Error: Database error
 *
 * Note: Currently using DEFAULT_USER_ID for development.
 * Authentication will be implemented later.
 */

export const GET: APIRoute = async (context) => {
  const userId = DEFAULT_USER_ID;
  const supabase = supabaseClient;

  try {
    // Step 2: Extract and validate query parameters
    const url = new URL(context.request.url);
    const monthParam = url.searchParams.get("month");

    // Build query object for validation
    const queryParams = monthParam ? { month: monthParam } : {};

    const validatedQuery = PriorityGoalMetricsQuerySchema.safeParse(queryParams);

    if (!validatedQuery.success) {
      const errors = validatedQuery.error.flatten();
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "Invalid query parameters",
          details: errors.fieldErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Step 3: Determine month (use current if not provided)
    const month = validatedQuery.data.month || new Date().toISOString().slice(0, 7);

    // Step 4: Call service layer
    const result = await getPriorityGoalMetrics(supabase, userId, month);

    // Step 5: Handle not found case
    if (!result) {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "No priority goal set",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Step 6: Return success response
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Step 7: Handle unexpected errors
    // eslint-disable-next-line no-console
    console.error("Error in GET /api/v1/metrics/priority-goal:", error);

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "An unexpected error occurred",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const prerender = false;
