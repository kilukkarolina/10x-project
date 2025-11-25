import type { SupabaseClient } from "@/db/supabase.client";
import type { ExpensesByCategoryResponseDTO, ExpenseByCategoryDTO } from "@/types";

/**
 * Normalize month string to first day of month in YYYY-MM-DD format
 * Input: "2025-01"
 * Output: "2025-01-01"
 *
 * @param month - Month in YYYY-MM format
 * @returns Month as first day in YYYY-MM-DD format
 */
function normalizeMonth(month: string): string {
  return `${month}-01`;
}

/**
 * Calculate percentage with 2 decimal places
 * Returns 0 if total is 0 to avoid division by zero
 *
 * @param part - Partial amount
 * @param total - Total amount
 * @returns Percentage rounded to 2 decimal places
 */
function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 10000) / 100; // Round to 2 decimals
}

/**
 * Get expenses breakdown by category for a specific month
 *
 * Business logic flow:
 * 1. Normalize month to YYYY-MM-DD format (first day of month)
 * 2. Query transactions table with INNER JOIN to transaction_categories
 * 3. Filter by type='EXPENSE', month, and deleted_at IS NULL
 * 4. RLS automatically filters by user_id
 * 5. Manually aggregate results by category (Supabase client doesn't support GROUP BY)
 * 6. Calculate total expenses and percentage for each category
 * 7. Sort by total_cents DESC
 * 8. Return empty array if no expenses found
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID to fetch expenses for
 * @param month - Month in YYYY-MM format
 * @returns Expenses by category response DTO
 * @throws Error if database query fails
 */
export async function getExpensesByCategory(
  supabase: SupabaseClient,
  userId: string,
  month: string
): Promise<ExpensesByCategoryResponseDTO> {
  const normalizedMonth = normalizeMonth(month);

  // Query with INNER JOIN to transaction_categories
  // RLS will automatically filter by user_id and email_confirmed
  const { data, error } = await supabase
    .from("transactions")
    .select(
      `
      category_code,
      amount_cents,
      transaction_categories!inner (
        label_pl
      )
    `
    )
    .eq("user_id", userId)
    .eq("type", "EXPENSE")
    .eq("month", normalizedMonth)
    .is("deleted_at", null);

  if (error) {
    console.error("Database error in getExpensesByCategory:", {
      error: error.message,
      userId,
      month,
    });
    throw new Error(`Failed to fetch expenses by category: ${error.message}`);
  }

  // If no expenses, return empty response
  if (!data || data.length === 0) {
    return {
      month,
      data: [],
      total_expenses_cents: 0,
    };
  }

  // Manual aggregation (Supabase JS client doesn't support GROUP BY directly)
  // Build a map to aggregate by category_code
  const categoryMap = new Map<
    string,
    {
      category_code: string;
      category_label: string;
      total_cents: number;
      transaction_count: number;
    }
  >();

  for (const row of data) {
    const code = row.category_code;
    const label = row.transaction_categories.label_pl;
    const amount = Number(row.amount_cents); // Convert bigint to number

    const existing = categoryMap.get(code);
    if (existing) {
      existing.total_cents += amount;
      existing.transaction_count += 1;
    } else {
      categoryMap.set(code, {
        category_code: code,
        category_label: label,
        total_cents: amount,
        transaction_count: 1,
      });
    }
  }

  // Calculate total expenses across all categories
  let totalExpensesCents = 0;
  for (const cat of categoryMap.values()) {
    totalExpensesCents += cat.total_cents;
  }

  // Build result array with percentages
  const resultData: ExpenseByCategoryDTO[] = [];
  for (const cat of categoryMap.values()) {
    resultData.push({
      category_code: cat.category_code,
      category_label: cat.category_label,
      total_cents: cat.total_cents,
      percentage: calculatePercentage(cat.total_cents, totalExpensesCents),
      transaction_count: cat.transaction_count,
    });
  }

  // Sort by total_cents DESC (highest expenses first)
  resultData.sort((a, b) => b.total_cents - a.total_cents);

  return {
    month,
    data: resultData,
    total_expenses_cents: totalExpensesCents,
  };
}
