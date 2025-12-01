// src/components/goals/GoalListItem.tsx

import React from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { GoalPriorityToggle } from "./GoalPriorityToggle";
import { GoalArchiveButton } from "./GoalArchiveButton";
import type { GoalListItemVM } from "./types";
import { Archive, ArrowRight } from "lucide-react";

interface GoalListItemProps {
  item: GoalListItemVM;
  onTogglePriority: (id: string, next: boolean) => void;
  onArchiveClick: (id: string) => void;
  isPriorityUpdating: boolean;
}

/**
 * GoalListItem - pojedynczy cel w liście
 *
 * Wyświetla:
 * - Nazwę, typ, kwoty (cel, aktualny stan)
 * - Pasek postępu
 * - Statusy (badge: Priorytet, Zarchiwizowany)
 * - Akcje (toggle priorytet, archiwizuj)
 */
export function GoalListItem({ item, onTogglePriority, onArchiveClick, isPriorityUpdating }: GoalListItemProps) {
  const isArchived = item.archived_at !== null;

  // Określenie czy można archiwizować
  const canArchive = !isArchived && !item.is_priority;
  const archiveDisabledReason = item.is_priority
    ? "Najpierw usuń priorytet, aby zarchiwizować cel"
    : isArchived
      ? "Ten cel jest już zarchiwizowany"
      : undefined;

  const handleCardClick = () => {
    window.location.href = `/goals/${item.id}`;
  };

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <Card
      className={`group hover:shadow-md hover:border-primary/50 transition-all overflow-hidden cursor-pointer ${
        isArchived ? "bg-muted/30 opacity-75" : ""
      }`}
      onClick={handleCardClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold truncate break-words" title={item.name}>
                {item.name}
              </h3>
              <ArrowRight
                className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                aria-hidden="true"
              />
            </div>
            <p className="text-sm text-muted-foreground truncate break-words" title={item.type_label}>
              {item.type_label}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end flex-shrink-0">
            {item.is_priority && (
              <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 whitespace-nowrap">
                Priorytet
              </Badge>
            )}
            {isArchived && (
              <Badge variant="secondary" className="gap-1 whitespace-nowrap">
                <Archive className="size-3" />
                Zarchiwizowany
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Kwoty */}
        <div className="flex justify-between items-baseline text-sm">
          <span className="text-muted-foreground">Stan aktualny:</span>
          <span className="font-semibold text-base">{item.current_balance_pln} zł</span>
        </div>
        <div className="flex justify-between items-baseline text-sm">
          <span className="text-muted-foreground">Cel:</span>
          <span className="font-semibold text-base">{item.target_amount_pln} zł</span>
        </div>

        {/* Pasek postępu */}
        <div className="space-y-1">
          <div className="flex justify-between items-baseline text-xs text-muted-foreground">
            <span>Postęp</span>
            <span className="font-medium">{Math.min(item.progress_percentage, 100).toFixed(1)}%</span>
          </div>
          <Progress value={Math.min(item.progress_percentage, 100)} className="h-2" />
        </div>
      </CardContent>

      <CardFooter className="flex gap-2 pt-3 border-t" onClick={handleActionClick}>
        {/* Akcje */}
        {!isArchived && (
          <GoalPriorityToggle
            checked={item.is_priority}
            onChange={(next) => onTogglePriority(item.id, next)}
            disabled={isArchived}
            isLoading={isPriorityUpdating}
          />
        )}
        <GoalArchiveButton
          onClick={() => onArchiveClick(item.id)}
          disabled={!canArchive}
          disabledReason={archiveDisabledReason}
        />
      </CardFooter>
    </Card>
  );
}
