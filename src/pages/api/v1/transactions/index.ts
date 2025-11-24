import type { APIContext } from "astro";
import { z } from "zod";

import { supabaseClient, DEFAULT_USER_ID } from "@/db/supabase.client";
import { CreateTransactionSchema, GetTransactionsQuerySchema } from "@/lib/schemas/transaction.schema";
import { createTransaction, listTransactions, ValidationError } from "@/lib/services/transaction.service";
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
 * POST /api/v1/transactions
 *
 * Creates a new transaction (INCOME or EXPENSE) for the authenticated user.
 *
 * Request body: CreateTransactionCommand (validated with Zod)
 * {
 *   type: "INCOME" | "EXPENSE",
 *   category_code: string,
 *   amount_cents: number (positive integer),
 *   occurred_on: string (YYYY-MM-DD, not in future),
 *   note?: string | null (max 500 chars),
 *   client_request_id: string (UUID for idempotency)
 * }
 *
 * Success response: 201 Created with TransactionDTO
 * Error responses:
 * - 400: Invalid request body (Zod validation failed)
 * - 409: Duplicate client_request_id (idempotency conflict)
 * - 422: Business validation failed (invalid category, date, etc.)
 * - 500: Unexpected server error
 *
 * Note: Authentication is temporarily disabled. Using DEFAULT_USER_ID.
 * Auth will be implemented comprehensively in a future iteration.
 */
export async function POST(context: APIContext) {
  try {
    // Parse request body
    const body = await context.request.json();

    // Validate with Zod schema
    const command = CreateTransactionSchema.parse(body);

    // Call service layer to create transaction
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const transaction = await createTransaction(supabaseClient, DEFAULT_USER_ID, command);

    // Return 201 Created with TransactionDTO
    return new Response(JSON.stringify(transaction), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle Zod validation errors (400 Bad Request)
    if (error instanceof z.ZodError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid request body",
        details: formatZodErrors(error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle business validation errors (422 Unprocessable Entity)
    if (error instanceof ValidationError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Unprocessable Entity",
        message: error.message,
        details: error.details,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle unique constraint violation (409 Conflict)
    // PostgreSQL error code 23505 = unique_violation
    // ESLint reports an error for 'any' because it disables type checking, making code less safe and maintainable.
    // Instead, you can use 'unknown' and type guard to access error properties safely:
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: unknown }).code === "23505"
    ) {
      const errorResponse: ErrorResponseDTO = {
        error: "Conflict",
        message: "Transaction with this client_request_id already exists",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle all other unexpected errors (500 Internal Server Error)
    // eslint-disable-next-line no-console
    console.error("Unexpected error in POST /api/v1/transactions:", error);
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

/**
 * GET /api/v1/transactions
 *
 * List user transactions with filtering and pagination.
 *
 * Query parameters:
 * - month (optional): Filter by month in YYYY-MM format (e.g., "2025-01")
 * - type (optional): Filter by type (INCOME, EXPENSE, ALL) - default: ALL
 * - category (optional): Filter by category code
 * - search (optional): Full-text search in notes
 * - cursor (optional): Pagination cursor (base64-encoded)
 * - limit (optional): Records per page (default: 50, max: 100)
 *
 * Success response: 200 OK with TransactionListResponseDTO
 * {
 *   data: TransactionDTO[],
 *   pagination: { next_cursor, has_more, limit },
 *   meta: { total_amount_cents, count }
 * }
 *
 * Error responses:
 * - 400: Invalid query parameters
 * - 500: Unexpected server error
 *
 * Note: Authentication is temporarily disabled. Using DEFAULT_USER_ID.
 */
export async function GET(context: APIContext) {
  try {
    // Parse query parameters from URL
    const url = new URL(context.request.url);
    const queryParams = {
      month: url.searchParams.get("month") || undefined,
      type: url.searchParams.get("type") || undefined,
      category: url.searchParams.get("category") || undefined,
      search: url.searchParams.get("search") || undefined,
      cursor: url.searchParams.get("cursor") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    };

    // Validate with Zod schema
    const filters = GetTransactionsQuerySchema.parse(queryParams);

    // Call service layer to list transactions
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const result = await listTransactions(supabaseClient, DEFAULT_USER_ID, filters);

    // Return 200 OK with TransactionListResponseDTO
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle Zod validation errors (400 Bad Request)
    if (error instanceof z.ZodError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid query parameters",
        details: formatZodErrors(error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle business validation errors (400 Bad Request for cursor)
    if (error instanceof ValidationError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: error.message,
        details: error.details,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle all other unexpected errors (500 Internal Server Error)
    // eslint-disable-next-line no-console
    console.error("Unexpected error in GET /api/v1/transactions:", error);
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
