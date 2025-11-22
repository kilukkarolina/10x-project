import type { SupabaseClient } from "@/db/supabase.client";
import type { TransactionCategoryDTO } from "@/types";

/**
 * Get active transaction categories with optional filtering by kind
 *
 * @param supabase - Supabase client from context.locals
 * @param kind - Optional filter: "INCOME" or "EXPENSE"
 * @returns List of active transaction categories sorted by label_pl
 * @throws Error if database query fails
 */
export async function getActiveCategories(
  supabase: SupabaseClient,
  kind?: "INCOME" | "EXPENSE"
): Promise<TransactionCategoryDTO[]> {
  // Build query
  let query = supabase.from("transaction_categories").select("code, kind, label_pl, is_active").eq("is_active", true);

  // Apply optional kind filter
  if (kind) {
    query = query.eq("kind", kind);
  }

  // Execute query with sorting
  const { data, error } = await query.order("label_pl", { ascending: true });

  // Handle database errors
  if (error) {
    console.error("[getActiveCategories] Database error:", error);
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  // Map to DTO (already matches TransactionCategoryDTO structure)
  return data;
}
