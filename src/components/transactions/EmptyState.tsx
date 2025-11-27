// src/components/transactions/EmptyState.tsx

import { Button } from "@/components/ui/button";
import { Plus, FileText } from "lucide-react";

interface EmptyStateProps {
  onAddTransaction: () => void;
  hasFilters?: boolean;
}

/**
 * EmptyState - stan pusty dla widoku Transakcje
 *
 * Wyświetlany gdy:
 * - Brak transakcji w systemie (hasFilters = false)
 * - Brak transakcji dla wybranych filtrów (hasFilters = true)
 */
export function EmptyState({ onAddTransaction, hasFilters = false }: EmptyStateProps) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-muted mb-4">
          <FileText className="size-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Brak transakcji</h3>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          Nie znaleziono transakcji dla wybranych filtrów. Spróbuj zmienić kryteria wyszukiwania lub dodaj nową
          transakcję.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="flex size-20 items-center justify-center rounded-full bg-primary/10 mb-4">
        <FileText className="size-10 text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">Brak transakcji</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        Wygląda na to, że nie masz jeszcze żadnych transakcji. Dodaj swoją pierwszą transakcję, aby zacząć śledzić swoje
        finanse.
      </p>
      <Button onClick={onAddTransaction} size="lg">
        <Plus className="size-5 mr-2" />
        Dodaj pierwszą transakcję
      </Button>
    </div>
  );
}
