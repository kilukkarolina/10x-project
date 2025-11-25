import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FreeCashFlowTooltipProps {
  formula: string;
}

/**
 * FreeCashFlowTooltip - tooltip ze wzorem obliczania wolnych środków
 *
 * Wyświetla pełny wzór przekazany z API (free_cash_flow_formula)
 * Dostępny zarówno przez hover jak i focus (a11y)
 */
export function FreeCashFlowTooltip({ formula }: FreeCashFlowTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Wzór obliczania wolnych środków"
          >
            <Info className="size-4 text-muted-foreground hover:text-foreground transition-colors" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="text-sm font-medium mb-1">Wzór obliczania:</p>
          <p className="text-xs font-mono">{formula}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
