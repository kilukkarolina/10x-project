import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

/**
 * ErrorState - wyświetlanie błędów z opcją retry
 *
 * Używany dla:
 * - Błędy sieci/serwera (5xx)
 * - Timeout
 * - Inne nieoczekiwane błędy
 */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardContent className="flex flex-col items-center justify-center p-12">
        <div className="rounded-full bg-destructive/10 p-6 mb-6">
          <AlertTriangle className="size-12 text-destructive" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Wystąpił błąd</h2>
        <p className="text-muted-foreground text-center mb-6 max-w-md">{message}</p>
        {onRetry && (
          <Button onClick={onRetry} variant="default">
            <RefreshCw className="size-4 mr-2" />
            Spróbuj ponownie
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
