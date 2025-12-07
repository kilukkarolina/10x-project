import type { APIContext } from "astro";
import { z } from "zod";

import {
  GetTransactionByIdParamsSchema,
  UpdateTransactionParamsSchema,
  UpdateTransactionSchema,
  DeleteTransactionParamsSchema,
} from "@/lib/schemas/transaction.schema";
import {
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  ValidationError,
} from "@/lib/services/transaction.service";
import { AuthService } from "@/lib/services/auth.service";
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
 * - 401: Unauthorized (not logged in)
 * - 400: Invalid transaction ID format (not a valid UUID)
 * - 404: Transaction not found or soft-deleted
 * - 500: Unexpected server error
 */
export async function GET(context: APIContext) {
  try {
    // Get authenticated user ID
    const userIdOrResponse = await AuthService.getUserIdOrUnauthorized(context);
    if (userIdOrResponse instanceof Response) {
      return userIdOrResponse;
    }
    const userId = userIdOrResponse;

    // Step 1: Parse and validate path parameter
    const params = GetTransactionByIdParamsSchema.parse(context.params);

    // Step 2: Call service layer to get transaction
    const transaction = await getTransactionById(context.locals.supabase, userId, params.id);

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

/**
 * PATCH /api/v1/transactions/:id
 *
 * Update an existing transaction. Supports partial updates (all fields optional).
 * Cannot change transaction type - use DELETE + POST instead.
 * Changing occurred_on to different month triggers backdate recalculation.
 *
 * Path parameters:
 * - id: Transaction UUID (validated with Zod)
 *
 * Request body (all optional):
 * {
 *   category_code?: string;
 *   amount_cents?: number;
 *   occurred_on?: string;  // YYYY-MM-DD
 *   note?: string | null;
 * }
 *
 * Success response: 200 OK with TransactionDTO
 * {
 *   id: "uuid-string",
 *   type: "EXPENSE",
 *   category_code: "RESTAURANTS",
 *   category_label: "Restauracje",
 *   amount_cents: 18000,
 *   occurred_on: "2025-01-14",
 *   note: "Kolacja w restauracji",
 *   created_at: "2025-01-15T18:30:00Z",
 *   updated_at: "2025-01-16T10:00:00Z",
 *   backdate_warning: true  // Only present if month changed
 * }
 *
 * Error responses:
 * - 400: Invalid request data (Zod validation failed)
 * - 404: Transaction not found or soft-deleted
 * - 401: Unauthorized (not logged in)
 * - 422: Business validation failed (category invalid, etc.)
 * - 500: Unexpected server error
 */
export async function PATCH(context: APIContext) {
  try {
    // Get authenticated user ID
    const userIdOrResponse = await AuthService.getUserIdOrUnauthorized(context);
    if (userIdOrResponse instanceof Response) {
      return userIdOrResponse;
    }
    const userId = userIdOrResponse;

    // Step 1: Parse and validate path parameter
    const params = UpdateTransactionParamsSchema.parse(context.params);

    // Step 2: Parse and validate request body
    const body = await context.request.json();
    const command = UpdateTransactionSchema.parse(body);

    // Step 3: Call service layer to update transaction
    const transaction = await updateTransaction(context.locals.supabase, userId, params.id, command);

    // Step 4: Handle not found case
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

    // Step 5: Return success response
    return new Response(JSON.stringify(transaction), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle Zod validation errors (400 Bad Request)
    if (error instanceof z.ZodError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid request data",
        details: formatZodErrors(error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle ValidationError from service layer (422 Unprocessable Entity)
    if (error instanceof ValidationError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Unprocessable Entity",
        message: "Validation failed",
        details: error.details,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle all other unexpected errors (500 Internal Server Error)
    // eslint-disable-next-line no-console
    console.error("Unexpected error in PATCH /api/v1/transactions/:id:", error);
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
 * DELETE /api/v1/transactions/:id
 *
 * Soft-delete an existing transaction.
 * Sets deleted_at and deleted_by fields instead of physically removing the record.
 * This allows for data recovery and audit trail.
 *
 * Path parameters:
 * - id: Transaction UUID (validated with Zod)
 *
 * Success response: 204 No Content (empty body)
 *
 * Error responses:
 * - 400: Invalid transaction ID format (not a valid UUID)
 * - 401: Unauthorized (not logged in)
 * - 404: Transaction not found, already deleted, or belongs to different user
 * - 500: Unexpected server error
 *
 * Idempotency: Calling DELETE multiple times on the same transaction
 * will return 404 after the first successful deletion.
 */
export async function DELETE(context: APIContext) {
  try {
    // Get authenticated user ID
    const userIdOrResponse = await AuthService.getUserIdOrUnauthorized(context);
    if (userIdOrResponse instanceof Response) {
      return userIdOrResponse;
    }
    const userId = userIdOrResponse;

    // Step 1: Parse and validate path parameter
    const params = DeleteTransactionParamsSchema.parse(context.params);

    // Step 2: Call service layer to soft-delete transaction
    const deleted = await deleteTransaction(context.locals.supabase, userId, params.id);

    // Step 4: Handle not found case
    if (!deleted) {
      const errorResponse: ErrorResponseDTO = {
        error: "Not Found",
        message: "Transaction not found or has been deleted",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 5: Return success response (204 No Content)
    return new Response(null, {
      status: 204,
      // No Content-Type header needed for 204
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
    console.error("Unexpected error in DELETE /api/v1/transactions/:id:", error);
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
