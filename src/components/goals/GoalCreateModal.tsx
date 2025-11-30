// src/components/goals/GoalCreateModal.tsx

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
import { AlertCircle, Plus, Star } from "lucide-react";
import type { GoalTypeDTO } from "@/types";
import type { CreateGoalPayload } from "./types";
import { parsePlnInputToCents } from "@/components/transactions/utils/parsePlnInputToCents";

interface GoalCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalTypes: GoalTypeDTO[];
  onSubmit: (payload: CreateGoalPayload) => Promise<void>;
  isSubmitting: boolean;
  serverError: string | null;
}

interface FormErrors {
  name?: string;
  type_code?: string;
  target_amount?: string;
}

/**
 * GoalCreateModal - modal tworzenia nowego celu
 *
 * Formularz:
 * - Nazwa (1-100 znaków)
 * - Typ (z listy goal-types)
 * - Kwota docelowa (> 0)
 * - Opcjonalnie: ustaw jako priorytet
 */
export function GoalCreateModal({
  open,
  onOpenChange,
  goalTypes,
  onSubmit,
  isSubmitting,
  serverError,
}: GoalCreateModalProps) {
  const [name, setName] = useState("");
  const [typeCode, setTypeCode] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [isPriority, setIsPriority] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Reset formularza po zamknięciu
  useEffect(() => {
    if (!open) {
      setName("");
      setTypeCode("");
      setTargetAmount("");
      setIsPriority(false);
      setErrors({});
    }
  }, [open]);

  // Walidacja formularza
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Nazwa
    if (!name.trim()) {
      newErrors.name = "Nazwa jest wymagana";
    } else if (name.trim().length > 100) {
      newErrors.name = "Nazwa nie może być dłuższa niż 100 znaków";
    }

    // Typ
    if (!typeCode) {
      newErrors.type_code = "Typ celu jest wymagany";
    }

    // Kwota
    const cents = parsePlnInputToCents(targetAmount);
    if (!targetAmount.trim()) {
      newErrors.target_amount = "Kwota docelowa jest wymagana";
    } else if (cents === null || cents <= 0) {
      newErrors.target_amount = "Kwota musi być dodatnia (format: 1234.56 lub 1234,56)";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Obsługa submitu
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const cents = parsePlnInputToCents(targetAmount);
    if (cents === null) {
      return;
    }

    const payload: CreateGoalPayload = {
      name: name.trim(),
      type_code: typeCode,
      target_amount_cents: cents,
      is_priority: isPriority,
    };

    try {
      await onSubmit(payload);
      // Modal zostanie zamknięty przez rodzica po sukcesie
    } catch {
      // Błąd jest obsłużony przez rodzica
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-5 text-primary" />
            Utwórz nowy cel
          </DialogTitle>
          <DialogDescription>Dodaj nowy cel oszczędnościowy. Wypełnij wszystkie wymagane pola.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nazwa */}
          <div className="space-y-2">
            <Label htmlFor="goal-name">
              Nazwa celu <span className="text-destructive">*</span>
            </Label>
            <Input
              id="goal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Fundusz awaryjny"
              maxLength={100}
              disabled={isSubmitting}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "goal-name-error" : undefined}
            />
            {errors.name && (
              <p id="goal-name-error" className="text-sm text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          {/* Typ */}
          <div className="space-y-2">
            <Label htmlFor="goal-type">
              Typ celu <span className="text-destructive">*</span>
            </Label>
            <Select value={typeCode} onValueChange={setTypeCode} disabled={isSubmitting}>
              <SelectTrigger id="goal-type" aria-invalid={!!errors.type_code}>
                <SelectValue placeholder="Wybierz typ celu" />
              </SelectTrigger>
              <SelectContent>
                {goalTypes.map((type) => (
                  <SelectItem key={type.code} value={type.code}>
                    {type.label_pl}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type_code && (
              <p id="goal-type-error" className="text-sm text-destructive">
                {errors.type_code}
              </p>
            )}
          </div>

          {/* Kwota docelowa */}
          <div className="space-y-2">
            <Label htmlFor="goal-target">
              Kwota docelowa <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="goal-target"
                type="text"
                inputMode="decimal"
                value={targetAmount}
                onChange={(e) => {
                  // Pozwól tylko cyfry, kropkę i przecinek
                  const value = e.target.value;
                  if (value === "" || /^[0-9.,]*$/.test(value)) {
                    setTargetAmount(value);
                  }
                }}
                placeholder="0,00"
                disabled={isSubmitting}
                aria-invalid={!!errors.target_amount}
                aria-describedby={errors.target_amount ? "goal-target-error" : undefined}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">zł</span>
            </div>
            <p className="text-xs text-muted-foreground">Użyj przecinka lub kropki jako separatora dziesiętnego</p>
            {errors.target_amount && (
              <p id="goal-target-error" className="text-sm text-destructive">
                {errors.target_amount}
              </p>
            )}
          </div>

          {/* Priorytet */}
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <input
              type="checkbox"
              id="goal-priority"
              checked={isPriority}
              onChange={(e) => setIsPriority(e.target.checked)}
              disabled={isSubmitting}
              className="size-4 rounded border-gray-300"
            />
            <Label htmlFor="goal-priority" className="flex items-center gap-2 cursor-pointer font-normal">
              <Star className="size-4 text-amber-500" />
              Ustaw jako cel priorytetowy
            </Label>
          </div>

          {/* Błąd serwera */}
          {serverError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Anuluj
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Tworzę..." : "Utwórz cel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
