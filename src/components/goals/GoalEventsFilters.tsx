// src/components/goals/GoalEventsFilters.tsx

import { MonthPicker } from "@/components/dashboard/MonthPicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import type { GoalEventFilterState, GoalEventsAggregates } from "./types";
import { formatCurrencyPL, formatCurrencyWithSignPL } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface GoalEventsFiltersProps {
  filters: GoalEventFilterState;
  aggregates: GoalEventsAggregates;
  onMonthChange: (month: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  isNextMonthDisabled: boolean;
  onTypeChange: (type: "ALL" | "DEPOSIT" | "WITHDRAW") => void;
}

/**
 * GoalEventsFilters - panel filtrów listy zdarzeń celu
 *
 * Zawiera:
 * - MonthPicker (wybór miesiąca)
 * - Select typu zdarzenia (ALL/DEPOSIT/WITHDRAW)
 * - Podsumowania miesięczne i łączne
 */
export function GoalEventsFilters({
  filters,
  aggregates,
  onMonthChange,
  onPrevMonth,
  onNextMonth,
  isNextMonthDisabled,
  onTypeChange,
}: GoalEventsFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Kontrolki filtrów */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Picker miesiąca */}
        <MonthPicker
          value={filters.month}
          onChange={onMonthChange}
          onPrev={onPrevMonth}
          onNext={onNextMonth}
          isNextDisabled={isNextMonthDisabled}
        />

        {/* Select typu */}
        <Select value={filters.type} onValueChange={onTypeChange}>
          <SelectTrigger className="w-[160px]" aria-label="Typ zdarzenia">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Wszystkie</SelectItem>
            <SelectItem value="DEPOSIT">
              <span className="flex items-center gap-2">
                <TrendingUp className="size-3 text-green-600" />
                Wpłaty
              </span>
            </SelectItem>
            <SelectItem value="WITHDRAW">
              <span className="flex items-center gap-2">
                <TrendingDown className="size-3 text-red-600" />
                Wypłaty
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Podsumowania */}
      <Card className="bg-gray-50">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Miesięczne */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-600 uppercase">W tym miesiącu</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Wpłaty:</span>
                  <span className="font-semibold text-green-700">
                    +{formatCurrencyPL(aggregates.monthDepositCents)} zł
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Wypłaty:</span>
                  <span className="font-semibold text-red-700">
                    -{formatCurrencyPL(aggregates.monthWithdrawCents)} zł
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t">
                  <span className="font-medium text-gray-700">Bilans:</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrencyWithSignPL(aggregates.monthNetCents)} zł
                  </span>
                </div>
              </div>
            </div>

            {/* Łączne (w zakresie załadowanych danych) */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-600 uppercase">Łącznie</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Wpłaty:</span>
                  <span className="font-semibold text-green-700">
                    +{formatCurrencyPL(aggregates.totalDepositCents)} zł
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Wypłaty:</span>
                  <span className="font-semibold text-red-700">
                    -{formatCurrencyPL(aggregates.totalWithdrawCents)} zł
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t">
                  <span className="font-medium text-gray-700">Bilans:</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrencyWithSignPL(aggregates.totalNetCents)} zł
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
