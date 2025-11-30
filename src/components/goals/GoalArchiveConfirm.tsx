// src/components/goals/GoalArchiveConfirm.tsx

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Archive, Info } from "lucide-react";

interface GoalArchiveConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isSubmitting: boolean;
  goalName: string;
}

/**
 * GoalArchiveConfirm - modal potwierdzenia archiwizacji celu
 *
 * Informuje użytkownika, że historia pozostaje nienaruszona
 * Wymaga potwierdzenia przed archiwizacją
 */
export function GoalArchiveConfirm({ open, onOpenChange, onConfirm, isSubmitting, goalName }: GoalArchiveConfirmProps) {
  const handleConfirm = async () => {
    await onConfirm();
    // Modal zostanie zamknięty przez rodzica po sukcesie
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        <DialogHeader className="overflow-hidden">
          <DialogTitle className="flex items-center gap-2">
            <Archive className="size-5 text-muted-foreground flex-shrink-0" />
            <span className="truncate">Archiwizuj cel</span>
          </DialogTitle>
          <DialogDescription className="break-words overflow-wrap-anywhere">
            Czy na pewno chcesz zarchiwizować cel <span className="font-semibold break-all">&quot;{goalName}&quot;</span>?
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-3 p-3 bg-muted/50 rounded-lg">
          <Info className="size-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Historia pozostanie zachowana</p>
            <p>Archiwizacja nie usuwa historii celu ani powiązanych wydarzeń. Będziesz mógł przywrócić cel w przyszłości.</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Anuluj
          </Button>
          <Button variant="default" onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Archiwizuję..." : "Archiwizuj cel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

