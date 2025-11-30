// src/components/goals/GoalMonthlyChangeBadge.tsx

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyWithSignPL } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface GoalMonthlyChangeBadgeProps {
  monthNetCents: number;
  className?: string;
}

/**
 * GoalMonthlyChangeBadge - badge pokazujący zmianę salda celu w miesiącu
 *
 * Wyświetla:
 * - Wartość netto (DEPOSIT - WITHDRAW) dla wybranego miesiąca
 * - Ikonę trendu (↑/↓/−)
 * - Kolor w zależności od kierunku (zielony/czerwony/szary)
 */
export function GoalMonthlyChangeBadge({ monthNetCents, className }: GoalMonthlyChangeBadgeProps) {
  // Określ trend i kolor
  const isPositive = monthNetCents > 0;
  const isNegative = monthNetCents < 0;

  // Ikona trendu
  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

  // Kolor badge
  const badgeVariant = isPositive ? "default" : isNegative ? "destructive" : "secondary";

  // Klasy koloru
  const colorClasses = isPositive
    ? "bg-green-100 text-green-800 border-green-200"
    : isNegative
      ? "bg-red-100 text-red-800 border-red-200"
      : "bg-gray-100 text-gray-600 border-gray-200";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-sm font-medium text-gray-600">Zmiana w miesiącu:</span>
      <Badge variant={badgeVariant} className={cn("gap-1 px-2 py-1", colorClasses)}>
        <TrendIcon className="size-3" aria-hidden="true" />
        <span className="font-semibold">{formatCurrencyWithSignPL(monthNetCents)} zł</span>
      </Badge>
    </div>
  );
}
