// src/components/transactions/hooks/useTransactionsFiltersState.ts

import { useState, useCallback, useEffect } from "react";
import { parseMonth, getCurrentMonth, isMonthValid } from "@/lib/utils";
import { emitAppEvent, listenToAppEvent, AppEvent } from "@/lib/events";
import type { TransactionsFiltersState } from "../types";

interface UseTransactionsFiltersStateReturn {
  filters: TransactionsFiltersState;
  isInitialized: boolean;
  setMonth: (month: string) => void;
  setType: (type: TransactionsFiltersState["type"]) => void;
  setCategory: (category: string | null) => void;
  setSearch: (search: string) => void;
  setLimit: (limit: number) => void;
  resetFilters: () => void;
  goPrevMonth: () => void;
  goNextMonth: () => void;
  isNextMonthDisabled: boolean;
}

const STORAGE_KEYS = {
  month: "ff.month", // Wspólny klucz z dashboard
  type: "ff.transactions.type",
  category: "ff.transactions.category",
  search: "ff.transactions.search",
} as const;

const DEFAULT_FILTERS: TransactionsFiltersState = {
  month: getCurrentMonth(),
  type: "ALL",
  category: null,
  search: "",
  limit: 50,
};

/**
 * Hook zarządzający stanem filtrów widoku Transakcje
 *
 * Odpowiedzialności:
 * - Zarządzanie wszystkimi filtrami (miesiąc, typ, kategoria, wyszukiwanie, limit)
 * - Synchronizacja z localStorage
 * - Walidacja filtrów
 * - Reset filtrów do domyślnych wartości
 * - Nawigacja między miesiącami
 */
export function useTransactionsFiltersState(): UseTransactionsFiltersStateReturn {
  // Zawsze inicjalizuj z DEFAULT_FILTERS aby uniknąć hydration mismatch
  // localStorage będzie załadowany w useEffect
  const [filters, setFilters] = useState<TransactionsFiltersState>(DEFAULT_FILTERS);
  const [isInitialized, setIsInitialized] = useState(false);

  // Załaduj filtry z localStorage po montowaniu (tylko klient)
  useEffect(() => {
    if (isInitialized) return;

    try {
      // Miesiąc
      const storedMonth = localStorage.getItem(STORAGE_KEYS.month);
      const parsedMonth = parseMonth(storedMonth);
      const month = parsedMonth && isMonthValid(parsedMonth) ? parsedMonth : getCurrentMonth();

      // Typ
      const storedType = localStorage.getItem(STORAGE_KEYS.type);
      const type = storedType === "INCOME" || storedType === "EXPENSE" || storedType === "ALL" ? storedType : "ALL";

      // Kategoria
      const storedCategory = localStorage.getItem(STORAGE_KEYS.category);
      const category = storedCategory || null;

      // Wyszukiwanie
      const storedSearch = localStorage.getItem(STORAGE_KEYS.search);
      const search = storedSearch || "";

      setFilters({
        month,
        type,
        category,
        search,
        limit: DEFAULT_FILTERS.limit,
      });
    } catch {
      // Ignore localStorage errors
    }

    setIsInitialized(true);
  }, [isInitialized]);

  // Synchronizacja z localStorage przy zmianach + emitowanie eventu dla miesiąca
  useEffect(() => {
    if (!isInitialized) return;

    try {
      localStorage.setItem(STORAGE_KEYS.month, filters.month);
      localStorage.setItem(STORAGE_KEYS.type, filters.type);

      if (filters.category) {
        localStorage.setItem(STORAGE_KEYS.category, filters.category);
      } else {
        localStorage.removeItem(STORAGE_KEYS.category);
      }

      if (filters.search) {
        localStorage.setItem(STORAGE_KEYS.search, filters.search);
      } else {
        localStorage.removeItem(STORAGE_KEYS.search);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [filters, isInitialized]);

  // Emituj event przy zmianie miesiąca
  useEffect(() => {
    if (!isInitialized) return;

    emitAppEvent(AppEvent.MONTH_CHANGED, {
      month: filters.month,
      source: "transactions",
    });
  }, [filters.month, isInitialized]);

  // Nasłuchuj na zmiany miesiąca z innych widoków
  useEffect(() => {
    const cleanup = listenToAppEvent(AppEvent.MONTH_CHANGED, (detail) => {
      if (!detail) return;
      const { month: newMonth, source } = detail as { month: string; source: string };

      // Ignoruj swoje własne eventy
      if (source === "transactions") return;

      // Aktualizuj stan jeśli miesiąc jest inny
      if (newMonth !== filters.month) {
        setFilters((prev) => ({ ...prev, month: newMonth }));
      }
    });

    return cleanup;
  }, [filters.month]);

  // Settery dla poszczególnych filtrów
  const setMonth = useCallback((newMonth: string) => {
    const parsed = parseMonth(newMonth);

    if (!parsed || !isMonthValid(parsed)) {
      return;
    }

    setFilters((prev) => ({ ...prev, month: parsed }));
  }, []);

  const setType = useCallback((newType: TransactionsFiltersState["type"]) => {
    if (newType !== "INCOME" && newType !== "EXPENSE" && newType !== "ALL") {
      return;
    }

    setFilters((prev) => ({
      ...prev,
      type: newType,
      // Reset kategorii jeśli zmienia się typ (kategorie są filtrowane po typie)
      category: null,
    }));
  }, []);

  const setCategory = useCallback((newCategory: string | null) => {
    setFilters((prev) => ({ ...prev, category: newCategory }));
  }, []);

  const setSearch = useCallback((newSearch: string) => {
    setFilters((prev) => ({ ...prev, search: newSearch }));
  }, []);

  const setLimit = useCallback((newLimit: number) => {
    if (newLimit < 1) {
      return;
    }

    setFilters((prev) => ({ ...prev, limit: newLimit }));
  }, []);

  // Reset wszystkich filtrów do domyślnych wartości
  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  // Nawigacja po miesiącach
  const goPrevMonth = useCallback(() => {
    const [year, monthNum] = filters.month.split("-").map(Number);

    let newYear = year;
    let newMonth = monthNum - 1;

    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }

    const newMonthStr = `${newYear}-${newMonth.toString().padStart(2, "0")}`;
    setMonth(newMonthStr);
  }, [filters.month, setMonth]);

  const goNextMonth = useCallback(() => {
    const [year, monthNum] = filters.month.split("-").map(Number);

    let newYear = year;
    let newMonth = monthNum + 1;

    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }

    const newMonthStr = `${newYear}-${newMonth.toString().padStart(2, "0")}`;

    if (isMonthValid(newMonthStr)) {
      setMonth(newMonthStr);
    }
  }, [filters.month, setMonth]);

  const isNextMonthDisabled = filters.month === getCurrentMonth();

  return {
    filters,
    isInitialized,
    setMonth,
    setType,
    setCategory,
    setSearch,
    setLimit,
    resetFilters,
    goPrevMonth,
    goNextMonth,
    isNextMonthDisabled,
  };
}
