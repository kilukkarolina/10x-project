// src/pages/api/v1/audit-log/index.ts

import type { APIRoute } from "astro";
import { supabaseClient, DEFAULT_USER_ID } from "@/db/supabase.client";
import { AuditLogQueryParamsSchema } from "@/lib/schemas/audit-log.schema";
import { AuditLogService, CursorDecodeError } from "@/lib/services/audit-log.service";
import type { ErrorResponseDTO } from "@/types";

/**
 * Disable static rendering for API endpoint
 * This endpoint requires dynamic request handling
 */
export const prerender = false;

/**
 * GET /api/v1/audit-log
 *
 * Returns audit log history for the user with filtering and pagination.
 *
 * Query Parameters (all optional):
 * - entity_type: Filter by entity type (transaction | goal | goal_event)
 * - entity_id: Filter by specific entity UUID
 * - action: Filter by action type (CREATE | UPDATE | DELETE)
 * - from_date: Filter from date (ISO 8601 timestamp, inclusive)
 * - to_date: Filter to date (ISO 8601 timestamp, inclusive)
 * - cursor: Pagination cursor (base64-encoded)
 * - limit: Records per page (1-100, default: 50)
 *
 * Success Response: 200 OK with AuditLogListResponseDTO
 * {
 *   data: AuditLogEntryDTO[],
 *   pagination: { next_cursor, has_more, limit }
 * }
 *
 * Error Responses:
 * - 400 Bad Request: Invalid query parameters or cursor
 * - 500 Internal Server Error: Database or unexpected error
 *
 * Note:
 * - Currently using DEFAULT_USER_ID for development
 * - Authentication will be implemented comprehensively later
 * - Audit log entries are retained for 30 days
 *
 * @example
 * GET /api/v1/audit-log?entity_type=transaction&limit=25
 * GET /api/v1/audit-log?from_date=2025-01-01T00:00:00Z&to_date=2025-01-31T23:59:59Z
 */
export const GET: APIRoute = async (context) => {
  try {
    // Step 1: Validate query parameters
    const params = AuditLogQueryParamsSchema.safeParse(Object.fromEntries(context.url.searchParams));

    if (!params.success) {
      return new Response(
        JSON.stringify({
          error: "VALIDATION_ERROR",
          message: "Invalid query parameters",
          details: params.error.flatten().fieldErrors,
        } as ErrorResponseDTO),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 2: Call service to get audit log entries
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const result = await AuditLogService.list(supabaseClient, DEFAULT_USER_ID, params.data);

    // Step 3: Return success response
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle cursor decode errors (400 Bad Request)
    if (error instanceof CursorDecodeError) {
      return new Response(
        JSON.stringify({
          error: "INVALID_CURSOR",
          message: "Invalid pagination cursor",
        } as ErrorResponseDTO),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log unexpected errors for debugging
    // eslint-disable-next-line no-console
    console.error("Error in GET /api/v1/audit-log:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Generic server error response (500 Internal Server Error)
    return new Response(
      JSON.stringify({
        error: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
      } as ErrorResponseDTO),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
