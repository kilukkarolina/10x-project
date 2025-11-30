// src/components/goals/GoalEventRow.tsx

import { Pencil, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { GoalEventVM } from "./types";
import { cn } from "@/lib/utils";

interface GoalEventRowProps {
  event: GoalEventVM;
  onEdit: (event: GoalEventVM) => void;
}

/**
 * GoalEventRow - wiersz pojedynczego zdarzenia celu
 *
 * Wyświetla:
 * - Data wystąpienia (occurred_on)
 * - Typ zdarzenia (DEPOSIT/WITHDRAW) jako badge z ikoną
 * - Kwota (z kolorem zależnym od typu)
 * - Data utworzenia (w tooltipie)
 * - Przycisk Edytuj
 */
export function GoalEventRow({ event, onEdit }: GoalEventRowProps) {
  const isDeposit = event.type === "DEPOSIT";

  // Format daty (YYYY-MM-DD → DD.MM.YYYY)
  const formatDate = (dateStr: string): string => {
    const [year, month, day] = dateStr.split("-");
    return `${day}.${month}.${year}`;
  };

  // Format datetime (ISO → DD.MM.YYYY HH:MM)
  const formatDateTime = (isoStr: string): string => {
    const date = new Date(isoStr);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  };

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b hover:bg-gray-50 transition-colors">
      {/* Lewa strona - data i typ */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Data wystąpienia */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm font-medium text-gray-700 whitespace-nowrap cursor-help">
                {formatDate(event.occurred_on)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Utworzono: {formatDateTime(event.created_at)}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Typ zdarzenia */}
        <Badge
          variant={isDeposit ? "default" : "secondary"}
          className={cn(
            "gap-1 px-2 py-0.5 text-xs flex-shrink-0",
            isDeposit ? "bg-green-100 text-green-800 border-green-200" : "bg-red-100 text-red-800 border-red-200"
          )}
        >
          {isDeposit ? (
            <>
              <TrendingUp className="size-3" />
              Wpłata
            </>
          ) : (
            <>
              <TrendingDown className="size-3" />
              Wypłata
            </>
          )}
        </Badge>
      </div>

      {/* Prawa strona - kwota i akcje */}
      <div className="flex items-center gap-3">
        {/* Kwota */}
        <span className={cn("text-base font-bold whitespace-nowrap", isDeposit ? "text-green-700" : "text-red-700")}>
          {event.amount_pln} zł
        </span>

        {/* Przycisk Edytuj */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(event)}
          className="size-8 flex-shrink-0"
          aria-label="Edytuj zdarzenie"
        >
          <Pencil className="size-4 text-gray-600" />
        </Button>
      </div>
    </div>
  );
}
