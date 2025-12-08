import { useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { listenToAppEvent, AppEvent, hasDataChanged, saveCheckedVersion, getDataVersion } from "@/lib/events";

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
  const { month, isInitialized: monthInitialized, setMonth, goPrev, goNext, isNextDisabled } = useMonthState();
  const { metrics, expenses, priorityGoal, loading, error, refetch } = useDashboardData(month, monthInitialized);
  const { visible: backdateVisible, consume: dismissBackdate } = useBackdateFlag();
  const isInitialMount = useRef(true);

  // Synchronizacja miesiąca z URL i sprawdzenie wersji danych przy pierwszym montowaniu
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;

      // 1. Synchronizacja miesiąca z URL
      const params = new URLSearchParams(window.location.search);
      const urlMonth = params.get("month");

      if (urlMonth && urlMonth !== month) {
        setMonth(urlMonth);
      }

      // 2. Sprawdź czy dane się zmieniły od ostatniej wizyty (localStorage versioning)
      const viewKey = "dashboard";
      const transactionsChanged = hasDataChanged(AppEvent.TRANSACTION_CHANGED, viewKey);
      const goalsChanged = hasDataChanged(AppEvent.GOAL_CHANGED, viewKey);

      if (transactionsChanged || goalsChanged) {
        // eslint-disable-next-line no-console
        console.log("[Dashboard] Wykryto zmiany w danych od ostatniej wizyty - dane zostaną odświeżone");
        // Dane zostaną automatycznie pobrane przez useDashboardData
        // Nie musimy wywoływać refetch - normalny flow się tym zajmie
      }
    }
  }, [month, setMonth]);

  // Zapisuj sprawdzoną wersję danych po każdym udanym załadowaniu
  useEffect(() => {
    if (!loading && !error) {
      const viewKey = "dashboard";
      saveCheckedVersion(AppEvent.TRANSACTION_CHANGED, viewKey, getDataVersion(AppEvent.TRANSACTION_CHANGED));
      saveCheckedVersion(AppEvent.GOAL_CHANGED, viewKey, getDataVersion(AppEvent.GOAL_CHANGED));
    }
  }, [loading, error]);

  // Aktualizacja URL przy zmianie miesiąca
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("month", month);

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [month]);

  // Nasłuchuj na zmiany w transakcjach, celach i miesiącu - odśwież dane
  useEffect(() => {
    const unsubscribeTransactions = listenToAppEvent(AppEvent.TRANSACTION_CHANGED, () => {
      // Odśwież dane Dashboard gdy zmieni się transakcja
      refetch();
    });

    const unsubscribeGoals = listenToAppEvent(AppEvent.GOAL_CHANGED, () => {
      // Odśwież dane Dashboard gdy zmieni się cel (szczególnie priorytet)
      refetch();
    });

    const unsubscribeMonth = listenToAppEvent(AppEvent.MONTH_CHANGED, (detail) => {
      if (!detail) return;
      const { source } = detail as { month: string; source: string };

      // Ignoruj swoje własne eventy (zmiany z MonthPicker na Dashboard)
      if (source === "dashboard") return;

      // Odśwież dane gdy miesiąc zmieni się z innego widoku
      // eslint-disable-next-line no-console
      console.log("[Dashboard] Wykryto zmianę miesiąca z innego widoku - odświeżam dane");
      refetch();
    });

    return () => {
      unsubscribeTransactions();
      unsubscribeGoals();
      unsubscribeMonth();
    };
  }, [refetch]);

  // Wyświetl stan ładowania
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8" data-test-id="dashboard">
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
      <div className="container mx-auto px-4 py-8" data-test-id="dashboard">
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
      <div className="container mx-auto px-4 py-8" data-test-id="dashboard">
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
    <div className="container mx-auto px-4 py-8" data-test-id="dashboard">
      {/* Kontrolka wyboru miesiąca i przycisk odśwież */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <MonthPicker
          value={month}
          onChange={setMonth}
          onPrev={goPrev}
          onNext={goNext}
          isNextDisabled={isNextDisabled}
        />

        <Button onClick={refetch} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Odśwież
        </Button>
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
