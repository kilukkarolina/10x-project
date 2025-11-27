// src/components/transactions/hooks/useDebouncedValue.ts

import { useEffect, useState } from "react";

/**
 * Hook do debounce'owania wartości
 * Opóźnia aktualizację wartości o podany czas (delay)
 * Używany dla search input aby ograniczyć liczbę zapytań API
 *
 * @param value - Wartość do zdebounce'owania
 * @param delay - Opóźnienie w milisekundach (domyślnie 300ms)
 * @returns Zdebounce'owana wartość
 *
 * @example
 * const [search, setSearch] = useState("");
 * const debouncedSearch = useDebouncedValue(search, 300);
 *
 * // debouncedSearch aktualizuje się dopiero 300ms po ostatniej zmianie search
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Ustaw timer który zaktualizuje wartość po delay
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup - wyczyść timer jeśli wartość zmieni się przed upływem delay
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
