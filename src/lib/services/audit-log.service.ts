// src/lib/services/audit-log.service.ts

import type { SupabaseClient } from "@/db/supabase.client";
import type { AuditLogQueryParams } from "@/lib/schemas/audit-log.schema";
import type { AuditLogListResponseDTO, AuditLogEntryDTO } from "@/types";

/**
 * Custom error class for cursor decoding failures
 * Thrown when a pagination cursor is invalid or corrupted
 */
export class CursorDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CursorDecodeError";
  }
}

/**
 * Structure of the decoded pagination cursor
 * Used for keyset pagination based on (performed_at DESC, id DESC)
 */
interface DecodedCursor {
  performed_at: string;
  id: string;
}

/**
 * Service for managing audit log operations
 * Provides methods for listing and filtering audit log entries with cursor-based pagination
 */
export const AuditLogService = {
  /**
   * List audit log entries with filtering and pagination
   *
   * @param supabase - Supabase client
   * @param userId - User ID to filter audit log entries
   * @param params - Query parameters for filtering and pagination
   * @returns Promise resolving to paginated list of audit log entries
   *
   * @throws {CursorDecodeError} When pagination cursor is invalid
   * @throws {Error} When database operation fails
   *
   * @example
   * ```typescript
   * const result = await AuditLogService.list(supabase, userId, {
   *   entity_type: "transaction",
   *   limit: 25
   * });
   * ```
   */
  async list(supabase: SupabaseClient, userId: string, params: AuditLogQueryParams): Promise<AuditLogListResponseDTO> {
    const { entity_type, entity_id, action, from_date, to_date, cursor, limit } = params;

    // Decode cursor if provided
    let decodedCursor: DecodedCursor | null = null;
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, "base64").toString("utf-8");
        decodedCursor = JSON.parse(decoded);

        // Validate cursor structure
        if (!decodedCursor?.performed_at || !decodedCursor?.id) {
          throw new Error("Invalid cursor structure");
        }
      } catch {
        throw new CursorDecodeError("Failed to decode pagination cursor");
      }
    }

    // Build query - start with selecting required fields and filter by user
    let query = supabase
      .from("audit_log")
      .select("id, entity_type, entity_id, action, before, after, performed_at")
      .eq("owner_user_id", userId);

    // Apply optional filters dynamically
    if (entity_type) {
      query = query.eq("entity_type", entity_type);
    }
    if (entity_id) {
      query = query.eq("entity_id", entity_id);
    }
    if (action) {
      query = query.eq("action", action);
    }
    if (from_date) {
      query = query.gte("performed_at", from_date);
    }
    if (to_date) {
      query = query.lte("performed_at", to_date);
    }

    // Apply cursor pagination (keyset pagination)
    // Logic: (performed_at < cursor.performed_at) OR (performed_at = cursor.performed_at AND id < cursor.id)
    if (decodedCursor) {
      query = query.or(
        `performed_at.lt.${decodedCursor.performed_at},and(performed_at.eq.${decodedCursor.performed_at},id.lt.${decodedCursor.id})`
      );
    }

    // Order by performed_at DESC, then id DESC for stable pagination
    // Fetch limit + 1 to determine if there are more results
    query = query
      .order("performed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    // Execute query
    const { data, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // Determine if there are more results
    const has_more = data.length > limit;
    const results = has_more ? data.slice(0, limit) : data;

    // Generate next cursor if there are more results
    let next_cursor: string | null = null;
    if (has_more && results.length > 0) {
      const lastItem = results[results.length - 1];
      const cursorObj = {
        performed_at: lastItem.performed_at,
        id: lastItem.id,
      };
      next_cursor = Buffer.from(JSON.stringify(cursorObj)).toString("base64");
    }

    // Map database results to DTOs
    const entries: AuditLogEntryDTO[] = results.map((row) => ({
      id: row.id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action: row.action,
      before: row.before,
      after: row.after,
      performed_at: row.performed_at,
    }));

    return {
      data: entries,
      pagination: {
        next_cursor,
        has_more,
        limit,
      },
    };
  },
};
