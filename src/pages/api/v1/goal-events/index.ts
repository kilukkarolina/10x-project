import type { APIContext } from "astro";
import { z } from "zod";

import { supabaseClient, DEFAULT_USER_ID } from "@/db/supabase.client";
import { CreateGoalEventSchema, ListGoalEventsQuerySchema } from "@/lib/schemas/goal-event.schema";
import { createGoalEvent, listGoalEvents, NotFoundError, ValidationError } from "@/lib/services/goal-event.service";
import type { ErrorResponseDTO } from "@/types";

// Disable static rendering for API endpoint
export const prerender = false;

/**
 * GET /api/v1/goal-events
 *
 * Lists goal events for authenticated user with filtering and pagination.
 * Supports cursor-based pagination for efficient navigation through large datasets.
 *
 * Query parameters (all optional):
 * - goal_id: Filter by specific goal (UUID)
 * - month: Filter by month (YYYY-MM format, e.g., "2025-01")
 * - type: Filter by type (DEPOSIT | WITHDRAW)
 * - cursor: Pagination cursor (base64-encoded, from previous response)
 * - limit: Records per page (default: 50, max: 100)
 *
 * Success response: 200 OK with GoalEventListResponseDTO
 * {
 *   data: GoalEventDTO[],
 *   pagination: {
 *     next_cursor: string | null,
 *     has_more: boolean,
 *     limit: number
 *   }
 * }
 *
 * Error responses:
 * - 400: Invalid query parameters (Zod validation) or invalid cursor
 * - 401: Unauthorized (future - authentication required)
 * - 500: Unexpected server error
 *
 * Note: Authentication is temporarily disabled. Using DEFAULT_USER_ID.
 * Auth will be implemented comprehensively in a future iteration.
 */
export async function GET(context: APIContext) {
  try {
    // 1. Extract query parameters from URL
    const url = new URL(context.request.url);
    const queryParams = {
      goal_id: url.searchParams.get("goal_id") || undefined,
      month: url.searchParams.get("month") || undefined,
      type: url.searchParams.get("type") || undefined,
      cursor: url.searchParams.get("cursor") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    };

    // 2. Validate with Zod schema
    const validated = ListGoalEventsQuerySchema.safeParse(queryParams);

    if (!validated.success) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid query parameters",
        details: formatZodErrors(validated.error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Call service layer to list goal events
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const result = await listGoalEvents(supabaseClient, DEFAULT_USER_ID, {
      goalId: validated.data.goal_id,
      month: validated.data.month,
      type: validated.data.type,
      cursor: validated.data.cursor,
      limit: validated.data.limit,
    });

    // 4. Return 200 OK with GoalEventListResponseDTO
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle ValidationError (invalid cursor)
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
    console.error("Unexpected error in GET /api/v1/goal-events:", error);
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
 * POST /api/v1/goal-events
 *
 * Creates a new goal event (deposit or withdrawal) for the authenticated user.
 * This endpoint calls a PostgreSQL RPC function that atomically:
 * - Validates goal ownership and status
 * - Locks the goal row to prevent race conditions
 * - Validates withdrawal balance constraints
 * - Inserts the goal_event with idempotency (via client_request_id)
 * - Updates the goal's current_balance_cents
 * - Triggers automatic recalculation of monthly_metrics
 *
 * Request body: CreateGoalEventCommand (validated with Zod)
 * {
 *   goal_id: string (UUID),
 *   type: "DEPOSIT" | "WITHDRAW",
 *   amount_cents: number (positive integer),
 *   occurred_on: string (YYYY-MM-DD, not in future),
 *   client_request_id: string (for idempotency)
 * }
 *
 * Success response: 201 Created with GoalEventDetailDTO
 * {
 *   id: string,
 *   goal_id: string,
 *   goal_name: string,
 *   type: "DEPOSIT" | "WITHDRAW",
 *   amount_cents: number,
 *   occurred_on: string,
 *   created_at: string,
 *   goal_balance_after_cents: number
 * }
 *
 * Error responses:
 * - 400: Invalid request body (Zod validation failed)
 * - 404: Goal not found, is archived, or soft-deleted
 * - 409: Conflict - duplicate client_request_id OR insufficient balance for withdrawal
 * - 422: Business validation failed (future date, etc.)
 * - 500: Unexpected server error
 *
 * Note: Authentication is temporarily disabled. Using DEFAULT_USER_ID.
 * Auth will be implemented comprehensively in a future iteration.
 */
export async function POST(context: APIContext) {
  try {
    // 1. Parse request body
    const body = await context.request.json();

    // 2. Validate with Zod schema
    const command = CreateGoalEventSchema.parse(body);

    // 3. Call service layer to create goal event
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const goalEvent = await createGoalEvent(supabaseClient, DEFAULT_USER_ID, command);

    // 4. Return 201 Created with GoalEventDetailDTO
    return new Response(JSON.stringify(goalEvent), {
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

    // Handle NotFoundError (404 Not Found)
    if (error instanceof NotFoundError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Not Found",
        message: error.message,
        details: error.details,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle ValidationError (409 Conflict or 422 Unprocessable Entity)
    if (error instanceof ValidationError) {
      // 409 Conflict: duplicate request or insufficient balance
      if (error.code === "DUPLICATE_REQUEST" || error.code === "INSUFFICIENT_BALANCE") {
        const errorResponse: ErrorResponseDTO = {
          error: "Conflict",
          message: error.message,
          details: error.details,
        };
        return new Response(JSON.stringify(errorResponse), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }

      // 422 Unprocessable Entity: business validation (future date, etc.)
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

    // Handle all other unexpected errors (500 Internal Server Error)
    // eslint-disable-next-line no-console
    console.error("Unexpected error in POST /api/v1/goal-events:", error);
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
