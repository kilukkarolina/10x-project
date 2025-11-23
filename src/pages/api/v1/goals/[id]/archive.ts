import type { APIContext } from "astro";
import { z } from "zod";

import { supabaseClient, DEFAULT_USER_ID } from "@/db/supabase.client";
import { ArchiveGoalParamsSchema } from "@/lib/schemas/goal.schema";
import { archiveGoal, ValidationError } from "@/lib/services/goal.service";
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
 * POST /api/v1/goals/:id/archive
 *
 * Archives a goal (soft archive by setting archived_at timestamp).
 *
 * Path parameters:
 * - id (required, UUID): Goal identifier
 *
 * Business rules:
 * - Goal must exist and belong to user (404 Not Found)
 * - Goal cannot be already archived (422 Unprocessable Entity)
 * - Goal cannot be priority (409 Conflict - unset priority first)
 * - Archived goals retain all historical data and events
 *
 * Success response: 200 OK with ArchiveGoalResponseDTO
 * {
 *   id: string,
 *   name: string,
 *   archived_at: string,
 *   message: string
 * }
 *
 * Error responses:
 * - 400: Invalid goal ID format (Zod validation failed)
 * - 404: Goal not found or doesn't belong to user
 * - 409: Cannot archive priority goal (unset priority first)
 * - 422: Goal is already archived
 * - 500: Unexpected server error
 *
 * Note: Authentication is temporarily disabled. Using DEFAULT_USER_ID.
 * Auth will be implemented comprehensively in a future iteration.
 */
export async function POST(context: APIContext) {
  try {
    // Step 1: Validate path parameter (goal ID)
    const paramsValidation = ArchiveGoalParamsSchema.safeParse({ id: context.params.id });

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

    // Step 2: Call service layer to archive goal
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const result = await archiveGoal(supabaseClient, DEFAULT_USER_ID, paramsValidation.data.id);

    // Step 3: Return 404 if goal doesn't exist
    if (!result) {
      const errorResponse: ErrorResponseDTO = {
        error: "Not Found",
        message: "Goal not found",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 4: Return 200 OK with ArchiveGoalResponseDTO
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle ValidationError (409 Conflict or 422 Unprocessable Entity)
    if (error instanceof ValidationError) {
      // Determine status code based on error message
      const isConflict = error.message.toLowerCase().includes("priority");
      const statusCode = isConflict ? 409 : 422;
      const errorCode = isConflict ? "Conflict" : "Unprocessable Entity";

      const errorResponse: ErrorResponseDTO = {
        error: errorCode,
        message: error.message,
        details: error.details,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: statusCode,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle all unexpected errors (500 Internal Server Error)
    // eslint-disable-next-line no-console
    console.error("Unexpected error in POST /api/v1/goals/:id/archive:", error);
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
