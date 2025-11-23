// src/lib/services/goal-event.service.ts

import type { SupabaseClient } from "@/db/supabase.client";
import type { CreateGoalEventCommand, GoalEventDetailDTO, GoalEventDTO, GoalEventListResponseDTO } from "@/types";

/**
 * Custom error for resource not found (404)
 */
export class NotFoundError extends Error {
  constructor(
    message: string,
    public details?: Record<string, string>
  ) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Custom error for business validation (422) and conflicts (409)
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public code?: string, // e.g., "DUPLICATE_REQUEST", "INSUFFICIENT_BALANCE"
    public details?: Record<string, string>
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Filters for goal events list query
 */
interface GoalEventFilters {
  goalId?: string;
  month?: string;
  type?: "DEPOSIT" | "WITHDRAW";
  cursor?: string;
  limit: number;
}

/**
 * Decoded pagination cursor structure
 */
interface DecodedCursor {
  created_at: string; // ISO 8601 timestamp
  id: string; // UUID
}

/**
 * Creates a new goal event (deposit or withdrawal) for the authenticated user
 *
 * Business logic flow:
 * 1. Pre-validation: Check if goal exists and is accessible
 * 2. Validate business rules (future date check)
 * 3. Call RPC function add_goal_event() which handles:
 *    - Transaction atomicity
 *    - Row locking (SELECT ... FOR UPDATE)
 *    - Balance validation and update
 *    - Idempotency via client_request_id
 *    - Trigger monthly_metrics recalculation
 * 4. Fetch created goal_event with joined goal_name
 * 5. Fetch updated goal balance
 * 6. Construct and return GoalEventDetailDTO
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param command - Validated command data (CreateGoalEventCommand)
 * @returns Promise<GoalEventDetailDTO> - Created goal event with balance after
 * @throws NotFoundError - Goal not found, archived, or soft-deleted (404)
 * @throws ValidationError - Business validation or conflict (409, 422)
 * @throws Error - Unexpected database error (500)
 */
export async function createGoalEvent(
  supabase: SupabaseClient,
  userId: string,
  command: CreateGoalEventCommand
): Promise<GoalEventDetailDTO> {
  // STEP 1: Pre-validation - Check if goal exists and is accessible
  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id, current_balance_cents, archived_at, deleted_at")
    .eq("id", command.goal_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (goalError) {
    throw new Error(`Failed to fetch goal: ${goalError.message}`);
  }

  // If goal not found → 404
  if (!goal) {
    throw new NotFoundError("Goal not found", {
      goal_id: command.goal_id,
    });
  }

  // If goal archived → 404
  if (goal.archived_at) {
    throw new NotFoundError("Goal is archived", {
      goal_id: command.goal_id,
      archived_at: goal.archived_at,
    });
  }

  // If goal soft-deleted → 404
  if (goal.deleted_at) {
    throw new NotFoundError("Goal is deleted", {
      goal_id: command.goal_id,
    });
  }

  // STEP 2: Validate future date (business rule)
  const today = new Date().toISOString().split("T")[0];
  if (command.occurred_on > today) {
    throw new ValidationError("Occurred date cannot be in the future", "FUTURE_DATE", {
      occurred_on: command.occurred_on,
      current_date: today,
    });
  }

  // STEP 3: Call RPC function (handles transaction, lock, balance update)
  const { data: rpcResult, error: rpcError } = await supabase.rpc("add_goal_event", {
    p_goal_id: command.goal_id,
    p_type: command.type,
    p_amount_cents: command.amount_cents,
    p_occurred_on: command.occurred_on,
    p_client_request_id: command.client_request_id,
  });

  // Handle RPC errors
  if (rpcError) {
    // 23505: unique_violation (duplicate client_request_id)
    if (rpcError.code === "23505") {
      throw new ValidationError("Goal event with this client_request_id already exists", "DUPLICATE_REQUEST", {
        client_request_id: command.client_request_id,
      });
    }

    // P0001: raise_exception (custom error from function)
    if (rpcError.code === "P0001") {
      // Check for insufficient balance error
      if (rpcError.message.includes("Insufficient balance")) {
        // Extract balance info from error message if possible
        const match = rpcError.message.match(/Current: (\d+), Requested: (\d+)/);
        const details: Record<string, string> = {
          requested_amount_cents: command.amount_cents.toString(),
        };
        if (match) {
          details.current_balance_cents = match[1];
        }

        throw new ValidationError("Insufficient balance for withdrawal", "INSUFFICIENT_BALANCE", details);
      }

      // Other P0001 errors (e.g., archived goal, future date)
      throw new ValidationError(rpcError.message);
    }

    // 23514: check_violation (CHECK constraint)
    if (rpcError.code === "23514") {
      throw new ValidationError("Data validation failed", undefined, {
        occurred_on: command.occurred_on,
      });
    }

    // Unexpected database error → rethrow as generic error (500)
    throw new Error(`Database error: ${rpcError.message}`);
  }

  // rpcResult is the UUID of the created goal_event
  const goalEventId = rpcResult;

  // STEP 4: Fetch created goal_event with joined goal_name
  const { data: goalEvent, error: eventError } = await supabase
    .from("goal_events")
    .select(
      `
      id,
      goal_id,
      type,
      amount_cents,
      occurred_on,
      created_at,
      goals!inner(name)
    `
    )
    .eq("id", goalEventId)
    .single();

  if (eventError || !goalEvent) {
    throw new Error(`Failed to fetch created goal event: ${eventError?.message || "Not found"}`);
  }

  // STEP 5: Fetch updated goal balance
  const { data: updatedGoal, error: balanceError } = await supabase
    .from("goals")
    .select("current_balance_cents")
    .eq("id", command.goal_id)
    .single();

  if (balanceError || !updatedGoal) {
    throw new Error(`Failed to fetch updated goal balance: ${balanceError?.message || "Not found"}`);
  }

  // STEP 6: Construct GoalEventDetailDTO
  // Parse joined goals data (can be object or array)
  const goals = goalEvent.goals as { name: string } | { name: string }[];
  const goalName = Array.isArray(goals) ? goals[0].name : goals.name;

  const dto: GoalEventDetailDTO = {
    id: goalEvent.id,
    goal_id: goalEvent.goal_id,
    goal_name: goalName,
    type: goalEvent.type as "DEPOSIT" | "WITHDRAW",
    amount_cents: goalEvent.amount_cents,
    occurred_on: goalEvent.occurred_on,
    created_at: goalEvent.created_at,
    goal_balance_after_cents: updatedGoal.current_balance_cents,
  };

  return dto;
}

/**
 * Decodes and validates base64-encoded pagination cursor
 *
 * The cursor contains the created_at timestamp and id of the last record
 * from the previous page, used for keyset pagination.
 *
 * @param cursor - Base64-encoded JSON string
 * @returns DecodedCursor with created_at and id
 * @throws ValidationError if cursor is invalid or malformed
 */
function decodeCursor(cursor: string): DecodedCursor {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);

    // Validate structure - must have both fields
    if (!parsed.created_at || !parsed.id) {
      throw new Error("Missing required cursor fields");
    }

    // Validate created_at is a valid ISO timestamp
    if (isNaN(new Date(parsed.created_at).getTime())) {
      throw new Error("Invalid created_at timestamp");
    }

    // Validate id is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(parsed.id)) {
      throw new Error("Invalid id format");
    }

