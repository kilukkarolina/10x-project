import { useEffect, useRef } from "react";
import { useMonthState } from "./hooks/useMonthState";
import { useDashboardData } from "./hooks/useDashboardData";
import { useBackdateFlag } from "./hooks/useBackdateFlag";
import { MonthPicker } from "./MonthPicker";
import { BackdateBanner } from "./BackdateBanner";
import { MetricsCards } from "./MetricsCards";
import { ExpensesByCategoryChart } from "./ExpensesByCategoryChart";
import { PriorityGoalProgress } from "./PriorityGoalProgress";
import { EmptyState } from "./EmptyState";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { ErrorState } from "./ErrorState";
import { mapMetricsToVM, mapExpensesToVM, mapPriorityGoalToVM } from "./mappers";

/**
 * DashboardApp - główny orkiestrator widoku Dashboard
 *
 * Odpowiedzialności:
 * - Zarządzanie stanem miesiąca i synchronizacja z URL/localStorage
 * - Pobieranie danych z API (metryki, wydatki, cel priorytetowy)
 * - Obsługa stanów: loading, error, empty
 * - Propagacja danych do komponentów potomnych
 */
export function DashboardApp() {
  const { month, setMonth, goPrev, goNext, isNextDisabled } = useMonthState();
  const { metrics, expenses, priorityGoal, loading, error, refetch } = useDashboardData(month);
  const { visible: backdateVisible, consume: dismissBackdate } = useBackdateFlag();
  const isInitialMount = useRef(true);

  // Synchronizacja miesiąca z URL przy pierwszym montowaniu
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      const params = new URLSearchParams(window.location.search);
      const urlMonth = params.get("month");

      if (urlMonth && urlMonth !== month) {
        setMonth(urlMonth);
      }
    }
  }, [month, setMonth]);

  // Aktualizacja URL przy zmianie miesiąca
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("month", month);

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [month]);

  // Wyświetl stan ładowania
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <MonthPicker
            value={month}
            onChange={setMonth}
            onPrev={goPrev}
            onNext={goNext}
            isNextDisabled={isNextDisabled}
          />
        </div>
        <DashboardSkeleton variant="all" />
      </div>
    );
  }

  // Wyświetl stan błędu (tylko dla krytycznych błędów, np. metryki miesięczne)
  if (error && !metrics) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <MonthPicker
            value={month}
            onChange={setMonth}
            onPrev={goPrev}
            onNext={goNext}
            isNextDisabled={isNextDisabled}
          />
        </div>
        <ErrorState message={error} onRetry={() => refetch()} />
      </div>
    );
  }

  // Debug: loguj stan danych
  console.log("[DashboardApp] Render state:", {
    month,
    loading,
    error,
    hasMetrics: !!metrics,
    hasExpenses: !!expenses,
    hasPriorityGoal: !!priorityGoal,
  });

  // Wyświetl stan pusty gdy brak danych w miesiącu
  const isEmpty =
    !loading &&
    !error &&
    metrics &&
    metrics.income_cents === 0 &&
    metrics.expenses_cents === 0 &&
    (!expenses || expenses.data.length === 0);

  if (isEmpty) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <MonthPicker
            value={month}
            onChange={setMonth}
            onPrev={goPrev}
            onNext={goNext}
            isNextDisabled={isNextDisabled}
          />
        </div>
        <EmptyState visible={true} />
      </div>
    );
  }

  // Mapowanie danych na ViewModele
  const metricsVM = metrics ? mapMetricsToVM(metrics) : null;
  const expensesVM = expenses ? mapExpensesToVM(expenses) : null;
  const priorityGoalVM = priorityGoal ? mapPriorityGoalToVM(priorityGoal) : null;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Kontrolka wyboru miesiąca */}
      <div className="mb-6">
        <MonthPicker
          value={month}
          onChange={setMonth}
          onPrev={goPrev}
          onNext={goNext}
          isNextDisabled={isNextDisabled}
        />
      </div>

      {/* Baner backdate */}
      {backdateVisible && (
        <BackdateBanner
          visible={true}
          onClose={dismissBackdate}
          message="Wykryto korekty historyczne. Dashboard został zaktualizowany o zmiany w przeszłych miesiącach."
        />
      )}

      {/* Karty metryk */}
      {metricsVM && (
        <div className="mb-8">
          <MetricsCards data={metricsVM} />
        </div>
      )}

      {/* Wykres wydatków wg kategorii */}
      <div className="mb-8">
        <ExpensesByCategoryChart
          data={expensesVM?.items || []}
          loading={!expensesVM && loading}
          error={!expensesVM && error ? "Nie udało się załadować danych o wydatkach" : undefined}
        />
      </div>

      {/* Progres celu priorytetowego */}
      <div className="mb-8">
        <PriorityGoalProgress
          data={priorityGoalVM}
          loading={!priorityGoalVM && loading}
          error={!priorityGoalVM && error ? "Nie udało się załadować danych o celu priorytetowym" : undefined}
        />
      </div>
    </div>
  );
}
