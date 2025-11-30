import type { OfflineBannerProps } from "@/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

/**
 * Baner informujący o pracy offline
 * Wyświetla się na górze ekranu gdy użytkownik traci połączenie z internetem
 * Automatycznie znika po powrocie online
 */
export function OfflineBanner({ visible }: OfflineBannerProps) {
  if (!visible) {
    return null;
  }

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-4 pt-4" role="status" aria-live="polite">
      <div className="mx-auto max-w-screen-xl">
        <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 shadow-md">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0" />
          <div className="flex items-start justify-between gap-4 flex-1">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Jesteś offline</p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Niektóre funkcje mogą nie działać. Sprawdź połączenie z internetem.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="shrink-0 border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/40"
              aria-label="Spróbuj załadować ponownie"
            >
              Spróbuj ponownie
            </Button>
          </div>
        </Alert>
      </div>
    </div>
  );
}