    return parsed as DecodedCursor;
  } catch {
    throw new ValidationError("Invalid pagination cursor", "INVALID_CURSOR", {
      cursor: "Must be a valid base64-encoded JSON with created_at and id",
    });
  }
}

/**
 * Encodes pagination cursor from goal event record
 *
 * The cursor is a base64-encoded JSON containing the created_at timestamp
 * and id of the last record on the current page. This allows the next page
 * to start from the correct position using keyset pagination.
 *
 * @param record - Record with created_at and id fields
 * @returns Base64-encoded cursor string
 */
function encodeCursor(record: { created_at: string; id: string }): string {
  const cursorData = {
    created_at: record.created_at,
    id: record.id,
  };
  return Buffer.from(JSON.stringify(cursorData)).toString("base64");
}

/**
 * Lists goal events for authenticated user with filtering and pagination
 *
 * Business logic flow:
 * 1. Decode cursor if provided (validates structure)
 * 2. Build Supabase query with filters (goal_id, month, type)
 * 3. Apply RLS (automatic via Supabase - filters by user_id)
 * 4. Fetch limit+1 records (to detect if there are more pages)
 * 5. Map database rows to GoalEventDTO with joined goal_name
 * 6. Calculate pagination metadata (has_more, next_cursor)
 * 7. Encode next_cursor from last record
 *
 * Pagination strategy: Cursor-based (keyset pagination)
 * - Sorts by: created_at DESC, id DESC
 * - Cursor encodes: { created_at, id } of last record
 * - More efficient than offset-based for large datasets
 *
 * @param supabase - Supabase client with user context
 * @param userId - ID of authenticated user
 * @param filters - Filtering and pagination parameters
 * @returns Promise<GoalEventListResponseDTO> with data and pagination metadata
 * @throws ValidationError if cursor is invalid (400)
 * @throws Error if database query fails (500)
 */
