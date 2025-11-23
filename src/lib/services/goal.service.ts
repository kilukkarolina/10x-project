import type { SupabaseClient } from "@/db/supabase.client";
import type { CreateGoalCommand, GoalDTO } from "@/types";

/**
 * Custom error class for business validation errors
 * Used for 422 Unprocessable Entity and 409 Conflict responses
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public details?: Record<string, string>
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Creates a new goal for the authenticated user
 *
 * Business logic flow:
 * 1. Validate that goal type exists and is active
 * 2. Validate priority conflict (if is_priority=true)
 * 3. Insert goal into database (RLS will verify user)
 * 4. Fetch inserted goal with joined type_label
 * 5. Compute progress_percentage and return GoalDTO
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param command - Validated command data (CreateGoalCommand)
 * @returns Promise<GoalDTO> - Created goal with type label and progress
 * @throws ValidationError - Business validation failed (422 or 409)
 * @throws Error - Database error (will be caught as 500)
 */
export async function createGoal(
  supabase: SupabaseClient,
  userId: string,
  command: CreateGoalCommand
): Promise<GoalDTO> {
  // Step 1: Validate goal type exists and is active
  const { data: goalType, error: typeError } = await supabase
    .from("goal_types")
    .select("is_active")
    .eq("code", command.type_code)
    .maybeSingle();

  if (typeError) {
    throw new Error(`Failed to validate goal type: ${typeError.message}`);
  }

  if (!goalType) {
    throw new ValidationError("Goal type code does not exist or is inactive", {
      type_code: command.type_code,
    });
  }

  if (!goalType.is_active) {
    throw new ValidationError("Goal type is not active", {
      type_code: command.type_code,
    });
  }

  // Step 2: Validate priority conflict (if is_priority=true)
  if (command.is_priority) {
    const { data: existingPriority, error: priorityError } = await supabase
      .from("goals")
      .select("id")
      .eq("user_id", userId)
      .eq("is_priority", true)
      .is("archived_at", null)
      .is("deleted_at", null)
      .maybeSingle();

    if (priorityError) {
      throw new Error(`Failed to check priority conflict: ${priorityError.message}`);
    }

    if (existingPriority) {
      throw new ValidationError("Another goal is already marked as priority", {
        is_priority: "Only one goal can be marked as priority at a time",
      });
    }
  }

  // Step 3: Insert goal into database
  const { data: insertedGoal, error: insertError } = await supabase
    .from("goals")
    .insert({
      user_id: userId,
      name: command.name,
      type_code: command.type_code,
      target_amount_cents: command.target_amount_cents,
      is_priority: command.is_priority ?? false,
      created_by: userId,
      updated_by: userId,
    })
    .select(
      `
      id,
      name,
      type_code,
      target_amount_cents,
      current_balance_cents,
      is_priority,
      archived_at,
      created_at,
      updated_at,
      goal_types!inner(label_pl)
    `
    )
    .single();

  if (insertError) {
    throw new Error(`Failed to create goal: ${insertError.message}`);
  }

  if (!insertedGoal) {
    throw new Error("Goal was not created");
  }

  // Step 4: Transform to GoalDTO with computed progress_percentage
  const goalTypes = insertedGoal.goal_types as { label_pl: string } | { label_pl: string }[];
  const typeLabel = Array.isArray(goalTypes) ? goalTypes[0].label_pl : goalTypes.label_pl;

  const progressPercentage =
    insertedGoal.target_amount_cents > 0
      ? (insertedGoal.current_balance_cents / insertedGoal.target_amount_cents) * 100
      : 0;

  const goalDTO: GoalDTO = {
    id: insertedGoal.id,
    name: insertedGoal.name,
    type_code: insertedGoal.type_code,
    type_label: typeLabel,
    target_amount_cents: insertedGoal.target_amount_cents,
    current_balance_cents: insertedGoal.current_balance_cents,
    progress_percentage: progressPercentage,
    is_priority: insertedGoal.is_priority,
    archived_at: insertedGoal.archived_at,
    created_at: insertedGoal.created_at,
    updated_at: insertedGoal.updated_at,
  };

  return goalDTO;
}

/**
 * Lists all goals for the authenticated user
 *
 * Business logic flow:
 * 1. Query goals table with user_id filter
 * 2. Join with goal_types to get type_label
 * 3. Filter out soft-deleted goals (deleted_at IS NULL)
 * 4. Optionally filter archived goals
 * 5. Transform results to GoalDTO with computed progress_percentage
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param includeArchived - Whether to include archived goals (default: false)
 * @returns Promise<GoalDTO[]> - Array of goals with type labels and progress
 * @throws Error - Database error (will be caught as 500)
 */
export async function listGoals(supabase: SupabaseClient, userId: string, includeArchived = false): Promise<GoalDTO[]> {
  // Build query with filters
  let query = supabase
    .from("goals")
    .select(
      `
      id,
      name,
      type_code,
      target_amount_cents,
      current_balance_cents,
      is_priority,
      archived_at,
      created_at,
      updated_at,
      goal_types!inner(label_pl)
    `
    )
    .eq("user_id", userId)
    .is("deleted_at", null); // Exclude soft-deleted goals

  // Conditionally filter archived goals
  if (!includeArchived) {
    query = query.is("archived_at", null);
  }

  // Order by created_at descending (newest first)
  query = query.order("created_at", { ascending: false });

  // Execute query
  const { data: goals, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch goals: ${error.message}`);
  }

  if (!goals) {
    return [];
  }

  // Transform to GoalDTO with computed progress_percentage
  return goals.map((goal) => {
    // Handle joined goal_types (can be array or single object)
    const goalTypes = goal.goal_types as { label_pl: string } | { label_pl: string }[];
    const typeLabel = Array.isArray(goalTypes) ? goalTypes[0].label_pl : goalTypes.label_pl;

    // Compute progress percentage
    const progressPercentage =
      goal.target_amount_cents > 0 ? (goal.current_balance_cents / goal.target_amount_cents) * 100 : 0;

    const goalDTO: GoalDTO = {
      id: goal.id,
      name: goal.name,
      type_code: goal.type_code,
      type_label: typeLabel,
      target_amount_cents: goal.target_amount_cents,
      current_balance_cents: goal.current_balance_cents,
      progress_percentage: progressPercentage,
      is_priority: goal.is_priority,
      archived_at: goal.archived_at,
      created_at: goal.created_at,
      updated_at: goal.updated_at,
    };

    return goalDTO;
  });
}
