// src/components/goals/hooks/useGoalDetailData.ts

import { useState, useEffect, useCallback } from "react";
import type { GoalListResponseDTO } from "@/types";
import type { GoalDetailVM } from "../types";
import { mapGoalDtoToDetailVm } from "../mappers";

interface UseGoalDetailDataReturn {
  goal: GoalDetailVM | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  updateLocalBalance: (newBalanceCents: number) => void;
}

/**
 * Hook do pobierania szczegółów pojedynczego celu
 *
 * Odpowiedzialności:
 * - Pobieranie celu z API (GET /api/v1/goals z filtrowaniem po id)
 * - Mapowanie DTO → VM
 * - Zarządzanie stanem ładowania i błędów
 * - Lokalny update salda dla optimistic updates
 *
 * @param goalId - ID celu
 * @returns Dane celu, stany, refetch, updateLocalBalance
 */
export function useGoalDetailData(goalId: string): UseGoalDetailDataReturn {
  const [goal, setGoal] = useState<GoalDetailVM | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch celu z API
  const fetchGoal = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Plan B: GET /goals i filtracja po id (Plan A to GET /goals/:id gdy będzie dostępny)
      const url = new URL("/api/v1/goals", window.location.origin);
      url.searchParams.set("include_archived", "true"); // Pobieramy również zarchiwizowane

      const response = await fetch(url.toString(), {
        cache: "no-cache",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: GoalListResponseDTO = await response.json();

      // Filtruj po goalId
      const goalDto = data.data.find((g) => g.id === goalId);

      if (!goalDto) {
        throw new Error("Cel nie został znaleziony");
      }

      // Mapowanie DTO → VM
      const mapped = mapGoalDtoToDetailVm(goalDto);
      setGoal(mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się pobrać szczegółów celu";
      setError(message);
      setGoal(null);
    } finally {
      setIsLoading(false);
    }
  }, [goalId]);

  // Refetch - przeładowanie danych
  const refetch = useCallback(() => {
    fetchGoal();
  }, [fetchGoal]);

  // Lokalny update salda (dla optimistic updates)
  const updateLocalBalance = useCallback((newBalanceCents: number) => {
    setGoal((prev) => {
      if (!prev) return prev;

      // Przelicz progress_percentage
      const progress =
        prev.target_amount_cents > 0 ? Math.round((newBalanceCents / prev.target_amount_cents) * 100) : 0;

      return {
        ...prev,
        current_balance_cents: newBalanceCents,
        progress_percentage: progress,
      };
    });
  }, []);

  // Fetch przy montowaniu i zmianie goalId
  useEffect(() => {
    fetchGoal();
  }, [fetchGoal]);

  return {
    goal,
    isLoading,
    error,
    refetch,
    updateLocalBalance,
  };
}
