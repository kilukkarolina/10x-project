// src/components/goals/hooks/useGoalMutations.ts

import { useState, useCallback } from "react";
import type { GoalDTO, ArchiveGoalResponseDTO } from "@/types";
import type { CreateGoalPayload, UpdateGoalPayload } from "../types";

interface UseGoalMutationsReturn {
  createGoal: (payload: CreateGoalPayload) => Promise<GoalDTO>;
  updateGoal: (id: string, payload: UpdateGoalPayload) => Promise<GoalDTO>;
  archiveGoal: (id: string) => Promise<ArchiveGoalResponseDTO>;
  isCreating: boolean;
  isUpdating: boolean;
  isArchiving: boolean;
  error: string | null;
}

/**
 * Hook do mutacji celów (create, update, archive)
 *
 * Odpowiedzialności:
 * - Wywołania API dla operacji CRUD
 * - Obsługa błędów
 * - Stany loading dla każdej operacji
 */
export function useGoalMutations(): UseGoalMutationsReturn {
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createGoal = useCallback(async (payload: CreateGoalPayload): Promise<GoalDTO> => {
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error("Tylko jeden cel może być priorytetowy. Usuń priorytet z innego celu.");
        }
        if (response.status === 422 || response.status === 400) {
          const data = await response.json();
          throw new Error(data.message || "Błąd walidacji danych");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: GoalDTO = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się utworzyć celu";
      setError(message);
      throw err;
    } finally {
      setIsCreating(false);
    }
  }, []);

  const updateGoal = useCallback(async (id: string, payload: UpdateGoalPayload): Promise<GoalDTO> => {
    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/goals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Nie znaleziono celu");
        }
        if (response.status === 409) {
          throw new Error("Tylko jeden cel może być priorytetowy. Usuń priorytet z innego celu.");
        }
        if (response.status === 422 || response.status === 400) {
          const data = await response.json();
          throw new Error(data.message || "Błąd walidacji danych");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: GoalDTO = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się zaktualizować celu";
      setError(message);
      throw err;
    } finally {
      setIsUpdating(false);
    }
  }, []);

  const archiveGoal = useCallback(async (id: string): Promise<ArchiveGoalResponseDTO> => {
    setIsArchiving(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/goals/${id}/archive`, {
        method: "POST",
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Nie znaleziono celu");
        }
        if (response.status === 409) {
          throw new Error("Nie można zarchiwizować celu priorytetowego. Najpierw usuń priorytet.");
        }
        if (response.status === 422) {
          const data = await response.json();
          throw new Error(data.message || "Cel jest już zarchiwizowany");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ArchiveGoalResponseDTO = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się zarchiwizować celu";
      setError(message);
      throw err;
    } finally {
      setIsArchiving(false);
    }
  }, []);

  return {
    createGoal,
    updateGoal,
    archiveGoal,
    isCreating,
    isUpdating,
    isArchiving,
    error,
  };
}