export async function listGoalEvents(
  supabase: SupabaseClient,
  userId: string,
  filters: GoalEventFilters
): Promise<GoalEventListResponseDTO> {
  // STEP 1: Decode cursor if provided
  let decodedCursor: DecodedCursor | null = null;
  if (filters.cursor) {
    decodedCursor = decodeCursor(filters.cursor); // Throws ValidationError if invalid
  }

  // STEP 2: Build base query with JOIN to goals table
  let query = supabase
    .from("goal_events")
    .select(
      `
      id,
      goal_id,
      type,
      amount_cents,
      occurred_on,
      created_at,
      goals!inner(name)
    `
    )
    .eq("user_id", userId);

  // STEP 3: Apply optional filters
  if (filters.goalId) {
    query = query.eq("goal_id", filters.goalId);
  }

  if (filters.month) {
    // month is a generated column: date_trunc('month', occurred_on)
    // We need to pass a date value (first day of month) for comparison
    query = query.eq("month", `${filters.month}-01`);
  }

  if (filters.type) {
    query = query.eq("type", filters.type);
  }

  // STEP 4: Apply cursor pagination (keyset pagination)
  // Filter: created_at < cursor OR (created_at = cursor AND id < cursor.id)
  if (decodedCursor) {
    query = query.or(
      `created_at.lt.${decodedCursor.created_at},` +
        `and(created_at.eq.${decodedCursor.created_at},id.lt.${decodedCursor.id})`
    );
  }

  // STEP 5: Apply ordering and limit
  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(filters.limit + 1); // Fetch one extra to detect has_more

  // STEP 6: Execute query
  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch goal events: ${error.message}`);
  }

  // STEP 7: Process results - check if there are more pages
  const hasMore = (data?.length || 0) > filters.limit;
  const records = hasMore && data ? data.slice(0, filters.limit) : data || [];

  // STEP 8: Map database records to GoalEventDTO
  const goalEvents: GoalEventDTO[] = records.map((record) => {
    // Parse joined goals data (can be object or array depending on Supabase version)
    const goals = record.goals as { name: string } | { name: string }[];
    const goalName = Array.isArray(goals) ? goals[0].name : goals.name;

    return {
      id: record.id,
      goal_id: record.goal_id,
      goal_name: goalName,
      type: record.type as "DEPOSIT" | "WITHDRAW",
      amount_cents: record.amount_cents,
      occurred_on: record.occurred_on,
      created_at: record.created_at,
    };
  });

  // STEP 9: Calculate pagination metadata
  const nextCursor =
    hasMore && records.length > 0
      ? encodeCursor({
          created_at: records[records.length - 1].created_at,
          id: records[records.length - 1].id,
        })
      : null;

  // STEP 10: Construct and return response
  const response: GoalEventListResponseDTO = {
    data: goalEvents,
    pagination: {
      next_cursor: nextCursor,
      has_more: hasMore,
      limit: filters.limit,
    },
  };

  return response;
}
