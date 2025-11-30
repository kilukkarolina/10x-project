// src/components/audit-log/EmptyState.tsx

import { FileText } from "lucide-react";

/**
 * EmptyState - stan pusty dla widoku Audit Log
 *
 * Wyświetlany gdy brak danych w wybranym zakresie
 */
export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted mb-4">
        <FileText className="size-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Brak wpisów w dzienniku zmian</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        Nie znaleziono żadnych wpisów w wybranym zakresie. Spróbuj zmienić filtry lub zakres dat.
      </p>
      <p className="text-xs text-muted-foreground mt-4">Dane dziennika zmian przechowywane są przez ostatnie 30 dni.</p>
    </div>
  );
}
