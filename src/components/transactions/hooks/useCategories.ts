// src/components/transactions/hooks/useCategories.ts

import { useState, useEffect, useCallback } from "react";
import type { TransactionCategoryListResponseDTO } from "@/types";
import type { CategoryOption } from "../types";

interface UseCategoriesReturn {
  categories: CategoryOption[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook do pobierania kategorii transakcji z API
 *
 * Opcjonalnie filtruje kategorie po typie (INCOME/EXPENSE)
 * Cachuje dane w pamięci (1h zgodnie z API)
 *
 * @param kind - Opcjonalny filtr po typie kategorii (INCOME/EXPENSE)
 * @returns Kategorie, stan ładowania i błędu
 */
export function useCategories(kind?: "INCOME" | "EXPENSE"): UseCategoriesReturn {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const url = new URL("/api/v1/categories", window.location.origin);

      if (kind) {
        url.searchParams.set("kind", kind);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: TransactionCategoryListResponseDTO = await response.json();

      // Mapowanie do CategoryOption
      const mapped: CategoryOption[] = data.data
        .filter((cat) => cat.is_active) // Tylko aktywne kategorie
        .map((cat) => ({
          code: cat.code,
          kind: cat.kind as "INCOME" | "EXPENSE", // Assert type from DB
          label: cat.label_pl,
        }));

      setCategories(mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się pobrać kategorii";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    isLoading,
    error,
    refetch: fetchCategories,
  };
}
