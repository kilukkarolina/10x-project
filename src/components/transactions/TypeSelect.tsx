// src/components/transactions/TypeSelect.tsx

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownCircle, ArrowUpCircle, CircleDashed } from "lucide-react";

interface TypeSelectProps {
  value: "INCOME" | "EXPENSE" | "ALL";
  onChange: (value: "INCOME" | "EXPENSE" | "ALL") => void;
  disabled?: boolean;
}

/**
 * TypeSelect - wybór typu transakcji
 *
 * Opcje:
 * - INCOME (Przychody)
 * - EXPENSE (Wydatki)
 * - ALL (Wszystkie)
 */
export function TypeSelect({ value, onChange, disabled = false }: TypeSelectProps) {
  const options = [
    { value: "ALL", label: "Wszystkie", icon: CircleDashed },
    { value: "INCOME", label: "Przychody", icon: ArrowUpCircle },
    { value: "EXPENSE", label: "Wydatki", icon: ArrowDownCircle },
  ] as const;

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-[160px]" aria-label="Wybierz typ transakcji">
        {selectedOption && (
          <>
            <selectedOption.icon className="size-4 mr-2" />
            <SelectValue>{selectedOption.label}</SelectValue>
          </>
        )}
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2">
              <option.icon className="size-4" />
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
