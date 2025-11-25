import { FileBarChart, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  visible: boolean;
}

/**
 * EmptyState - stan pusty gdy brak danych w miesiącu
 *
 * Wyświetlany gdy:
 * - Brak transakcji w wybranym miesiącu
 * - Wszystkie metryki są zerowe
 */
export function EmptyState({ visible }: EmptyStateProps) {
  if (!visible) return null;

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center p-12">
        <div className="rounded-full bg-muted p-6 mb-6">
          <FileBarChart className="size-12 text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Brak danych w tym miesiącu</h2>
        <p className="text-muted-foreground text-center mb-6 max-w-md">
          Nie znaleziono żadnych transakcji w tym okresie. Dodaj pierwszą transakcję, aby zobaczyć statystyki.
        </p>
        <Button asChild>
          <a href="/transactions">
            <Plus className="size-4 mr-2" />
            Dodaj transakcję
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
