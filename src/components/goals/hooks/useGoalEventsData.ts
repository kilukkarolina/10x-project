// src/components/goals/hooks/useGoalEventsData.ts

import { useState, useEffect, useCallback, useMemo } from "react";
import type { GoalEventListResponseDTO } from "@/types";
import type { GoalEventFilterState, GoalEventsAggregates, GoalEventVM } from "../types";
import { mapGoalEventDtoToVm } from "../mappers";

interface UseGoalEventsDataReturn {
  events: GoalEventVM[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  nextCursor: string | null;
  aggregates: GoalEventsAggregates;
  refetch: () => void;
  loadMore: () => void;
}

/**
 * Hook do pobierania i zarządzania danymi zdarzeń celu
 *
 * Odpowiedzialności:
 * - Pobieranie zdarzeń z API z filtrowaniem i paginacją
 * - Mapowanie DTO → VM
 * - Zarządzanie stanem ładowania, błędów i paginacji
 * - Obliczanie agregatów (miesięczne i łączne)
 *
 * @param goalId - ID celu
 * @param filters - Filtry zdarzeń
 * @returns Dane zdarzeń, stany, agregaty, funkcje kontrolne
 */
export function useGoalEventsData(goalId: string, filters: GoalEventFilterState): UseGoalEventsDataReturn {
  const [events, setEvents] = useState<GoalEventVM[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Fetch zdarzeń z API
  const fetchEvents = useCallback(
    async (cursor?: string | null, append = false) => {
      setIsLoading(true);
      setError(null);

      try {
        const url = new URL("/api/v1/goal-events", window.location.origin);

        // Parametry wymagane
        url.searchParams.set("goal_id", goalId);
        url.searchParams.set("limit", filters.limit.toString());

        // Parametry opcjonalne
        if (filters.month) {
          url.searchParams.set("month", filters.month);
        }

        if (filters.type !== "ALL") {
          url.searchParams.set("type", filters.type);
        }

        if (cursor) {
          url.searchParams.set("cursor", cursor);
        }

        const response = await fetch(url.toString());

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: GoalEventListResponseDTO = await response.json();

        // Mapowanie DTO → VM
        const mapped: GoalEventVM[] = data.data.map(mapGoalEventDtoToVm);

        // Append lub replace
        if (append) {
          setEvents((prev) => [...prev, ...mapped]);
        } else {
          setEvents(mapped);
        }

        // Paginacja
        setHasMore(data.pagination.has_more);
        setNextCursor(data.pagination.next_cursor);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Nie udało się pobrać zdarzeń";
        setError(message);

        if (!append) {
          setEvents([]);
          setHasMore(false);
          setNextCursor(null);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [goalId, filters.limit, filters.month, filters.type]
  );

  // Refetch - przeładowanie danych (reset paginacji)
  const refetch = useCallback(() => {
    fetchEvents(null, false);
  }, [fetchEvents]);

  // Load more - załaduj kolejną stronę
  const loadMore = useCallback(() => {
    if (hasMore && nextCursor && !isLoading) {
      fetchEvents(nextCursor, true);
    }
  }, [hasMore, nextCursor, isLoading, fetchEvents]);

  // Oblicz agregaty z załadowanych zdarzeń
  const aggregates = useMemo<GoalEventsAggregates>(() => {
    let monthDepositCents = 0;
    let monthWithdrawCents = 0;
    let totalDepositCents = 0;
    let totalWithdrawCents = 0;

    for (const event of events) {
      const amount = event.amount_cents;

      // Łączne z wszystkich załadowanych zdarzeń
      if (event.type === "DEPOSIT") {
        totalDepositCents += amount;
      } else {
        totalWithdrawCents += amount;
      }

      // Miesięczne: tylko zdarzenia z aktywnego miesiąca
      const eventMonth = event.occurred_on.substring(0, 7); // YYYY-MM
      if (eventMonth === filters.month) {
        if (event.type === "DEPOSIT") {
          monthDepositCents += amount;
        } else {
          monthWithdrawCents += amount;
        }
      }
    }

    return {
      monthDepositCents,
      monthWithdrawCents,
      monthNetCents: monthDepositCents - monthWithdrawCents,
      totalDepositCents,
      totalWithdrawCents,
      totalNetCents: totalDepositCents - totalWithdrawCents,
    };
  }, [events, filters.month]);

  // Fetch przy zmianach filtrów
  useEffect(() => {
    fetchEvents(null, false);
  }, [fetchEvents]);

  return {
    events,
    isLoading,
    error,
    hasMore,
    nextCursor,
    aggregates,
    refetch,
    loadMore,
  };
}
