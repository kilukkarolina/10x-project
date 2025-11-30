import type { GlobalErrorScreenProps } from "@/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

/**
 * Ekran błędu krytycznego dla 5xx/awarii
 * Wyświetlany jako fallback dla GlobalErrorBoundary
 * Prezentuje ikonę, tytuł, opis i przyciski akcji
 */
export function GlobalErrorScreen({ title, message, statusCode, onRetry, homeHref = "/" }: GlobalErrorScreenProps) {
  const handleRefresh = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    window.location.href = homeHref;
  };

  // Określ wariant kolorystyczny na podstawie statusCode
  const is5xx = statusCode && statusCode >= 500 && statusCode <= 599;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="max-w-md w-full border-destructive/50 shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-destructive/10 p-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          {statusCode && (
            <CardDescription className="text-base">
              {is5xx ? "Błąd serwera" : "Błąd"} (kod: {statusCode})
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="text-center">
          <p className="text-muted-foreground">{message}</p>
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          {/* Przycisk Spróbuj ponownie - jeśli przekazano handler */}
          {onRetry && (
            <Button onClick={onRetry} className="w-full" variant="default">
              <RefreshCw className="mr-2 h-4 w-4" />
              Spróbuj ponownie
            </Button>
          )}

          {/* Przycisk Odśwież stronę */}
          <Button onClick={handleRefresh} className="w-full" variant={onRetry ? "outline" : "default"}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Odśwież stronę
          </Button>

          {/* Przycisk Wróć na główną */}
          <Button onClick={handleGoHome} className="w-full" variant="outline">
            <Home className="mr-2 h-4 w-4" />
            Wróć na główną
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
