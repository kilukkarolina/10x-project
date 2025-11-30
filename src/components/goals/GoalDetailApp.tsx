// src/components/goals/GoalDetailApp.tsx

import { useState, useCallback } from "react";
import { useMonthState } from "@/components/dashboard/hooks/useMonthState";
import { useBackdateFlag } from "@/components/dashboard/hooks/useBackdateFlag";
import { BackdateBanner } from "@/components/dashboard/BackdateBanner";
import { useGoalDetailData } from "./hooks/useGoalDetailData";
import { useGoalEventsData } from "./hooks/useGoalEventsData";
import type { GoalEventFilterState, GoalEventVM } from "./types";
import type { CreateGoalEventCommand } from "@/types";
import { GoalOverviewCard } from "./GoalOverviewCard";
import { GoalEventsFilters } from "./GoalEventsFilters";
import { GoalEventsListVirtual } from "./GoalEventsListVirtual";
import { GoalEventFormModal } from "./GoalEventFormModal";
import { ErrorState } from "./ErrorState";

interface GoalDetailAppProps {
  goalId: string;
}

/**
 * GoalDetailApp - główny kontener widoku szczegółów celu
 *
 * Odpowiedzialności:
 * - Zarządzanie stanem widoku (filtry, modal, backdate)
 * - Orchestracja pobierania danych (cel + zdarzenia)
 * - Layout 2-kolumnowy (desktop)
 * - Obsługa akcji użytkownika (create/edit zdarzeń)
 */
