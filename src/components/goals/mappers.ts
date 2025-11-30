// src/components/goals/mappers.ts

import type { GoalDTO } from "@/types";
import type { GoalListItemVM } from "./types";
import { formatCurrencyPL } from "@/lib/utils";

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

