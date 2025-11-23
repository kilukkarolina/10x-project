// src/pages/api/v1/goal-types/index.ts

import type { APIRoute } from "astro";
import { getActiveGoalTypes } from "@/lib/services/goal-type.service";
import type { GoalTypeListResponseDTO, ErrorResponseDTO } from "@/types";

// Disable prerendering for API routes
export const prerender = false;

/**
 * GET /api/v1/goal-types
 * List all active goal types
 *
 * Public endpoint - no authentication required
 * Response is cached for 1 hour
 *
 * Note: Authentication is temporarily disabled for development.
 * Auth will be implemented comprehensively in a future iteration.
 *
 * @returns 200 OK with list of active goal types
 * @returns 500 Internal Server Error on database or unexpected errors
 */
export const GET: APIRoute = async ({ locals }) => {
  try {
    // 1. Fetch goal types from service
    const goalTypes = await getActiveGoalTypes(locals.supabase);

    // 2. Build and return success response
    const response: GoalTypeListResponseDTO = {
      data: goalTypes,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    // 3. Handle unexpected errors
    console.error("[GET /api/v1/goal-types] Unexpected error:", error);

    const errorResponse: ErrorResponseDTO = {
      error: "internal_error",
      message: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.",
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
