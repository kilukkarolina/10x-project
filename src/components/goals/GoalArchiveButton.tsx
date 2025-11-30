// src/components/goals/GoalArchiveButton.tsx

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Archive } from "lucide-react";

interface GoalArchiveButtonProps {
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * GoalArchiveButton - przycisk archiwizacji celu
 *
 * Disabled gdy cel jest priorytetowy (z odpowiednim tooltipem)
 * Disabled gdy cel jest już zarchiwizowany
 */
export function GoalArchiveButton({ onClick, disabled = false, disabledReason }: GoalArchiveButtonProps) {
  const button = (
    <Button variant="outline" size="sm" onClick={onClick} disabled={disabled} className="gap-1">
      <Archive className="size-4" />
      Archiwizuj
    </Button>
  );

  if (disabled && disabledReason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{disabledReason}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}

