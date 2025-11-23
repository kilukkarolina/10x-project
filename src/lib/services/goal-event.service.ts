// src/lib/services/goal-event.service.ts

import type { SupabaseClient } from "@/db/supabase.client";
import type { CreateGoalEventCommand, GoalEventDetailDTO } from "@/types";

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
