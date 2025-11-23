import type { APIContext } from "astro";
import { z } from "zod";

import { supabaseClient, DEFAULT_USER_ID } from "@/db/supabase.client";
import { GetGoalByIdParamsSchema, GetGoalByIdQuerySchema } from "@/lib/schemas/goal.schema";
import { getGoalById } from "@/lib/services/goal.service";
import type { ErrorResponseDTO } from "@/types";

// Disable static rendering for API endpoint
export const prerender = false;

/**
 * Formats Zod validation errors into a flat object
 * Converts error.errors array into key-value pairs for API response
 *
 * @param error - ZodError instance from failed validation
 * @returns Record<string, string> - Flat object with field paths as keys
 */
function formatZodErrors(error: z.ZodError): Record<string, string> {
  const formatted: Record<string, string> = {};
  error.errors.forEach((err) => {
    const path = err.path.join(".");
    formatted[path] = err.message;
  });
  return formatted;
}

/**
 * GET /api/v1/goals/:id
 *
 * Retrieves detailed information about a specific goal.
 *
 * Path parameters:
 * - id (required, UUID): Goal identifier
 *
 * Query parameters:
 * - include_events (optional, boolean): Include goal events history (default: true)
 *   Accepts: true, false, "true", "false", "1", "0"
 * - month (optional, string): Filter events by month in YYYY-MM format
 *
 * Success response: 200 OK with GoalDetailDTO
 * {
 *   id: string,
 *   name: string,
 *   type_code: string,
 *   type_label: string,
 *   target_amount_cents: number,
 *   current_balance_cents: number,
 *   progress_percentage: number,
 *   is_priority: boolean,
 *   archived_at: string | null,
 *   created_at: string,
 *   updated_at: string,
 *   events: GoalEventInDetailDTO[],
 *   monthly_change_cents: number
 * }
 *
 * Error responses:
 * - 400: Invalid path parameter or query parameters (Zod validation failed)
 * - 404: Goal not found or doesn't belong to user
 * - 500: Unexpected server error
 *
 * Note: Authentication is temporarily disabled. Using DEFAULT_USER_ID.
 * Auth will be implemented comprehensively in a future iteration.
 */
export async function GET(context: APIContext) {
  try {
    // Step 1: Validate path parameter (goal ID)
    const paramsValidation = GetGoalByIdParamsSchema.safeParse({ id: context.params.id });

    if (!paramsValidation.success) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid goal ID format",
        details: formatZodErrors(paramsValidation.error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 2: Validate query parameters
    const url = new URL(context.request.url);
    const queryParams = {
      include_events: url.searchParams.get("include_events"),
      month: url.searchParams.get("month"),
    };

    const queryValidation = GetGoalByIdQuerySchema.safeParse(queryParams);

    if (!queryValidation.success) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid query parameters",
        details: formatZodErrors(queryValidation.error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 3: Call service layer to fetch goal details
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const goal = await getGoalById(
      supabaseClient,
      DEFAULT_USER_ID,
      paramsValidation.data.id,
      queryValidation.data.include_events ?? true,
      queryValidation.data.month
    );

    // Step 4: Return 404 if goal doesn't exist
    if (!goal) {
      const errorResponse: ErrorResponseDTO = {
        error: "Not Found",
        message: "Goal not found",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 5: Return 200 OK with GoalDetailDTO
    return new Response(JSON.stringify(goal), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle all unexpected errors (500 Internal Server Error)
    // eslint-disable-next-line no-console
    console.error("Unexpected error in GET /api/v1/goals/:id:", error);
    const errorResponse: ErrorResponseDTO = {
      error: "Internal Server Error",
      message: "An unexpected error occurred. Please try again later.",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
