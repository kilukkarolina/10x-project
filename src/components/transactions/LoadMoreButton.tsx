// src/components/transactions/LoadMoreButton.tsx

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface LoadMoreButtonProps {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}

/**
 * LoadMoreButton - przycisk ładowania kolejnej strony transakcji
 *
 * Wyświetla się tylko gdy są kolejne strony do załadowania
 * Pokazuje spinner podczas ładowania
 */
export function LoadMoreButton({ hasMore, isLoading, onLoadMore }: LoadMoreButtonProps) {
  if (!hasMore) {
    return null;
  }

  return (
    <div className="flex justify-center py-6">
      <Button variant="outline" onClick={onLoadMore} disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="size-4 mr-2 animate-spin" />
            Ładowanie...
          </>
        ) : (
          "Załaduj więcej"
        )}
      </Button>
    </div>
  );
}
