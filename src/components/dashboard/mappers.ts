import type { MonthlyMetricsDTO, ExpensesByCategoryResponseDTO, PriorityGoalMetricsDTO } from "@/types";
import { formatCurrencyPL, formatCurrencyWithSignPL } from "@/lib/utils";

/**
 * ViewModel dla kart metryk
 */
export interface MetricsCardsVM {
  month: string;
  incomeCents: number;
  expensesCents: number;
  netSavedCents: number;
  freeCashFlowCents: number;
  freeCashFlowFormula: string;
  refreshedAt: string | null;
  // Prezentacja
  incomePLN: string;
  expensesPLN: string;
  netSavedPLN: string;
  freeCashFlowPLN: string;
}

/**
 * ViewModel dla pojedynczej kategorii wydatków na wykresie
 */
export interface ExpenseCategoryChartItemVM {
  categoryCode: string;
  categoryLabel: string;
  totalCents: number;
  totalPLN: string;
  percentage: number;
  transactionCount: number;
}

/**
 * ViewModel dla wykresu wydatków
 */
export interface ExpensesChartVM {
  month: string;
  items: ExpenseCategoryChartItemVM[];
  totalCents: number;
}

/**
 * ViewModel dla progresu celu priorytetowego
 */
export interface PriorityGoalProgressVM {
  goalId: string;
  name: string;
  typeCode: string;
  typeLabel: string;
  targetCents: number;
  currentCents: number;
  progressPercentage: number;
  monthlyChangeCents: number;
  month: string;
  // Prezentacja
  targetPLN: string;
  currentPLN: string;
  monthlyChangePLN: string;
}

/**
 * Mapuje MonthlyMetricsDTO na MetricsCardsVM
 */
export function mapMetricsToVM(dto: MonthlyMetricsDTO): MetricsCardsVM {
  return {
    month: dto.month,
    incomeCents: dto.income_cents,
    expensesCents: dto.expenses_cents,
    netSavedCents: dto.net_saved_cents,
    freeCashFlowCents: dto.free_cash_flow_cents,
    freeCashFlowFormula: dto.free_cash_flow_formula,
    refreshedAt: dto.refreshed_at,
    // Formatowanie do prezentacji
    incomePLN: formatCurrencyPL(dto.income_cents),
    expensesPLN: formatCurrencyPL(dto.expenses_cents),
    netSavedPLN: formatCurrencyPL(dto.net_saved_cents),
    freeCashFlowPLN: formatCurrencyPL(dto.free_cash_flow_cents),
  };
}

/**
 * Mapuje ExpensesByCategoryResponseDTO na ExpensesChartVM
 */
export function mapExpensesToVM(dto: ExpensesByCategoryResponseDTO): ExpensesChartVM {
  return {
    month: dto.month,
    items: dto.data.map((item) => ({
      categoryCode: item.category_code,
      categoryLabel: item.category_label,
      totalCents: item.total_cents,
      totalPLN: formatCurrencyPL(item.total_cents),
      percentage: item.percentage,
      transactionCount: item.transaction_count,
    })),
    totalCents: dto.total_expenses_cents,
  };
}

/**
 * Mapuje PriorityGoalMetricsDTO na PriorityGoalProgressVM
 */
export function mapPriorityGoalToVM(dto: PriorityGoalMetricsDTO): PriorityGoalProgressVM {
  return {
    goalId: dto.goal_id,
    name: dto.name,
    typeCode: dto.type_code,
    typeLabel: dto.type_label,
    targetCents: dto.target_amount_cents,
    currentCents: dto.current_balance_cents,
    progressPercentage: dto.progress_percentage,
    monthlyChangeCents: dto.monthly_change_cents,
    month: dto.month,
    // Formatowanie do prezentacji
    targetPLN: formatCurrencyPL(dto.target_amount_cents),
    currentPLN: formatCurrencyPL(dto.current_balance_cents),
    monthlyChangePLN: formatCurrencyWithSignPL(dto.monthly_change_cents),
  };
}
