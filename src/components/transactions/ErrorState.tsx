// src/components/transactions/ErrorState.tsx

import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  error: string;
  onRetry: () => void;
}

/**
 * ErrorState - stan błędu dla widoku Transakcje
 *
 * Wyświetlany gdy wystąpi błąd podczas pobierania danych
 * Zawiera przycisk "Spróbuj ponownie"
 */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10 mb-4">
        <AlertCircle className="size-8 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Wystąpił błąd</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">{error}</p>
      <Button onClick={onRetry} variant="outline">
        <RefreshCw className="size-4 mr-2" />
        Spróbuj ponownie
      </Button>
    </div>
  );
}
