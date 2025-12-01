import { useState, useCallback, useEffect } from "react";
import { parseMonth, getCurrentMonth, isMonthValid } from "@/lib/utils";
import { emitAppEvent, listenToAppEvent, AppEvent } from "@/lib/events";

export type DashboardMonth = string; // "YYYY-MM"

interface UseMonthStateReturn {
  month: DashboardMonth;
  isInitialized: boolean;
  setMonth: (month: DashboardMonth) => void;
  goPrev: () => void;
  goNext: () => void;
  isNextDisabled: boolean;
}

const STORAGE_KEY = "ff.month";

/**
 * Hook zarządzający stanem miesiąca w Dashboard
 *
 * Odpowiedzialności:
 * - Zarządzanie bieżącym miesiącem
 * - Synchronizacja z localStorage
 * - Nawigacja między miesiącami (prev/next)
 * - Blokada miesięcy przyszłych
 * - Walidacja formatu YYYY-MM
 */
export function useMonthState(): UseMonthStateReturn {
  // Zawsze inicjalizuj z getCurrentMonth() aby uniknąć hydration mismatch
  // localStorage i URL będą załadowane w useEffect
  const [month, setMonthInternal] = useState<DashboardMonth>(getCurrentMonth());
  const [isInitialized, setIsInitialized] = useState(false);

  // Załaduj miesiąc z URL lub localStorage po montowaniu (tylko klient)
  useEffect(() => {
    if (isInitialized) return;

    // Próba pobrania z URL (priorytet)
    const params = new URLSearchParams(window.location.search);
    const urlMonth = params.get("month");
    const parsedUrlMonth = parseMonth(urlMonth);

    if (parsedUrlMonth && isMonthValid(parsedUrlMonth)) {
      setMonthInternal(parsedUrlMonth);
      setIsInitialized(true);
      return;
    }

    // Próba pobrania z localStorage
    try {
      const storedMonth = localStorage.getItem(STORAGE_KEY);
      const parsedStoredMonth = parseMonth(storedMonth);

      if (parsedStoredMonth && isMonthValid(parsedStoredMonth)) {
        setMonthInternal(parsedStoredMonth);
      }
    } catch (error) {
      console.error("Failed to read from localStorage:", error);
    }

    setIsInitialized(true);
  }, [isInitialized]);

  // Synchronizacja z localStorage przy zmianie miesiąca + emitowanie eventu
  useEffect(() => {
    if (!isInitialized) return;

    try {
      localStorage.setItem(STORAGE_KEY, month);
      // Emituj event o zmianie miesiąca
      emitAppEvent(AppEvent.MONTH_CHANGED, {
        month,
        source: "dashboard",
      });
    } catch (error) {
      console.error("Failed to write to localStorage:", error);
    }
  }, [month, isInitialized]);

  // Nasłuchuj na zmiany miesiąca z innych widoków
  useEffect(() => {
    const cleanup = listenToAppEvent(AppEvent.MONTH_CHANGED, (detail) => {
      if (!detail) return;
      const { month: newMonth, source } = detail as { month: string; source: string };

      // Ignoruj swoje własne eventy
      if (source === "dashboard") return;

      // Aktualizuj stan jeśli miesiąc jest inny
      if (newMonth !== month) {
        setMonthInternal(newMonth);
      }
    });

    return cleanup;
  }, [month]);

  // Setter z walidacją
  const setMonth = useCallback((newMonth: DashboardMonth) => {
    const parsed = parseMonth(newMonth);

    if (!parsed) {
      if (process.env.NODE_ENV === "development") {
        console.error(`Invalid month format: ${newMonth}`);
      }
      return;
    }

    if (!isMonthValid(parsed)) {
      if (process.env.NODE_ENV === "development") {
        console.error(`Month cannot be in the future: ${parsed}`);
      }
      return;
    }

    setMonthInternal(parsed);
  }, []);

  // Nawigacja do poprzedniego miesiąca
  const goPrev = useCallback(() => {
    const [year, monthNum] = month.split("-").map(Number);

    let newYear = year;
    let newMonth = monthNum - 1;

    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }

    const newMonthStr = `${newYear}-${newMonth.toString().padStart(2, "0")}`;
    setMonth(newMonthStr);
  }, [month, setMonth]);

  // Nawigacja do następnego miesiąca
  const goNext = useCallback(() => {
    const [year, monthNum] = month.split("-").map(Number);

    let newYear = year;
    let newMonth = monthNum + 1;

    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }

    const newMonthStr = `${newYear}-${newMonth.toString().padStart(2, "0")}`;

    // Sprawdź czy nowy miesiąc nie jest w przyszłości
    if (isMonthValid(newMonthStr)) {
      setMonth(newMonthStr);
    }
  }, [month, setMonth]);

  // Sprawdź czy przycisk "Next" powinien być zablokowany
  const isNextDisabled = month === getCurrentMonth();

  return {
    month,
    isInitialized,
    setMonth,
    goPrev,
    goNext,
    isNextDisabled,
  };
}
