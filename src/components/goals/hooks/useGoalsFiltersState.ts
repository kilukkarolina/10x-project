// src/components/goals/hooks/useGoalsFiltersState.ts

import { useState, useCallback, useEffect } from "react";
import type { GoalsFiltersState } from "../types";

interface UseGoalsFiltersStateReturn {
  filters: GoalsFiltersState;
  setIncludeArchived: (includeArchived: boolean) => void;
}

const STORAGE_KEY = "ff.goals.include_archived";

const DEFAULT_FILTERS: GoalsFiltersState = {
  include_archived: false,
};

/**
 * Hook zarządzający stanem filtrów widoku Cele
 *
 * Odpowiedzialności:
 * - Zarządzanie filtrem include_archived
 * - Synchronizacja z localStorage
 */
export function useGoalsFiltersState(): UseGoalsFiltersStateReturn {
  // Inicjalizacja stanu z localStorage
  const [filters, setFilters] = useState<GoalsFiltersState>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_FILTERS;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const includeArchived = stored === "true";

      return {
        include_archived: includeArchived,
      };
    } catch {
      return DEFAULT_FILTERS;
    }
  });

  // Synchronizacja z localStorage przy zmianach
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, filters.include_archived.toString());
    } catch {
      // Ignore localStorage errors
    }
  }, [filters.include_archived]);

  // Setter dla include_archived
  const setIncludeArchived = useCallback((includeArchived: boolean) => {
    setFilters({ include_archived: includeArchived });
  }, []);

  return {
    filters,
    setIncludeArchived,
  };
}
