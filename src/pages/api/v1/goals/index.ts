import type { APIContext } from "astro";
import { z } from "zod";

import { CreateGoalSchema, ListGoalsQuerySchema } from "@/lib/schemas/goal.schema";
import { createGoal, listGoals, ValidationError } from "@/lib/services/goal.service";
import { AuthService } from "@/lib/services/auth.service";
import type { ErrorResponseDTO, GoalListResponseDTO } from "@/types";

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
 * GET /api/v1/goals
 *
 * Lists all goals for the authenticated user.
 *
 * Query parameters:
 * - include_archived (optional, boolean): Include archived goals (default: false)
 *   Accepts: true, false, "true", "false", "1", "0"
 *
 * Success response: 200 OK with GoalListResponseDTO
 * {
 *   data: GoalDTO[]
 * }
 *
 * Error responses:
 * - 401: Unauthorized (not logged in)
 * - 400: Invalid query parameters (Zod validation failed)
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

    // Parse query parameters from URL
    const url = new URL(context.request.url);
    const queryParams = {
      include_archived: url.searchParams.get("include_archived"),
    };

    // Validate with Zod schema
    const validatedQuery = ListGoalsQuerySchema.parse(queryParams);

    // Call service layer to list goals
    const goals = await listGoals(context.locals.supabase, userId, validatedQuery.include_archived ?? false);

    // Return 200 OK with GoalListResponseDTO
    const response: GoalListResponseDTO = { data: goals };
    return new Response(JSON.stringify(response), {
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

    // Handle all other unexpected errors (500 Internal Server Error)
    // eslint-disable-next-line no-console
    console.error("Unexpected error in GET /api/v1/goals:", error);
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
 * POST /api/v1/goals
 *
 * Creates a new goal for the authenticated user.
 *
 * Request body: CreateGoalCommand (validated with Zod)
 * {
 *   name: string (1-100 chars),
 *   type_code: string (must exist in goal_types and be active),
 *   target_amount_cents: number (positive integer),
 *   is_priority?: boolean (default: false, only one goal can be priority)
 * }
 *
 * Success response: 201 Created with GoalDTO
 * Error responses:
 * - 401: Unauthorized (not logged in)
 * - 400: Invalid request body (Zod validation failed)
 * - 409: Priority conflict (another goal is already priority)
 * - 422: Business validation failed (invalid type_code, etc.)
 * - 500: Unexpected server error
 */
export async function POST(context: APIContext) {
  try {
    // Get authenticated user ID
    const userIdOrResponse = await AuthService.getUserIdOrUnauthorized(context);
    if (userIdOrResponse instanceof Response) {
      return userIdOrResponse;
    }
    const userId = userIdOrResponse;

    // Parse request body
    const body = await context.request.json();

    // Validate with Zod schema
    const command = CreateGoalSchema.parse(body);

    // Call service layer to create goal
    const goal = await createGoal(context.locals.supabase, userId, command);

    // Return 201 Created with GoalDTO
    return new Response(JSON.stringify(goal), {
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

    // Handle priority conflict (409 Conflict)
    if (error instanceof ValidationError && error.details?.is_priority) {
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

    // Handle all other unexpected errors (500 Internal Server Error)
    // eslint-disable-next-line no-console
    console.error("Unexpected error in POST /api/v1/goals:", error);
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
