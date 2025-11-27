// src/components/transactions/TransactionsFilters.tsx

import { MonthPicker } from "@/components/dashboard/MonthPicker";
import { TypeSelect } from "./TypeSelect";
import { CategorySelect } from "./CategorySelect";
import { SearchInput } from "./SearchInput";
import { ClearFiltersButton } from "./ClearFiltersButton";
import type { TransactionsFiltersState, CategoryOption } from "./types";

interface TransactionsFiltersProps {
  filters: TransactionsFiltersState;
  onMonthChange: (month: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  isNextMonthDisabled: boolean;
  onTypeChange: (type: TransactionsFiltersState["type"]) => void;
  onCategoryChange: (category: string | null) => void;
  onSearchChange: (search: string) => void;
  onClearFilters: () => void;
  categories: CategoryOption[];
  isLoadingCategories: boolean;
}

/**
 * TransactionsFilters - pasek filtrów widoku Transakcje
 *
 * Zawiera kontrolki:
 * - MonthPicker (miesiąc z nawigacją)
 * - TypeSelect (INCOME/EXPENSE/ALL)
 * - CategorySelect (kategorie filtrowane po typie)
 * - SearchInput (wyszukiwanie w notatkach z debounce)
 * - ClearFiltersButton (reset do domyślnych)
 */
export function TransactionsFilters({
  filters,
  onMonthChange,
  onPrevMonth,
  onNextMonth,
  isNextMonthDisabled,
  onTypeChange,
  onCategoryChange,
  onSearchChange,
  onClearFilters,
  categories,
  isLoadingCategories,
}: TransactionsFiltersProps) {
  // Filtruj kategorie po typie (jeśli nie ALL)
  const filteredCategories =
    filters.type === "ALL" ? categories : categories.filter((cat) => cat.kind === filters.type);

  // Sprawdź czy filtry są w stanie domyślnym
  const hasActiveFilters = filters.type !== "ALL" || filters.category !== null || filters.search !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Miesiąc */}
        <MonthPicker
          value={filters.month}
          onChange={onMonthChange}
          onPrev={onPrevMonth}
          onNext={onNextMonth}
          isNextDisabled={isNextMonthDisabled}
        />

        {/* Typ */}
        <TypeSelect value={filters.type} onChange={onTypeChange} />

        {/* Kategoria */}
        <CategorySelect
          value={filters.category || null}
          onChange={onCategoryChange}
          categories={filteredCategories}
          isLoading={isLoadingCategories}
        />

        {/* Wyszukiwanie */}
        <SearchInput value={filters.search || ""} onChange={onSearchChange} />

        {/* Wyczyść filtry */}
        {hasActiveFilters && <ClearFiltersButton onClick={onClearFilters} />}
      </div>
    </div>
  );
}
