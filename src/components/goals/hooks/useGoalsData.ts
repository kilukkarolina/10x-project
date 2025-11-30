// src/components/goals/hooks/useGoalsData.ts

import { useState, useEffect, useCallback } from "react";
import type { GoalListResponseDTO } from "@/types";
import type { GoalsFiltersState, GoalListItemVM } from "../types";
import { mapGoalDtoToVm } from "../mappers";

interface UseGoalsDataReturn {
  items: GoalListItemVM[];
  isLoading: boolean;
  error: string | null;
  count: number;
  refetch: () => void;
}

/**
 * Hook do pobierania i zarządzania danymi celów
 *
 * Odpowiedzialności:
 * - Pobieranie celów z API z filtrowaniem
 * - Mapowanie DTO → VM (z formatowaniem kwot)
 * - Zarządzanie stanem ładowania i błędów
 *
 * @param filters - Filtry celów (include_archived)
 * @returns Dane celów, stany, refetch
 */
export function useGoalsData(filters: GoalsFiltersState): UseGoalsDataReturn {
  const [items, setItems] = useState<GoalListItemVM[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  // Fetch celów z API
  const fetchGoals = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const url = new URL("/api/v1/goals", window.location.origin);

      // Parametr include_archived
      if (filters.include_archived) {
        url.searchParams.set("include_archived", "true");
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: GoalListResponseDTO = await response.json();

      // Mapowanie DTO → VM
      const mapped: GoalListItemVM[] = data.data.map(mapGoalDtoToVm);

      setItems(mapped);
      setCount(mapped.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się pobrać celów";
      setError(message);
      setItems([]);
      setCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [filters.include_archived]);

  // Refetch - przeładowanie danych
  const refetch = useCallback(() => {
    fetchGoals();
  }, [fetchGoals]);

  // Fetch przy zmianach filtrów
  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  return {
    items,
    isLoading,
    error,
    count,
    refetch,
  };
}

