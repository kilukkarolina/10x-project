// src/components/goals/mappers.ts

import type { GoalDTO, GoalEventDTO } from "@/types";
import type { GoalListItemVM, GoalDetailVM, GoalEventVM } from "./types";
import { formatCurrencyPL, formatCurrencyWithSignPL } from "@/lib/utils";

/**
 * Mapuje GoalDTO na GoalListItemVM
 * @param dto - GoalDTO z API
 * @returns GoalListItemVM z sformatowanymi kwotami
 */
export function mapGoalDtoToVm(dto: GoalDTO): GoalListItemVM {
  return {
    id: dto.id,
    name: dto.name,
    type_code: dto.type_code,
    type_label: dto.type_label,
    target_amount_cents: dto.target_amount_cents,
    target_amount_pln: formatCurrencyPL(dto.target_amount_cents),
    current_balance_cents: dto.current_balance_cents,
    current_balance_pln: formatCurrencyPL(dto.current_balance_cents),
    progress_percentage: dto.progress_percentage,
    is_priority: dto.is_priority,
    archived_at: dto.archived_at,
    created_at: dto.created_at,
    updated_at: dto.updated_at,
  };
}

/**
 * Mapuje GoalDTO na GoalDetailVM
 * @param dto - GoalDTO z API
 * @returns GoalDetailVM z sformatowanymi kwotami i flagą archiwizacji
 */
export function mapGoalDtoToDetailVm(dto: GoalDTO): GoalDetailVM {
  const base = mapGoalDtoToVm(dto);
  return {
    ...base,
    isArchived: dto.archived_at !== null,
  };
}

/**
 * Mapuje GoalEventDTO na GoalEventVM
 * @param dto - GoalEventDTO z API
 * @returns GoalEventVM z sformatowaną kwotą
 */
export function mapGoalEventDtoToVm(dto: GoalEventDTO): GoalEventVM {
  return {
    id: dto.id,
    goal_id: dto.goal_id,
    goal_name: dto.goal_name,
    type: dto.type as "DEPOSIT" | "WITHDRAW",
    amount_cents: dto.amount_cents,
    amount_pln: formatCurrencyWithSignPL(dto.type === "DEPOSIT" ? dto.amount_cents : -dto.amount_cents),
    occurred_on: dto.occurred_on,
    created_at: dto.created_at,
  };
}
