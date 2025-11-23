import type { SupabaseClient } from "@/db/supabase.client";
import type { CreateGoalCommand, GoalDTO, GoalDetailDTO, UpdateGoalCommand, ArchiveGoalResponseDTO } from "@/types";

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

/**
 * Retrieves detailed information about a specific goal
 *
 * Business logic flow:
 * 1. Query goal with JOIN to goal_types for type_label
 * 2. Filter out soft-deleted goals (deleted_at IS NULL)
 * 3. Return null if goal doesn't exist or doesn't belong to user (RLS)
 * 4. Compute progress_percentage
 * 5. If includeEvents=true, fetch goal events (optionally filtered by month)
 * 6. Compute monthly_change_cents for specified month
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param goalId - UUID of the goal to retrieve
 * @param includeEvents - Whether to include goal events history (default: true)
 * @param month - Optional month filter in YYYY-MM format
 * @returns Promise<GoalDetailDTO | null> - Goal details with events and monthly change, or null if not found
 * @throws Error - Database error (will be caught as 500)
 */
export async function getGoalById(
  supabase: SupabaseClient,
  userId: string,
  goalId: string,
  includeEvents = true,
  month?: string
): Promise<GoalDetailDTO | null> {
  // Step 1: Fetch goal with joined type_label
  const { data: goal, error: goalError } = await supabase
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
    .eq("id", goalId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (goalError) {
    throw new Error(`Failed to fetch goal: ${goalError.message}`);
  }

  // Step 2: Return null if goal doesn't exist
  if (!goal) {
    return null;
  }

  // Step 3: Extract type_label from joined data
  const goalTypes = goal.goal_types as { label_pl: string } | { label_pl: string }[];
  const typeLabel = Array.isArray(goalTypes) ? goalTypes[0].label_pl : goalTypes.label_pl;

  // Step 4: Compute progress_percentage
  const progressPercentage =
    goal.target_amount_cents > 0 ? (goal.current_balance_cents / goal.target_amount_cents) * 100 : 0;

  // Step 5: Fetch events if requested
  let events: {
    id: string;
    type: string;
    amount_cents: number;
    occurred_on: string;
    created_at: string;
  }[] = [];

  // Convert month from YYYY-MM to YYYY-MM-01 for database query (month column is date type)
  const monthDate = month ? `${month}-01` : undefined;

  if (includeEvents) {
    let eventsQuery = supabase
      .from("goal_events")
      .select("id, type, amount_cents, occurred_on, created_at")
      .eq("goal_id", goalId)
      .eq("user_id", userId)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false });

    // Apply month filter if provided
    if (monthDate) {
      eventsQuery = eventsQuery.eq("month", monthDate);
    }

    const { data: eventsData, error: eventsError } = await eventsQuery;

    if (eventsError) {
      throw new Error(`Failed to fetch goal events: ${eventsError.message}`);
    }

    events = eventsData || [];
  }

  // Step 6: Compute monthly_change_cents if month is provided
  let monthlyChangeCents = 0;

  if (monthDate) {
    const { data: monthlyData, error: monthlyError } = await supabase
      .from("goal_events")
      .select("type, amount_cents")
      .eq("goal_id", goalId)
      .eq("user_id", userId)
      .eq("month", monthDate);

    if (monthlyError) {
      throw new Error(`Failed to compute monthly change: ${monthlyError.message}`);
    }

    if (monthlyData) {
      monthlyChangeCents = monthlyData.reduce((sum, event) => {
        return sum + (event.type === "DEPOSIT" ? event.amount_cents : -event.amount_cents);
      }, 0);
    }
  }

  // Step 7: Build and return GoalDetailDTO
  const goalDetailDTO: GoalDetailDTO = {
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
    events: events,
    monthly_change_cents: monthlyChangeCents,
  };

  return goalDetailDTO;
}

/**
 * Updates an existing goal for the authenticated user
 *
 * Business logic flow:
 * 1. Fetch goal and verify ownership (RLS)
 * 2. Validate goal is not archived
 * 3. If is_priority=true, unset priority on other goals (atomic)
 * 4. Update goal with provided fields only (partial update)
 * 5. Fetch updated goal with joined type_label
 * 6. Compute progress_percentage and return GoalDTO
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param goalId - UUID of the goal to update
 * @param command - Validated command data (UpdateGoalCommand) with only fields to update
 * @returns Promise<GoalDTO | null> - Updated goal with type label and progress, or null if not found
 * @throws ValidationError - Business validation failed (422)
 * @throws Error - Database error (will be caught as 500)
 */
