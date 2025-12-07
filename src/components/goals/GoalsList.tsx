// src/components/goals/GoalsList.tsx

import { GoalListItem } from "./GoalListItem";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import type { GoalListItemVM } from "./types";

interface GoalsListProps {
  items: GoalListItemVM[];
  isLoading: boolean;
  error: string | null;
  hasFilters: boolean;
  onTogglePriority: (id: string, next: boolean) => void;
  onArchiveClick: (id: string) => void;
  onCreateGoal: () => void;
  onRetry: () => void;
  priorityUpdatingGoalId: string | null;
}

/**
 * GoalsList - lista celów
 *
 * Prezentuje:
 * - Listę GoalListItem z akcjami
 * - EmptyState (brak celów)
 * - ErrorState (błąd)
 * - Skeleton (ładowanie)
 */
export function GoalsList({
  items,
  isLoading,
  error,
  hasFilters,
  onTogglePriority,
  onArchiveClick,
  onCreateGoal,
  onRetry,
  priorityUpdatingGoalId,
}: GoalsListProps) {
  // Stan błędu
  if (error && !isLoading) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  // Stan ładowania
  if (isLoading && items.length === 0) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-lg" />
        ))}
      </div>
    );
  }

  // Stan pusty
  if (items.length === 0 && !isLoading) {
    return <EmptyState onCreateGoal={onCreateGoal} hasFilters={hasFilters} />;
  }

  // Lista celów
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <GoalListItem
          key={item.id}
          item={item}
          onTogglePriority={onTogglePriority}
          onArchiveClick={onArchiveClick}
          isPriorityUpdating={priorityUpdatingGoalId === item.id}
        />
      ))}
    </div>
  );
}