export function GoalDetailApp({ goalId }: GoalDetailAppProps) {
  // Stan miesiąca
  const { month, setMonth, goPrev, goNext, isNextDisabled } = useMonthState();

  // Backdate banner
  const { visible: backdateVisible, consume: dismissBackdate } = useBackdateFlag();

  // Dane celu
  const { goal, isLoading: goalLoading, error: goalError, refetch: refetchGoal } = useGoalDetailData(goalId);

  // Filtry zdarzeń
  const [filters, setFilters] = useState<GoalEventFilterState>({
    month,
    type: "ALL",
    limit: 50,
  });

  // Dane zdarzeń (MUSI BYĆ PRZED handleSubmitEvent bo używa refetchEvents)
  const {
    events,
    isLoading: eventsLoading,
    error: eventsError,
    hasMore,
    aggregates,
    refetch: refetchEvents,
    loadMore,
  } = useGoalEventsData(goalId, filters);

  // Synchronizuj miesiąc z filtrami
  const handleMonthChange = useCallback(
    (newMonth: string) => {
      setMonth(newMonth);
      setFilters((prev) => ({ ...prev, month: newMonth, cursor: null }));
    },
    [setMonth]
  );

  // Zmiana typu zdarzenia
  const handleTypeChange = useCallback((type: "ALL" | "DEPOSIT" | "WITHDRAW") => {
    setFilters((prev) => ({ ...prev, type, cursor: null }));
  }, []);

  // Stan modala
  const [modal, setModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    eventType: "DEPOSIT" | "WITHDRAW";
    initial?: GoalEventVM;
  }>({
    open: false,
    mode: "create",
    eventType: "DEPOSIT",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Otwórz modal - wpłata
  const handleOpenDeposit = useCallback(() => {
    setModal({
      open: true,
      mode: "create",
      eventType: "DEPOSIT",
    });
  }, []);

  // Otwórz modal - wypłata
  const handleOpenWithdraw = useCallback(() => {
    setModal({
      open: true,
      mode: "create",
      eventType: "WITHDRAW",
    });
  }, []);

  // Edycja zdarzenia
  const handleEditEvent = useCallback((event: GoalEventVM) => {
    setModal({
      open: true,
      mode: "edit",
      eventType: event.type,
      initial: event,
    });
  }, []);

  // Zamknij modal
  const handleCloseModal = useCallback(() => {
    setModal((prev) => ({ ...prev, open: false }));
  }, []);

  // Submit zdarzenia
  const handleSubmitEvent = useCallback(
    async (payload: CreateGoalEventCommand) => {
      if (!goal) return;

      setIsSubmitting(true);

      try {
        const response = await fetch("/api/v1/goal-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));

          if (response.status === 409) {
            // DUPLICATE_REQUEST lub INSUFFICIENT_BALANCE
            throw new Error(errorData.message || "Operacja została już zarejestrowana lub brak wystarczającego salda");
          }

          if (response.status === 422) {
            throw new Error(errorData.message || "Nieprawidłowe dane wejściowe");
          }

          if (response.status === 404) {
            throw new Error("Cel nie istnieje lub został zarchiwizowany");
          }

          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        await response.json();

        // Zamknij modal
        handleCloseModal();

        // Refetch danych (cel + zdarzenia)
        refetchGoal();
        refetchEvents();

        // Ustaw flagę backdate jeśli data poza aktywnym miesiącem
        const eventMonth = payload.occurred_on.substring(0, 7); // YYYY-MM
        if (eventMonth !== filters.month) {
          // Ustaw flagę w sessionStorage
          try {
            sessionStorage.setItem("ff.backdate", "1");
            // Trigger custom event
            window.dispatchEvent(new Event("finflow:backdate-change"));
          } catch {
            // Ignore sessionStorage errors
          }
        }
      } catch (error) {
        // TODO: Pokazać toast z błędem zamiast alert
        alert(error instanceof Error ? error.message : "Nie udało się zapisać zdarzenia");
      } finally {
        setIsSubmitting(false);
      }
    },
    [goal, filters.month, handleCloseModal, refetchGoal, refetchEvents]
  );

  // Obsługa błędów
  if (goalError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorState error={goalError} onRetry={refetchGoal} />
      </div>
    );
  }

  // Loading skeleton
  if (goalLoading || !goal) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          {/* Header skeleton */}
          <div className="space-y-2">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-200 rounded w-1/4" />
          </div>

          {/* Layout skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column skeleton */}
            <div className="space-y-4">
              <div className="h-96 bg-gray-200 rounded-lg" />
            </div>

            {/* Right column skeleton */}
            <div className="space-y-4">
              <div className="h-32 bg-gray-200 rounded-lg" />
              <div className="h-96 bg-gray-200 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Backdate Banner */}
      {backdateVisible && (
        <BackdateBanner
          visible={backdateVisible}
          onClose={dismissBackdate}
          message="Wykryto zmiany w historii celu. Dane zostały zaktualizowane."
        />
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{goal.name}</h1>
        <p className="text-sm text-gray-500 mt-1">{goal.type_label}</p>
      </div>

      {/* Layout 2-kolumnowy (desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lewa kolumna - Przegląd celu */}
        <div className="space-y-6">
          <GoalOverviewCard
            goal={goal}
            monthNetCents={aggregates.monthNetCents}
            onDeposit={handleOpenDeposit}
            onWithdraw={handleOpenWithdraw}
          />
        </div>

        {/* Prawa kolumna - Historia zdarzeń */}
        <div className="space-y-6">
          <GoalEventsFilters
            filters={filters}
            aggregates={aggregates}
            onMonthChange={handleMonthChange}
            onPrevMonth={goPrev}
            onNextMonth={goNext}
            isNextMonthDisabled={isNextDisabled}
            onTypeChange={handleTypeChange}
          />

          {eventsError ? (
            <ErrorState error={eventsError} onRetry={refetchEvents} />
          ) : (
            <GoalEventsListVirtual
              events={events}
              hasMore={hasMore}
              isLoading={eventsLoading}
              onLoadMore={loadMore}
              onEdit={handleEditEvent}
            />
          )}
        </div>
      </div>

      {/* Modal zdarzenia */}
      <GoalEventFormModal
        open={modal.open}
        mode={modal.mode}
        eventType={modal.eventType}
        initial={modal.initial}
        goalId={goalId}
        goalName={goal.name}
        currentBalanceCents={goal.current_balance_cents}
        onSubmit={handleSubmitEvent}
        onClose={handleCloseModal}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
