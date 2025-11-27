// src/components/transactions/hooks/useTransactionsData.ts

import { useState, useEffect, useCallback } from "react";
import type { TransactionListResponseDTO, PaginationDTO } from "@/types";
import type { TransactionsFiltersState, TransactionsListItemVM, TransactionsGroupedSectionVM } from "../types";
import { formatCurrencyPL } from "@/lib/utils";
import { groupByDate } from "../utils/groupByDate";

interface UseTransactionsDataReturn {
  items: TransactionsListItemVM[];
  sections: TransactionsGroupedSectionVM[];
  pagination: PaginationDTO | null;
  isLoading: boolean;
  error: string | null;
  totalAmountCents: number;
  count: number;
  refetch: () => void;
  loadMore: () => void;
}

/**
 * Hook do pobierania i zarządzania danymi transakcji
 *
 * Odpowiedzialności:
 * - Pobieranie transakcji z API z filtrowaniem
 * - Mapowanie DTO → VM (z formatowaniem kwot)
 * - Grupowanie po dacie
 * - Obsługa paginacji keyset
 * - Zarządzanie stanem ładowania i błędów
 *
 * @param filters - Filtry transakcji
 * @returns Dane transakcji, sekcje, paginacja, stany
 */
export function useTransactionsData(filters: TransactionsFiltersState): UseTransactionsDataReturn {
  const [items, setItems] = useState<TransactionsListItemVM[]>([]);
  const [sections, setSections] = useState<TransactionsGroupedSectionVM[]>([]);
  const [pagination, setPagination] = useState<PaginationDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalAmountCents, setTotalAmountCents] = useState(0);
  const [count, setCount] = useState(0);

  // Fetch transakcji z API
  const fetchTransactions = useCallback(
    async (cursor?: string | null) => {
      setIsLoading(true);
      setError(null);

      try {
        const url = new URL("/api/v1/transactions", window.location.origin);

        // Parametry zapytania
        url.searchParams.set("month", filters.month);

        if (filters.type !== "ALL") {
          url.searchParams.set("type", filters.type);
        }

        if (filters.category) {
          url.searchParams.set("category", filters.category);
        }

        if (filters.search) {
          url.searchParams.set("search", filters.search);
        }

        if (cursor) {
          url.searchParams.set("cursor", cursor);
        }

        url.searchParams.set("limit", filters.limit.toString());

        const response = await fetch(url.toString());

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: TransactionListResponseDTO = await response.json();

        // Mapowanie DTO → VM
        const mapped: TransactionsListItemVM[] = data.data.map((dto) => ({
          id: dto.id,
          occurred_on: dto.occurred_on,
          type: dto.type as "INCOME" | "EXPENSE", // Assert type from DB
          category_code: dto.category_code,
          category_label: dto.category_label,
          amount_cents: dto.amount_cents,
          amount_pln: formatCurrencyPL(dto.amount_cents),
          note: dto.note,
        }));

        // Jeśli jest cursor, dokładamy do istniejących danych (load more)
        if (cursor) {
          setItems((prev) => [...prev, ...mapped]);
        } else {
          // Nowe zapytanie - zastępujemy dane
          setItems(mapped);
        }

        setPagination(data.pagination);
        setTotalAmountCents(data.meta.total_amount_cents);
        setCount(data.meta.count);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Nie udało się pobrać transakcji";
        setError(message);

        // W przypadku błędu, jeśli to nie był load more, wyczyść dane
        if (!cursor) {
          setItems([]);
          setSections([]);
          setPagination(null);
          setTotalAmountCents(0);
          setCount(0);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [filters]
  );

  // Refetch - przeładowanie danych od początku
  const refetch = useCallback(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Load more - załadowanie kolejnej strony
  const loadMore = useCallback(() => {
    if (!pagination?.next_cursor || isLoading) {
      return;
    }

    fetchTransactions(pagination.next_cursor);
  }, [pagination, isLoading, fetchTransactions]);

  // Fetch przy zmianach filtrów
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Aktualizacja sekcji przy zmianach items
  useEffect(() => {
    const grouped = groupByDate(items);
    setSections(grouped);
  }, [items]);

  return {
    items,
    sections,
    pagination,
    isLoading,
    error,
    totalAmountCents,
    count,
    refetch,
    loadMore,
  };
}
