import type { APIContext } from "astro";
import { z } from "zod";

import { AuthService } from "@/lib/services/auth.service";
import { GetMonthlyMetricsQuerySchema } from "@/lib/schemas/monthly-metrics.schema";
import { getMonthlyMetrics } from "@/lib/services/monthly-metrics.service";
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
 * GET /api/v1/metrics/monthly
 *
 * Retrieves aggregated monthly financial metrics for the authenticated user.
 *
 * Query parameters:
 * - month (required): Month to retrieve in YYYY-MM format (e.g., "2025-01")
 *
 * Success response: 200 OK with MonthlyMetricsDTO
 * {
 *   month: "2025-01",
 *   income_cents: 450000,
 *   expenses_cents: 235000,
 *   net_saved_cents: 50000,
 *   free_cash_flow_cents: 165000,
 *   free_cash_flow_formula: "Dochód (4,500.00 PLN) - ...",
 *   refreshed_at: "2025-01-16T10:00:00Z"
 * }
 *
 * If no data exists for the specified month, returns zeros:
 * {
 *   month: "2025-01",
 *   income_cents: 0,
 *   expenses_cents: 0,
 *   net_saved_cents: 0,
 *   free_cash_flow_cents: 0,
 *   free_cash_flow_formula: "Dochód (0.00 PLN) - ...",
 *   refreshed_at: null
 * }
 *
 * Error responses:
 * - 400: Invalid query parameters (missing month, wrong format, future month)
 * - 401: Unauthorized (not logged in)
 * - 500: Unexpected server error
 *
 * @param context - Astro API context
 * @returns Response with metrics data or error
 */
export async function GET(context: APIContext): Promise<Response> {
  try {
    // Step 1: Extract and validate query parameters
    const url = new URL(context.request.url);
    const queryParams = {
      month: url.searchParams.get("month"),
    };

    // Validate with Zod schema
    let validatedQuery;
    try {
      validatedQuery = GetMonthlyMetricsQuerySchema.parse(queryParams);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorResponse: ErrorResponseDTO = {
          error: "Validation Error",
          message: "Invalid query parameters",
          details: formatZodErrors(error),
        };

        return new Response(JSON.stringify(errorResponse), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw error;
    }

    // Step 2: Get authenticated user ID
    const userIdOrResponse = await AuthService.getUserIdOrUnauthorized(context);
    if (userIdOrResponse instanceof Response) {
      return userIdOrResponse;
    }
    const userId = userIdOrResponse;

    // Step 3: Fetch monthly metrics from service layer
    const metrics = await getMonthlyMetrics(context.locals.supabase, userId, validatedQuery.month);

    // Step 4: Return success response
    return new Response(JSON.stringify(metrics), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Cache for 5 minutes (metrics are pre-aggregated and rarely change)
        "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    // Step 5: Handle unexpected errors
    console.error("Error in GET /api/v1/metrics/monthly:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

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
