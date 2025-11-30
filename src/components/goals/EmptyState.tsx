// src/components/goals/EmptyState.tsx

import { Button } from "@/components/ui/button";
import { Plus, Target } from "lucide-react";

interface EmptyStateProps {
  onCreateGoal: () => void;
  hasFilters?: boolean;
}

/**
 * EmptyState - stan pusty dla widoku Cele
 *
 * Wyświetlany gdy:
 * - Brak celów w systemie (hasFilters = false)
 * - Brak celów dla wybranych filtrów (hasFilters = true)
 */
export function EmptyState({ onCreateGoal, hasFilters = false }: EmptyStateProps) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-muted mb-4">
          <Target className="size-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Brak zarchiwizowanych celów</h3>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          Nie masz jeszcze żadnych zarchiwizowanych celów. Archiwizacja pozwala ukryć nieaktualne cele bez utraty historii.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="flex size-20 items-center justify-center rounded-full bg-primary/10 mb-4">
        <Target className="size-10 text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">Brak celów oszczędnościowych</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        Wygląda na to, że nie masz jeszcze żadnych celów. Utwórz swój pierwszy cel, aby zacząć planować oszczędności.
      </p>
      <Button onClick={onCreateGoal} size="lg">
        <Plus className="size-5 mr-2" />
        Utwórz pierwszy cel
      </Button>
    </div>
  );
}

