// src/components/goals/GoalPriorityToggle.tsx

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface GoalPriorityToggleProps {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  isLoading?: boolean;
}

/**
 * GoalPriorityToggle - przełącznik priorytetu celu
 *
 * Steruje czy cel jest priorytetowy (tylko jeden cel może być priorytetowy)
 * Backend atomowo usuwa priorytet z poprzedniego celu
 */
export function GoalPriorityToggle({ checked, disabled = false, onChange, isLoading = false }: GoalPriorityToggleProps) {
  const handleClick = () => {
    if (disabled || isLoading) return;
    onChange(!checked);
  };

  const button = (
    <Button
      variant={checked ? "default" : "outline"}
      size="sm"
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={cn(
        "gap-1",
        checked && "bg-amber-500 hover:bg-amber-600 text-white",
        isLoading && "opacity-50 cursor-wait"
      )}
      aria-label={checked ? "Usuń priorytet" : "Ustaw jako priorytet"}
    >
      <Star className={cn("size-4", checked && "fill-current")} />
      {checked ? "Priorytet" : "Ustaw priorytet"}
    </Button>
  );

  if (disabled) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>Nie można zmienić priorytetu zarchiwizowanego celu</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}

