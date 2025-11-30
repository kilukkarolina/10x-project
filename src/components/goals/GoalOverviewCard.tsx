// src/components/goals/GoalOverviewCard.tsx

import { Archive, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GoalPriorityToggle } from "./GoalPriorityToggle";
import { GoalMonthlyChangeBadge } from "./GoalMonthlyChangeBadge";
import type { GoalDetailVM } from "./types";
import { formatCurrencyPL } from "@/lib/utils";

interface GoalOverviewCardProps {
  goal: GoalDetailVM;
  monthNetCents: number;
  onDeposit: () => void;
  onWithdraw: () => void;
  onPriorityToggle?: (isPriority: boolean) => void;
}

/**
 * GoalOverviewCard - karta przeglądu celu
 *
 * Wyświetla:
 * - Nazwę celu i typ
 * - Status (priorytet/archiwum)
 * - Saldo obecne i docelowe
 * - Pasek postępu
 * - Zmianę miesięczną
 * - Akcje: Wpłać / Wypłać
 */
export function GoalOverviewCard({
  goal,
  monthNetCents,
  onDeposit,
  onWithdraw,
  onPriorityToggle,
}: GoalOverviewCardProps) {
  const isArchived = goal.isArchived;
  const progressPct = Math.min(goal.progress_percentage, 100); // Cap na 100%

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="text-2xl">{goal.name}</CardTitle>
            <CardDescription className="mt-1">{goal.type_label}</CardDescription>
          </div>

          {/* Status badges */}
          <div className="flex flex-col gap-2 items-end">
            {isArchived && (
              <Badge variant="secondary" className="gap-1">
                <Archive className="size-3" />
                Zarchiwizowane
              </Badge>
            )}

            {goal.is_priority && !isArchived && (
              <Badge variant="default" className="gap-1 bg-amber-500 text-white">
                ⭐ Priorytet
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Saldo i cel */}
        <div className="space-y-4">
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-medium text-gray-600">Obecne saldo:</span>
            <span className="text-2xl font-bold text-gray-900">{formatCurrencyPL(goal.current_balance_cents)} zł</span>
          </div>

          <div className="flex justify-between items-baseline">
            <span className="text-sm font-medium text-gray-600">Cel:</span>
            <span className="text-lg font-semibold text-gray-700">{formatCurrencyPL(goal.target_amount_cents)} zł</span>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">Postęp</span>
              <span className="text-xs font-bold text-gray-700">{progressPct.toFixed(0)}%</span>
            </div>
            <Progress value={progressPct} className="h-3" />
          </div>
        </div>

        {/* Zmiana miesięczna */}
        <GoalMonthlyChangeBadge monthNetCents={monthNetCents} />

        {/* Akcje */}
        <div className="space-y-3 pt-4 border-t">
          <div className="flex gap-2">
            {isArchived ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-1 flex gap-2">
                      <Button disabled className="flex-1 gap-2">
                        <TrendingUp className="size-4" />
                        Wpłać
                      </Button>
                      <Button disabled variant="outline" className="flex-1 gap-2">
                        <TrendingDown className="size-4" />
                        Wypłać
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Nie można dodawać wpłat/wypłat do zarchiwizowanego celu</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <>
                <Button onClick={onDeposit} className="flex-1 gap-2">
                  <TrendingUp className="size-4" />
                  Wpłać
                </Button>
                <Button onClick={onWithdraw} variant="outline" className="flex-1 gap-2">
                  <TrendingDown className="size-4" />
                  Wypłać
                </Button>
              </>
            )}
          </div>

          {/* Priority toggle (opcjonalnie) */}
          {onPriorityToggle && (
            <div className="flex justify-center">
              <GoalPriorityToggle checked={goal.is_priority} disabled={isArchived} onChange={onPriorityToggle} />
            </div>
          )}
        </div>

        {/* Info o archiwizacji */}
        {isArchived && (
          <div className="text-xs text-gray-500 pt-2 border-t">
            <p>
              Cel został zarchiwizowany. Historia zdarzeń pozostaje dostępna, ale nie można dodawać nowych wpłat ani
              wypłat.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
