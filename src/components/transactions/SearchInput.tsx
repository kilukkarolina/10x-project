// src/components/transactions/SearchInput.tsx

import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * SearchInput - pole wyszukiwania transakcji
 *
 * Wyszukuje w notatkach transakcji
 * Przycisk X do wyczyszczenia pola
 */
export function SearchInput({
  value,
  onChange,
  disabled = false,
  placeholder = "Szukaj w notatkach...",
}: SearchInputProps) {
  const handleClear = () => {
    onChange("");
  };

  return (
    <div className="relative flex items-center">
      <Search className="absolute left-3 size-4 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="pl-9 pr-9 w-[250px]"
        aria-label="Wyszukaj transakcje"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClear}
          className="absolute right-1 size-7"
          aria-label="Wyczyść wyszukiwanie"
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
