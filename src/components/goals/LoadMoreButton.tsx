// src/components/goals/LoadMoreButton.tsx

import { Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LoadMoreButtonProps {
  onClick: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

/**
 * LoadMoreButton - przycisk ładowania kolejnej strony danych
 *
 * Wyświetla:
 * - Stan loading (spinner)
 * - Disabled gdy brak więcej danych
 */
export function LoadMoreButton({ onClick, isLoading, disabled = false }: LoadMoreButtonProps) {
  return (
    <div className="flex justify-center py-4">
      <Button
        variant="outline"
        onClick={onClick}
        disabled={isLoading || disabled}
        className="gap-2"
        aria-label="Załaduj więcej"
      >
        {isLoading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Ładowanie...
          </>
        ) : (
          <>
            <ChevronDown className="size-4" />
            Załaduj więcej
          </>
        )}
      </Button>
    </div>
  );
}
