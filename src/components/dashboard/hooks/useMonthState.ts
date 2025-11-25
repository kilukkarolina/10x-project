import { useState, useCallback, useEffect } from "react";
import { parseMonth, getCurrentMonth, isMonthValid } from "@/lib/utils";

export type DashboardMonth = string; // "YYYY-MM"

interface UseMonthStateReturn {
  month: DashboardMonth;
  setMonth: (month: DashboardMonth) => void;
  goPrev: () => void;
  goNext: () => void;
  isNextDisabled: boolean;
}

const STORAGE_KEY = "ff.dashboard.month";

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
  // Inicjalizacja stanu z localStorage lub URL lub bieżącego miesiąca
  const [month, setMonthInternal] = useState<DashboardMonth>(() => {
    // Próba pobrania z URL
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlMonth = params.get("month");
      const parsedUrlMonth = parseMonth(urlMonth);

      if (parsedUrlMonth && isMonthValid(parsedUrlMonth)) {
        return parsedUrlMonth;
      }

      // Próba pobrania z localStorage
      try {
        const storedMonth = localStorage.getItem(STORAGE_KEY);
        const parsedStoredMonth = parseMonth(storedMonth);

        if (parsedStoredMonth && isMonthValid(parsedStoredMonth)) {
          return parsedStoredMonth;
        }
      } catch (error) {
        console.error("Failed to read from localStorage:", error);
      }
    }

    // Fallback do bieżącego miesiąca
    return getCurrentMonth();
  });

  // Synchronizacja z localStorage przy zmianie miesiąca
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, month);
      } catch (error) {
        console.error("Failed to write to localStorage:", error);
      }
    }
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
    setMonth,
    goPrev,
    goNext,
    isNextDisabled,
  };
}
