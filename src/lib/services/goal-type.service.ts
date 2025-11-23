// src/lib/services/goal-type.service.ts

import type { SupabaseClient } from "@/db/supabase.client";
import type { GoalTypeDTO } from "@/types";

/**
 * Get all active goal types
 * 
 * Returns a list of goal types that users can choose from when creating
 * a new savings goal. Only active types (is_active = true) are returned,
 * sorted alphabetically by Polish label.
 * 
 * @param supabase - Supabase client from context.locals
 * @returns Promise with array of goal type DTOs
 * @throws Error if database query fails
 * 
 * @example
 * const types = await getActiveGoalTypes(locals.supabase);
 * // Returns: [{ code: "AUTO", label_pl: "Samochód", is_active: true }, ...]
 */
export async function getActiveGoalTypes(
  supabase: SupabaseClient
): Promise<GoalTypeDTO[]> {
  // Build query for active goal types only
  const query = supabase
    .from("goal_types")
    .select("code, label_pl, is_active")
    .eq("is_active", true)
    .order("label_pl", { ascending: true });

  // Execute query
  const { data, error } = await query;

  // Handle database errors
  if (error) {
    console.error("[getActiveGoalTypes] Database error:", error);
    throw new Error(`Failed to fetch goal types: ${error.message}`);
  }

  // Return data (already matches GoalTypeDTO structure)
  return data;
}

