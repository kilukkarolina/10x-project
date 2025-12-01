import { useState, useEffect, useCallback, useRef } from "react";
import type { MonthlyMetricsDTO, ExpensesByCategoryResponseDTO, PriorityGoalMetricsDTO } from "@/types";

interface UseDashboardDataReturn {
  metrics: MonthlyMetricsDTO | null;
  expenses: ExpensesByCategoryResponseDTO | null;
  priorityGoal: PriorityGoalMetricsDTO | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const API_TIMEOUT = 10000; // 10 sekund

/**
 * Hook pobierający dane dashboard z API
 *
 * Odpowiedzialności:
 * - Równoległe pobieranie danych z 3 endpointów
 * - Obsługa AbortController przy zmianie miesiąca
 * - Zarządzanie stanami loading/error
 * - Cache per miesiąc
 */
export function useDashboardData(month: string, isInitialized: boolean): UseDashboardDataReturn {
  const [metrics, setMetrics] = useState<MonthlyMetricsDTO | null>(null);
  const [expenses, setExpenses] = useState<ExpensesByCategoryResponseDTO | null>(null);
  const [priorityGoal, setPriorityGoal] = useState<PriorityGoalMetricsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchCountRef = useRef(0);

  const fetchData = useCallback(async () => {
    // Anuluj poprzednie żądania
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Utwórz nowy AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const currentFetchCount = ++fetchCountRef.current;

    setLoading(true);
    setError(null);

    try {
      // Równoległe pobieranie danych z timeout
      const fetchWithTimeout = async (url: string, signal: AbortSignal) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        try {
          const response = await fetch(url, {
            signal: signal,
            cache: "no-cache",
            headers: {
              "Content-Type": "application/json",
            },
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            // Dla 404 na priority goal nie rzucamy błędu
            if (response.status === 404 && url.includes("priority-goal")) {
              return null;
            }

            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP ${response.status}`);
          }

          return await response.json();
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
      };

      const [metricsData, expensesData, priorityGoalData] = await Promise.allSettled([
        fetchWithTimeout(`/api/v1/metrics/monthly?month=${month}`, abortController.signal),
        fetchWithTimeout(`/api/v1/metrics/expenses-by-category?month=${month}`, abortController.signal),
        fetchWithTimeout(`/api/v1/metrics/priority-goal?month=${month}`, abortController.signal),
      ]);

      // Sprawdź czy to wciąż aktualne żądanie
      if (currentFetchCount !== fetchCountRef.current) {
        return;
      }

      // Wyciągnij dane lub błędy
      const newMetrics = metricsData.status === "fulfilled" ? metricsData.value : null;
      const newExpenses = expensesData.status === "fulfilled" ? expensesData.value : null;
      const newPriorityGoal = priorityGoalData.status === "fulfilled" ? priorityGoalData.value : null;

      setMetrics(newMetrics);
      setExpenses(newExpenses);
      setPriorityGoal(newPriorityGoal);

      // Jeśli metryki się nie załadowały, to jest krytyczny błąd
      if (metricsData.status === "rejected") {
        const err = metricsData.reason;
        if (err.name === "AbortError") {
          return;
        }
        setError(err.message || "Nie udało się załadować danych");
      }

      setLoading(false);
    } catch (err: unknown) {
      if (currentFetchCount !== fetchCountRef.current) {
        return;
      }

      const error = err as Error;
      if (error.name === "AbortError") {
        return;
      }

      setError(error.message || "Wystąpił nieoczekiwany błąd");
      setLoading(false);
    }
  }, [month]);

  // Efekt pobierający dane przy zmianie miesiąca (tylko po inicjalizacji)
  useEffect(() => {
    if (!isInitialized) return;

    fetchData();

    // Cleanup: anuluj żądania przy odmontowaniu
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData, isInitialized]);

  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    metrics,
    expenses,
    priorityGoal,
    loading,
    error,
    refetch,
  };
}
