// src/components/transactions/CategorySelect.tsx

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tag } from "lucide-react";
import type { CategoryOption } from "./types";

interface CategorySelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  categories: CategoryOption[];
  isLoading: boolean;
  disabled?: boolean;
}

/**
 * CategorySelect - wybór kategorii transakcji
 *
 * Opcje filtrowane po typie transakcji (kind)
 * Pozwala wybrać "Wszystkie kategorie" lub konkretną kategorię
 */
export function CategorySelect({ value, onChange, categories, isLoading, disabled = false }: CategorySelectProps) {
  const handleChange = (newValue: string) => {
    // "ALL" oznacza brak filtra po kategorii
    onChange(newValue === "ALL" ? null : newValue);
  };

  const selectedCategory = categories.find((cat) => cat.code === value);

  return (
    <Select value={value || "ALL"} onValueChange={handleChange} disabled={disabled || isLoading}>
      <SelectTrigger className="w-[200px]" aria-label="Wybierz kategorię">
        <Tag className="size-4 mr-2" />
        <SelectValue>
          {isLoading ? "Ładowanie..." : selectedCategory ? selectedCategory.label : "Wszystkie kategorie"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">Wszystkie kategorie</SelectItem>
        {categories.map((category) => (
          <SelectItem key={category.code} value={category.code}>
            {category.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
