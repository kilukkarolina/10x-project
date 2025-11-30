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

