import type { SupabaseClient } from "@/db/supabase.client";
import type { MonthlyMetricsDTO } from "@/types";

/**
 * Format cents to PLN string with 2 decimal places and thousand separators
 * Example: 123456 -> "1,234.56"
 *
 * @param cents - Amount in cents (integer)
 * @returns Formatted PLN string with thousand separators
 */
function formatCentsToPLN(cents: number): string {
  const pln = (cents / 100).toFixed(2);
  // Add thousand separators
  return pln.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Build free cash flow formula string for display
 * Format: "Dochód (X PLN) - Wydatki (Y PLN) - Odłożone netto (Z PLN) = W PLN"
 *
 * @param incomeCents - Income amount in cents
 * @param expensesCents - Expenses amount in cents
 * @param netSavedCents - Net saved amount in cents
 * @param freeFlowCents - Free cash flow amount in cents
 * @returns Formatted formula string for display
 */
function buildFreeFlowFormula(
  incomeCents: number,
  expensesCents: number,
  netSavedCents: number,
  freeFlowCents: number
): string {
  return `Dochód (${formatCentsToPLN(incomeCents)} PLN) - Wydatki (${formatCentsToPLN(expensesCents)} PLN) - Odłożone netto (${formatCentsToPLN(netSavedCents)} PLN) = ${formatCentsToPLN(freeFlowCents)} PLN`;
}

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
 * Get monthly financial metrics for a user
 * Returns metrics from monthly_metrics table or zeros if no data exists
 *
 * Business logic flow:
 * 1. Normalize month to YYYY-MM-DD format (first day of month)
 * 2. Query monthly_metrics table with RLS filtering
 * 3. If no data exists, return structure with zeros
 * 4. Transform database row to DTO with computed formula
 * 5. Convert bigint to number (safe for amounts up to 2^53)
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID to fetch metrics for
 * @param month - Month in YYYY-MM format
 * @returns Monthly metrics DTO with computed formula
 * @throws Error if database query fails
 */
export async function getMonthlyMetrics(
  supabase: SupabaseClient,
  userId: string,
  month: string
): Promise<MonthlyMetricsDTO> {
  const normalizedMonth = normalizeMonth(month);

  // Query monthly_metrics table
  // RLS will automatically filter by user_id and email_confirmed
  const { data, error } = await supabase
    .from("monthly_metrics")
    .select(
      `
      month,
      income_cents,
      expenses_cents,
      net_saved_cents,
      free_cash_flow_cents,
      refreshed_at
    `
    )
    .eq("user_id", userId)
    .eq("month", normalizedMonth)
    .maybeSingle();

  if (error) {
    console.error("Database error in getMonthlyMetrics:", error);
    throw new Error(`Failed to fetch monthly metrics: ${error.message}`);
  }

  // If no data exists for this month, return zeros
  if (!data) {
    return {
      month,
      income_cents: 0,
      expenses_cents: 0,
      net_saved_cents: 0,
      free_cash_flow_cents: 0,
      free_cash_flow_formula: buildFreeFlowFormula(0, 0, 0, 0),
      refreshed_at: null,
    };
  }

  // Transform database row to DTO
  // Convert bigint to number (safe for amounts up to 2^53)
  const incomeCents = Number(data.income_cents);
  const expensesCents = Number(data.expenses_cents);
  const netSavedCents = Number(data.net_saved_cents);
  const freeFlowCents = Number(data.free_cash_flow_cents);

  return {
    month,
    income_cents: incomeCents,
    expenses_cents: expensesCents,
    net_saved_cents: netSavedCents,
    free_cash_flow_cents: freeFlowCents,
    free_cash_flow_formula: buildFreeFlowFormula(incomeCents, expensesCents, netSavedCents, freeFlowCents),
    refreshed_at: data.refreshed_at,
  };
}
