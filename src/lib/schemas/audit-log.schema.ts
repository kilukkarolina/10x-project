// src/lib/schemas/audit-log.schema.ts

import { z } from "zod";

/**
 * Schema for validating query parameters for GET /api/v1/audit-log endpoint
 *
 * All parameters are optional and used for filtering the audit log entries.
 * Cursor-based pagination is used for efficient browsing of large datasets.
 */
export const AuditLogQueryParamsSchema = z.object({
  /**
   * Filter by entity type
   * @example "transaction"
   */
  entity_type: z.enum(["transaction", "goal", "goal_event"]).optional(),

  /**
   * Filter by specific entity ID (UUID v4)
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  entity_id: z.string().uuid().optional(),

  /**
   * Filter by action type
   * @example "UPDATE"
   */
  action: z.enum(["CREATE", "UPDATE", "DELETE"]).optional(),

  /**
   * Filter from date (inclusive) - ISO 8601 timestamp
   * @example "2025-01-01T00:00:00Z"
   */
  from_date: z.string().datetime().optional(),

  /**
   * Filter to date (inclusive) - ISO 8601 timestamp
   * @example "2025-01-31T23:59:59Z"
   */
  to_date: z.string().datetime().optional(),

  /**
   * Pagination cursor (Base64 encoded string)
   * Contains: { performed_at: string, id: string }
   */
  cursor: z.string().optional(),

  /**
   * Number of records per page
   * @minimum 1
   * @maximum 100
   * @default 50
   */
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Inferred TypeScript type from the validation schema
 */
export type AuditLogQueryParams = z.infer<typeof AuditLogQueryParamsSchema>;