export async function updateGoal(
  supabase: SupabaseClient,
  userId: string,
  goalId: string,
  command: UpdateGoalCommand
): Promise<GoalDTO | null> {
  // Step 1: Fetch goal to verify it exists and belongs to user
  const { data: existingGoal, error: fetchError } = await supabase
    .from("goals")
    .select("id, archived_at")
    .eq("id", goalId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch goal: ${fetchError.message}`);
  }

  // Step 2: Return null if goal doesn't exist or doesn't belong to user
  if (!existingGoal) {
    return null;
  }

  // Step 3: Validate goal is not archived
  if (existingGoal.archived_at !== null) {
    throw new ValidationError("Cannot update archived goal", {
      archived_at: existingGoal.archived_at,
    });
  }

  // Step 4: If is_priority=true, unset priority on other goals
  if (command.is_priority === true) {
    const { error: priorityError } = await supabase
      .from("goals")
      .update({
        is_priority: false,
        updated_by: userId,
      })
      .eq("user_id", userId)
      .neq("id", goalId)
      .eq("is_priority", true)
      .is("archived_at", null)
      .is("deleted_at", null);

    if (priorityError) {
      throw new Error(`Failed to update priority on other goals: ${priorityError.message}`);
    }
  }

  // Step 5: Build update object with only provided fields
  const updateData: Record<string, unknown> = {
    updated_by: userId,
  };

  if (command.name !== undefined) {
    updateData.name = command.name;
  }
  if (command.target_amount_cents !== undefined) {
    updateData.target_amount_cents = command.target_amount_cents;
  }
  if (command.is_priority !== undefined) {
    updateData.is_priority = command.is_priority;
  }

  // Step 6: Update goal
  const { error: updateError } = await supabase.from("goals").update(updateData).eq("id", goalId).eq("user_id", userId);

  if (updateError) {
    throw new Error(`Failed to update goal: ${updateError.message}`);
  }

  // Step 7: Fetch updated goal with joined type_label
  const { data: updatedGoal, error: selectError } = await supabase
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
    .eq("id", goalId)
    .eq("user_id", userId)
    .single();

  if (selectError) {
    throw new Error(`Failed to fetch updated goal: ${selectError.message}`);
  }

  if (!updatedGoal) {
    throw new Error("Goal was not updated");
  }

  // Step 8: Transform to GoalDTO with computed progress_percentage
  const goalTypes = updatedGoal.goal_types as { label_pl: string } | { label_pl: string }[];
  const typeLabel = Array.isArray(goalTypes) ? goalTypes[0].label_pl : goalTypes.label_pl;

  const progressPercentage =
    updatedGoal.target_amount_cents > 0
      ? (updatedGoal.current_balance_cents / updatedGoal.target_amount_cents) * 100
      : 0;

  const goalDTO: GoalDTO = {
    id: updatedGoal.id,
    name: updatedGoal.name,
    type_code: updatedGoal.type_code,
    type_label: typeLabel,
    target_amount_cents: updatedGoal.target_amount_cents,
    current_balance_cents: updatedGoal.current_balance_cents,
    progress_percentage: progressPercentage,
    is_priority: updatedGoal.is_priority,
    archived_at: updatedGoal.archived_at,
    created_at: updatedGoal.created_at,
    updated_at: updatedGoal.updated_at,
  };

  return goalDTO;
}

/**
 * Archives a goal for the authenticated user (soft archive)
 *
 * Business logic flow:
 * 1. Fetch goal and verify ownership (RLS + explicit user_id check)
 * 2. Return null if goal doesn't exist or doesn't belong to user
 * 3. Validate goal is not already archived (422)
 * 4. Validate goal is not priority (409 Conflict)
 * 5. UPDATE goals SET archived_at = NOW()
 * 6. Return ArchiveGoalResponseDTO with success message
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param goalId - UUID of the goal to archive
 * @returns Promise<ArchiveGoalResponseDTO | null> - Archive response with timestamp and message, or null if not found
 * @throws ValidationError - Business validation failed (409 or 422)
 * @throws Error - Database error (will be caught as 500)
 */
export async function archiveGoal(
  supabase: SupabaseClient,
  userId: string,
  goalId: string
): Promise<ArchiveGoalResponseDTO | null> {
  // Step 1: Fetch goal and verify ownership
  const { data: existingGoal, error: fetchError } = await supabase
    .from("goals")
    .select("id, name, archived_at, is_priority")
    .eq("id", goalId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch goal: ${fetchError.message}`);
  }

  // Step 2: Return null if goal doesn't exist
  if (!existingGoal) {
    return null;
  }

  // Step 3: Validate goal is not already archived
  if (existingGoal.archived_at !== null) {
    throw new ValidationError("Goal is already archived", {
      archived_at: existingGoal.archived_at,
    });
  }

  // Step 4: Validate goal is not priority
  if (existingGoal.is_priority) {
    throw new ValidationError("Cannot archive priority goal. Please unset priority flag first.", {
      is_priority: "true",
    });
  }

  // Step 5: UPDATE goal to set archived_at
  const { data: archivedGoal, error: updateError } = await supabase
    .from("goals")
    .update({
      archived_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", goalId)
    .eq("user_id", userId)
    .select("id, name, archived_at")
    .single();

  if (updateError) {
    throw new Error(`Failed to archive goal: ${updateError.message}`);
  }

  if (!archivedGoal) {
    throw new Error("Goal was not archived");
  }

  // Step 6: Return response DTO
  const response: ArchiveGoalResponseDTO = {
    id: archivedGoal.id,
    name: archivedGoal.name,
    archived_at: archivedGoal.archived_at,
    message: "Cel został zarchiwizowany. Dane historyczne pozostają niezmienione.",
  };

  return response;
}
