import type { APIContext } from "astro";
import { z } from "zod";

import { supabaseClient, DEFAULT_USER_ID } from "@/db/supabase.client";
import { GetExpensesByCategoryQuerySchema } from "@/lib/schemas/expenses-by-category.schema";
import { getExpensesByCategory } from "@/lib/services/expenses-by-category.service";
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
 * GET /api/v1/metrics/expenses-by-category
 *
 * Retrieves expenses breakdown by category for a specified month.
 * For each category with expenses, returns:
 * - Category code and label
 * - Total amount in cents
 * - Percentage of total expenses
 * - Number of transactions
 *
 * Query parameters:
 * - month (required): Month in YYYY-MM format (e.g., "2025-01")
 *
 * Success response: 200 OK
 * {
 *   month: "2025-01",
 *   data: [
 *     {
 *       category_code: "GROCERIES",
 *       category_label: "Zakupy spożywcze",
 *       total_cents: 85000,
 *       percentage: 36.17,
 *       transaction_count: 12
 *     },
 *     ...
 *   ],
 *   total_expenses_cents: 235000
 * }
 *
 * If no expenses exist for the month, returns:
 * {
 *   month: "2025-01",
 *   data: [],
 *   total_expenses_cents: 0
 * }
 *
 * Error responses:
 * - 400: Invalid query parameters (missing month, wrong format, future month)
 * - 401: Authentication required (currently disabled, using DEFAULT_USER_ID)
 * - 500: Unexpected server error
 *
 * @param context - Astro API context
 * @returns Response with expenses by category or error
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
      validatedQuery = GetExpensesByCategoryQuerySchema.parse(queryParams);
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

    // Step 2: Get user ID
    // TODO: Replace with auth.getUser() when authentication is implemented
    const userId = DEFAULT_USER_ID;

    // Step 3: Fetch expenses by category from service layer
    const expenses = await getExpensesByCategory(supabaseClient, userId, validatedQuery.month);

    // Step 4: Map response to match API spec (expense_percentage → percentage)
    const response = {
      month: expenses.month,
      data: expenses.data.map((item) => ({
        category_code: item.category_code,
        category_label: item.category_label,
        total_cents: item.total_cents,
        percentage: item.expense_percentage, // Map to API spec name
        transaction_count: item.transaction_count,
      })),
      total_expenses_cents: expenses.total_expenses_cents,
    };

    // Step 5: Return success response
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Cache for 5 minutes (dashboard data, rarely changes)
        "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    // Step 6: Handle unexpected errors
    console.error("Error in GET /api/v1/metrics/expenses-by-category:", {
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
