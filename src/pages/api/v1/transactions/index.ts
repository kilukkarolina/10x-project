import type { APIContext } from "astro";
import { z } from "zod";

import { supabaseClient, DEFAULT_USER_ID } from "@/db/supabase.client";
import { CreateTransactionSchema } from "@/lib/schemas/transaction.schema";
import { createTransaction, ValidationError } from "@/lib/services/transaction.service";
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
    if ((error as any)?.code === "23505") {
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
