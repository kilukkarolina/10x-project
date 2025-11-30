// src/components/goals/types.ts

/**
 * ViewModel pojedynczego celu w liście
 */
export interface GoalListItemVM {
  id: string;
  name: string;
  type_code: string;
  type_label: string;
  target_amount_cents: number;
  target_amount_pln: string;
  current_balance_cents: number;
  current_balance_pln: string;
  progress_percentage: number;
  is_priority: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stan filtrów widoku Cele
 */
export interface GoalsFiltersState {
  include_archived: boolean;
}

/**
 * Payload do utworzenia nowego celu
 */
export interface CreateGoalPayload {
  name: string;
  type_code: string;
  target_amount_cents: number;
  is_priority?: boolean;
}

/**
 * Payload do aktualizacji celu
 */
export interface UpdateGoalPayload {
  name?: string;
  target_amount_cents?: number;
  is_priority?: boolean;
}

/**
 * ViewModel szczegółów celu
 */
export interface GoalDetailVM extends GoalListItemVM {
  isArchived: boolean;
}

/**
 * Stan filtrów listy zdarzeń celu
 */
export interface GoalEventFilterState {
  month: string; // YYYY-MM
  type: "ALL" | "DEPOSIT" | "WITHDRAW";
  cursor?: string | null;
  limit: number;
}

/**
 * Agregaty zdarzeń celu
 */
export interface GoalEventsAggregates {
  monthDepositCents: number;
  monthWithdrawCents: number;
  monthNetCents: number; // Σ(DEPOSIT − WITHDRAW) dla aktywnego miesiąca
  totalDepositCents: number;
  totalWithdrawCents: number;
  totalNetCents: number;
}

/**
 * Wartości formularza zdarzenia celu
 */
export interface GoalEventFormValues {
  type: "DEPOSIT" | "WITHDRAW";
  amountPlnInput: string;
  occurred_on: string; // YYYY-MM-DD
  client_request_id?: string;
}

/**
 * ViewModel pojedynczego zdarzenia celu w liście
 */
export interface GoalEventVM {
  id: string;
  goal_id: string;
  goal_name: string;
  type: "DEPOSIT" | "WITHDRAW";
  amount_cents: number;
  amount_pln: string;
  occurred_on: string;
  created_at: string;
}
