// src/components/transactions/ConfirmDeleteModal.tsx

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ConfirmDeleteModalProps {
  open: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  transactionInfo?: {
    category: string;
    amount: string;
    date: string;
  };
}

/**
 * ConfirmDeleteModal - modal potwierdzenia usunięcia transakcji
 *
 * Wyświetla informacje o transakcji do usunięcia
 * Soft-delete - transakcja zostanie oznaczona jako usunięta
 */
export function ConfirmDeleteModal({
  open,
  onConfirm,
  onCancel,
  isSubmitting,
  transactionInfo,
}: ConfirmDeleteModalProps) {
  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-5 text-destructive" />
            </div>
            <DialogTitle>Usuń transakcję</DialogTitle>
          </div>
          <DialogDescription className="pt-3">
            Czy na pewno chcesz usunąć tę transakcję? Ta operacja nie może być cofnięta.
          </DialogDescription>
        </DialogHeader>

        {transactionInfo && (
          <div className="space-y-2 rounded-lg border bg-muted/50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Kategoria:</span>
              <span className="font-medium">{transactionInfo.category}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Kwota:</span>
              <span className="font-medium">{transactionInfo.amount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Data:</span>
              <span className="font-medium">{transactionInfo.date}</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Anuluj
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Usuwanie..." : "Usuń transakcję"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
