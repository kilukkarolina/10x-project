import type { APIContext } from "astro";
import { z } from "zod";

import { supabaseClient, DEFAULT_USER_ID } from "@/db/supabase.client";
import { GetTransactionByIdParamsSchema } from "@/lib/schemas/transaction.schema";
import { getTransactionById } from "@/lib/services/transaction.service";
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
 * GET /api/v1/transactions/:id
 *
 * Get details of a single transaction by its UUID.
 *
 * Path parameters:
 * - id: Transaction UUID (validated with Zod)
 *
 * Success response: 200 OK with TransactionDTO
 * {
 *   id: "uuid-string",
 *   type: "EXPENSE",
 *   category_code: "GROCERIES",
 *   category_label: "Zakupy spożywcze",
 *   amount_cents: 15750,
 *   occurred_on: "2025-01-15",
 *   note: "Zakupy w Biedronce",
 *   created_at: "2025-01-15T18:30:00Z",
 *   updated_at: "2025-01-15T18:30:00Z"
 * }
 *
 * Error responses:
 * - 400: Invalid transaction ID format (not a valid UUID)
 * - 404: Transaction not found or soft-deleted
 * - 500: Unexpected server error
 *
 * Note: Authentication is temporarily disabled. Using DEFAULT_USER_ID.
 * Auth will be implemented comprehensively in a future iteration.
 */
export async function GET(context: APIContext) {
  try {
    // Step 1: Parse and validate path parameter
    const params = GetTransactionByIdParamsSchema.parse(context.params);

    // Step 2: Call service layer to get transaction
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const transaction = await getTransactionById(supabaseClient, DEFAULT_USER_ID, params.id);

    // Step 3: Handle not found case
    if (!transaction) {
      const errorResponse: ErrorResponseDTO = {
        error: "Not Found",
        message: "Transaction not found or has been deleted",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 4: Return success response
    return new Response(JSON.stringify(transaction), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle Zod validation errors (400 Bad Request)
    if (error instanceof z.ZodError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid transaction ID format",
        details: formatZodErrors(error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle all other unexpected errors (500 Internal Server Error)
    // eslint-disable-next-line no-console
    console.error("Unexpected error in GET /api/v1/transactions/:id:", error);
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
