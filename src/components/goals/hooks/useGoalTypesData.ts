// src/components/goals/hooks/useGoalTypesData.ts

import { useState, useEffect, useCallback } from "react";
import type { GoalTypeDTO, GoalTypeListResponseDTO } from "@/types";

interface UseGoalTypesDataReturn {
  goalTypes: GoalTypeDTO[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook do pobierania typów celów z API
 *
 * Cachuje dane w pamięci (read-only dictionary)
 *
 * @returns Typy celów, stan ładowania i błędu
 */
export function useGoalTypesData(): UseGoalTypesDataReturn {
  const [goalTypes, setGoalTypes] = useState<GoalTypeDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGoalTypes = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const url = new URL("/api/v1/goal-types", window.location.origin);
      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: GoalTypeListResponseDTO = await response.json();

      // Tylko aktywne typy
      const activeTypes = data.data.filter((type) => type.is_active);
      setGoalTypes(activeTypes);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się pobrać typów celów";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoalTypes();
  }, [fetchGoalTypes]);

  return {
    goalTypes,
    isLoading,
    error,
    refetch: fetchGoalTypes,
  };
}

