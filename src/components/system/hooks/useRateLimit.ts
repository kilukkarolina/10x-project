import { useState, useEffect, useCallback } from "react";
import type { RateLimitInfo, RateLimitScope } from "@/types";

interface NotifyRateLimitParams {
  scope: RateLimitScope;
  retryAfterSeconds: number;
  message?: string;
}

interface UseRateLimitReturn {
  rateLimit: RateLimitInfo | null;
  notify429: (params: NotifyRateLimitParams) => void;
  clear: () => void;
}

/**
 * Hook do zarządzania stanem rate limit (429)
 * Obsługuje odliczanie czasu i automatyczne czyszczenie po osiągnięciu 0
 *
 * @returns {UseRateLimitReturn} - stan rate limit i metody do zarządzania
 */
export function useRateLimit(): UseRateLimitReturn {
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);

  // Metoda do zgłaszania nowego rate limit
  const notify429 = useCallback((params: NotifyRateLimitParams) => {
    const { scope, retryAfterSeconds, message } = params;

    // Fallback do 60s jeśli brak wartości lub wartość nieprawidłowa
    const seconds = retryAfterSeconds > 0 ? retryAfterSeconds : 60;

    const retryAt = Date.now() + seconds * 1000;

    setRateLimit({
      scope,
      retryAt,
      secondsLeft: seconds,
      message,
    });
  }, []);

  // Metoda do czyszczenia rate limit
  const clear = useCallback(() => {
    setRateLimit(null);
  }, []);

  // Timer do aktualizacji secondsLeft co sekundę
  useEffect(() => {
    if (!rateLimit) {
      return;
    }

    // Funkcja aktualizująca pozostały czas
    const updateSecondsLeft = () => {
      const now = Date.now();
      const secondsLeft = Math.max(0, Math.ceil((rateLimit.retryAt - now) / 1000));

      if (secondsLeft <= 0) {
        // Auto-clear po osiągnięciu 0
        setRateLimit(null);
      } else {
        // Aktualizuj tylko secondsLeft, zachowaj resztę
        setRateLimit((prev) => (prev ? { ...prev, secondsLeft } : null));
      }
    };

    // Ustaw timer na co 1 sekundę
    const intervalId = setInterval(updateSecondsLeft, 1000);

    // Natychmiastowa aktualizacja
    updateSecondsLeft();

    // Cleanup - wyczyść interval przy unmount lub zmianie rateLimit
    return () => {
      clearInterval(intervalId);
    };
  }, [rateLimit?.retryAt]); // Zależność tylko od retryAt, żeby nie resetować timera przy każdej aktualizacji secondsLeft

  return { rateLimit, notify429, clear };
}
