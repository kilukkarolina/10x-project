import type { RateLimitBannerProps } from "@/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

/**
 * Baner informujący o przekroczeniu limitu (429)
 * Pokazuje odliczanie czasu do momentu gdy można ponowić akcję
 * Automatycznie znika gdy licznik osiągnie 0
 */
export function RateLimitBanner({ rateLimit, onRetry, onClear, topOffset = 0 }: RateLimitBannerProps) {
  if (!rateLimit) {
    return null;
  }

  const { secondsLeft, message } = rateLimit;

  // Formatowanie czasu w sekundach (jeśli > 60s, pokaż minuty)
  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  };

  const handleRetry = () => {
    if (secondsLeft <= 0 && onRetry) {
      onRetry();
    }
    onClear();
  };

  const canRetry = secondsLeft <= 0;
  const defaultMessage = "Przekroczono limit zapytań. Spróbuj ponownie za";

  return (
    <div
      className="fixed left-0 right-0 z-50 px-4 pt-4"
      style={{ top: `${topOffset}px` }}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto max-w-screen-xl">
        <Alert className="bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800 shadow-md">
          <Clock className="h-5 w-5 text-orange-600 dark:text-orange-500 shrink-0" />
          <div className="flex items-start justify-between gap-4 flex-1">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">
                {message || defaultMessage}
                {secondsLeft > 0 && (
                  <span className="inline-block ml-1 font-mono font-bold">{formatTime(secondsLeft)}</span>
                )}
              </p>
              {secondsLeft <= 0 && (
                <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">Możesz teraz spróbować ponownie</p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={!canRetry && !onRetry}
              className="shrink-0 border-orange-300 hover:bg-orange-100 dark:border-orange-700 dark:hover:bg-orange-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={canRetry ? "Spróbuj załadować ponownie" : "Zamknij baner"}
            >
              {canRetry ? "Spróbuj ponownie" : "Zamknij"}
            </Button>
          </div>
        </Alert>
      </div>
    </div>
  );
}
