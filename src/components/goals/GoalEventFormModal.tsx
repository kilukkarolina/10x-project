// src/components/goals/GoalEventFormModal.tsx

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { GoalEventVM } from "./types";
import type { CreateGoalEventCommand } from "@/types";
import { parsePlnInputToCents, formatCentsToPlnInput } from "@/components/transactions/utils/parsePlnInputToCents";
import { formatCurrencyPL } from "@/lib/utils";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

interface GoalEventFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  eventType: "DEPOSIT" | "WITHDRAW";
  initial?: GoalEventVM;
  goalId: string;
  goalName: string;
  currentBalanceCents: number;
  onSubmit: (payload: CreateGoalEventCommand) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
}

interface FormData {
  type: "DEPOSIT" | "WITHDRAW";
  amount_pln: string;
  occurred_on: string;
}

interface FormErrors {
  type?: string;
  amount_pln?: string;
  occurred_on?: string;
}

/**
 * GoalEventFormModal - modal tworzenia/edycji zdarzenia celu
 *
 * Walidacja:
 * - Typ: wymagany (DEPOSIT/WITHDRAW)
 * - Kwota: wymagana, > 0, maksymalnie 2 miejsca po przecinku
 * - Data: wymagana, format YYYY-MM-DD, nie w przyszłości
 * - WITHDRAW: kwota nie może przekraczać bieżącego salda
 */
export function GoalEventFormModal({
  open,
  mode,
  eventType,
  initial,
  goalId,
  goalName,
  currentBalanceCents,
  onSubmit,
  onClose,
  isSubmitting,
}: GoalEventFormModalProps) {
  const [formData, setFormData] = useState<FormData>({
    type: initial?.type || eventType,
    amount_pln: initial ? formatCentsToPlnInput(initial.amount_cents) : "",
    occurred_on: initial?.occurred_on || new Date().toISOString().split("T")[0],
  });

  const [errors, setErrors] = useState<FormErrors>({});

  // Reset form przy otwarciu modalu
  useEffect(() => {
    if (open) {
      setFormData({
        type: initial?.type || eventType,
        amount_pln: initial ? formatCentsToPlnInput(initial.amount_cents) : "",
        occurred_on: initial?.occurred_on || new Date().toISOString().split("T")[0],
      });
      setErrors({});
    }
  }, [open, initial, eventType]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    // Typ
    if (!formData.type) {
      newErrors.type = "Typ jest wymagany";
    }

    // Kwota
    if (!formData.amount_pln.trim()) {
      newErrors.amount_pln = "Kwota jest wymagana";
    } else {
      const cents = parsePlnInputToCents(formData.amount_pln);
      if (cents === null || cents <= 0) {
        newErrors.amount_pln = "Kwota musi być dodatnia (format: 1234.56 lub 1234,56)";
      } else if (formData.type === "WITHDRAW" && cents > currentBalanceCents) {
        newErrors.amount_pln = `Kwota wypłaty nie może przekroczyć salda (${formatCurrencyPL(currentBalanceCents)} zł)`;
      }
    }

    // Data
    if (!formData.occurred_on) {
      newErrors.occurred_on = "Data jest wymagana";
    } else {
      // Porównaj tylko daty (YYYY-MM-DD) bez time zone issues
      const selectedDateStr = formData.occurred_on; // "YYYY-MM-DD"
      const todayStr = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

      if (selectedDateStr > todayStr) {
        newErrors.occurred_on = "Data nie może być w przyszłości";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    const amountCents = parsePlnInputToCents(formData.amount_pln);
    if (amountCents === null) {
      return;
    }

    try {
      if (mode === "create") {
        const payload: CreateGoalEventCommand = {
          goal_id: goalId,
          type: formData.type,
          amount_cents: amountCents,
          occurred_on: formData.occurred_on,
          client_request_id: crypto.randomUUID(),
        };
        await onSubmit(payload);
      } else {
        // Edit mode - obecnie nie wspierany (US-039 w przyszłości)
        // TODO: Zaimplementować gdy endpoint PATCH będzie dostępny
      }
    } catch {
      // Error handled by parent component
    }
  };

  const isDeposit = formData.type === "DEPOSIT";
  const title = mode === "create" ? (isDeposit ? "Dodaj wpłatę" : "Dodaj wypłatę") : "Edytuj zdarzenie";
  const description = `Cel: ${goalName}`;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isDeposit ? (
                <TrendingUp className="size-5 text-green-600" />
              ) : (
                <TrendingDown className="size-5 text-red-600" />
              )}
              {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Typ zdarzenia (tylko przy create) */}
            {mode === "create" && (
              <div className="grid gap-2">
                <Label htmlFor="type">
                  Typ zdarzenia <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value as "DEPOSIT" | "WITHDRAW" })}
                >
                  <SelectTrigger id="type" className={errors.type ? "border-red-500" : ""}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEPOSIT">
                      <span className="flex items-center gap-2">
                        <TrendingUp className="size-4 text-green-600" />
                        Wpłata
                      </span>
                    </SelectItem>
                    <SelectItem value="WITHDRAW">
                      <span className="flex items-center gap-2">
                        <TrendingDown className="size-4 text-red-600" />
                        Wypłata
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {errors.type && <p className="text-sm text-red-600">{errors.type}</p>}
              </div>
            )}

            {/* Kwota */}
            <div className="grid gap-2">
              <Label htmlFor="amount">
                Kwota (PLN) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="amount"
                type="text"
                inputMode="decimal"
                placeholder="np. 1000.00 lub 1000,00"
                value={formData.amount_pln}
                onChange={(e) => setFormData({ ...formData, amount_pln: e.target.value })}
                className={errors.amount_pln ? "border-red-500" : ""}
                disabled={isSubmitting}
              />
              {errors.amount_pln && <p className="text-sm text-red-600">{errors.amount_pln}</p>}
            </div>

            {/* Data wystąpienia */}
            <div className="grid gap-2">
              <Label htmlFor="occurred_on">
                Data wystąpienia <span className="text-red-500">*</span>
              </Label>
              <Input
                id="occurred_on"
                type="date"
                value={formData.occurred_on}
                onChange={(e) => setFormData({ ...formData, occurred_on: e.target.value })}
                max={new Date().toISOString().split("T")[0]}
                className={errors.occurred_on ? "border-red-500" : ""}
                disabled={isSubmitting}
              />
              {errors.occurred_on && <p className="text-sm text-red-600">{errors.occurred_on}</p>}
            </div>

            {/* Info o dostępnym saldzie przy wypłacie */}
            {formData.type === "WITHDRAW" && (
              <Alert>
                <AlertCircle className="size-4" />
                <AlertDescription>Dostępne saldo: {formatCurrencyPL(currentBalanceCents)} zł</AlertDescription>
              </Alert>
            )}

            {/* Info o trybie edycji (jeśli niedostępny) */}
            {mode === "edit" && (
              <Alert>
                <AlertCircle className="size-4" />
                <AlertDescription>Edycja zdarzeń będzie dostępna wkrótce.</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Anuluj
            </Button>
            <Button type="submit" disabled={isSubmitting || mode === "edit"}>
              {isSubmitting ? "Zapisywanie..." : "Zapisz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
