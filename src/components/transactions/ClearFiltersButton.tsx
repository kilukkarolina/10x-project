// src/components/transactions/ClearFiltersButton.tsx

import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

interface ClearFiltersButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/**
 * ClearFiltersButton - przycisk resetowania filtrów
 *
 * Resetuje wszystkie filtry do wartości domyślnych
 */
export function ClearFiltersButton({ onClick, disabled = false }: ClearFiltersButtonProps) {
  return (
    <Button variant="outline" onClick={onClick} disabled={disabled} aria-label="Wyczyść filtry">
      <RotateCcw className="size-4 mr-2" />
      Wyczyść filtry
    </Button>
  );
}
