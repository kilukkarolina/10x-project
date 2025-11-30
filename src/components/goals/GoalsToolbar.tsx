// src/components/goals/GoalsToolbar.tsx

import { Button } from "@/components/ui/button";
import { Plus, Archive } from "lucide-react";

interface GoalsToolbarProps {
  includeArchived: boolean;
  onToggleArchived: (value: boolean) => void;
  onCreateClick: () => void;
  totalCount: number;
  archivedCount: number;
}

/**
 * GoalsToolbar - pasek akcji nad listą celów
 *
 * Zawiera:
 * - Tytuł z licznikiem
 * - Przełącznik "Pokaż archiwalne"
 * - Przycisk "Utwórz cel"
 */
export function GoalsToolbar({ includeArchived, onToggleArchived, onCreateClick, totalCount, archivedCount }: GoalsToolbarProps) {
  // Formatowanie licznika celów
  const getCountLabel = () => {
    if (totalCount === 0) return null;
    
    const baseLabel = totalCount === 1 ? "1 cel" : `${totalCount} celów`;
    
    // Jeśli widok z archiwalnymi i są jakieś zarchiwizowane
    if (includeArchived && archivedCount > 0) {
      const archivedLabel = archivedCount === 1 ? "1 nieaktywny" : `${archivedCount} nieaktywne`;
      return `${baseLabel} (w tym ${archivedLabel})`;
    }
    
    return baseLabel;
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Cele oszczędnościowe</h1>
        {totalCount > 0 && (
          <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded-md">
            {getCountLabel()}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Przełącznik archiwalnych */}
        <button
          type="button"
          onClick={() => onToggleArchived(!includeArchived)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-pressed={includeArchived}
        >
          <div
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              includeArchived ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                includeArchived ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </div>
          <Archive className="size-4" />
          <span>Pokaż archiwalne</span>
        </button>

        {/* Przycisk utworzenia */}
        <Button onClick={onCreateClick} size="default">
          <Plus className="size-4 mr-2" />
          Utwórz cel
        </Button>
      </div>
    </div>
  );
}

