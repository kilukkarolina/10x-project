// src/components/transactions/TransactionFormModal.tsx

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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CategoryOption, CreateTransactionPayload, UpdateTransactionPayload } from "./types";
import type { TransactionDTO } from "@/types";
import { parsePlnInputToCents, formatCentsToPlnInput } from "./utils/parsePlnInputToCents";
import { ArrowUpCircle, ArrowDownCircle } from "lucide-react";

interface TransactionFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  initial?: TransactionDTO;
  defaultType?: "INCOME" | "EXPENSE";
  categories: CategoryOption[];
  onSubmit: (payload: CreateTransactionPayload | UpdateTransactionPayload, id?: string) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
}

interface FormData {
  type: "INCOME" | "EXPENSE";
  category_code: string;
  amount_pln: string;
  occurred_on: string;
  note: string;
}

interface FormErrors {
  type?: string;
  category_code?: string;
  amount_pln?: string;
  occurred_on?: string;
  note?: string;
}

/**
 * TransactionFormModal - modal tworzenia/edycji transakcji
 *
 * Walidacja:
 * - Typ: wymagany (INCOME/EXPENSE)
 * - Kategoria: wymagana, zgodna z typem
 * - Kwota: wymagana, > 0, maksymalnie 2 miejsca po przecinku
 * - Data: wymagana, format YYYY-MM-DD, nie w przyszłości
 * - Notatka: opcjonalna, max 500 znaków, bez znaków kontrolnych
 */
export function TransactionFormModal({
  open,
  mode,
  initial,
  defaultType = "EXPENSE",
  categories,
  onSubmit,
  onClose,
  isSubmitting,
}: TransactionFormModalProps) {
  const [formData, setFormData] = useState<FormData>({
    type: (initial?.type || defaultType) as "INCOME" | "EXPENSE",
    category_code: initial?.category_code || "",
    amount_pln: initial ? formatCentsToPlnInput(initial.amount_cents) : "",
    occurred_on: initial?.occurred_on || new Date().toISOString().split("T")[0],
    note: initial?.note || "",
  });

  const [errors, setErrors] = useState<FormErrors>({});

  // Reset form przy otwarciu modalu
  useEffect(() => {
    if (open) {
      setFormData({
        type: (initial?.type || defaultType) as "INCOME" | "EXPENSE",
        category_code: initial?.category_code || "",
        amount_pln: initial ? formatCentsToPlnInput(initial.amount_cents) : "",
        occurred_on: initial?.occurred_on || new Date().toISOString().split("T")[0],
        note: initial?.note || "",
      });
      setErrors({});
    }
  }, [open, initial, defaultType]);

  // Filtruj kategorie po typie
  const filteredCategories = categories.filter((cat) => cat.kind === formData.type);

  // Reset kategorii gdy zmienia się typ
  useEffect(() => {
    if (formData.category_code) {
      const categoryExists = filteredCategories.some((cat) => cat.code === formData.category_code);
      if (!categoryExists) {
        setFormData((prev) => ({ ...prev, category_code: "" }));
      }
    }
  }, [formData.type, formData.category_code, filteredCategories]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    // Typ
    if (!formData.type) {
      newErrors.type = "Typ jest wymagany";
    }

    // Kategoria
    if (!formData.category_code) {
      newErrors.category_code = "Kategoria jest wymagana";
    }

    // Kwota
    if (!formData.amount_pln.trim()) {
      newErrors.amount_pln = "Kwota jest wymagana";
    } else {
      const cents = parsePlnInputToCents(formData.amount_pln);
      if (cents === null || cents <= 0) {
        newErrors.amount_pln = "Kwota musi być dodatnia (format: 1234.56 lub 1234,56)";
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

    // Notatka
    if (formData.note.length > 500) {
      newErrors.note = "Notatka może mieć maksymalnie 500 znaków";
    }

    // Sprawdź znaki kontrolne w notatce
    // eslint-disable-next-line no-control-regex
    if (formData.note && /[\x00-\x1F\x7F]/.test(formData.note)) {
      newErrors.note = "Notatka zawiera niedozwolone znaki";
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
        const payload: CreateTransactionPayload = {
          type: formData.type,
          category_code: formData.category_code,
          amount_cents: amountCents,
          occurred_on: formData.occurred_on,
          note: formData.note.trim() || null,
          client_request_id: crypto.randomUUID(),
        };
        await onSubmit(payload);
      } else {
        // Edit mode - tylko zmienione pola
        const payload: UpdateTransactionPayload = {};

        if (formData.category_code !== initial?.category_code) {
          payload.category_code = formData.category_code;
        }

        if (amountCents !== initial?.amount_cents) {
          payload.amount_cents = amountCents;
        }

        if (formData.occurred_on !== initial?.occurred_on) {
          payload.occurred_on = formData.occurred_on;
        }

        if ((formData.note.trim() || null) !== initial?.note) {
          payload.note = formData.note.trim() || null;
        }

        // Jeśli są zmiany, wyślij
        if (Object.keys(payload).length > 0) {
          await onSubmit(payload, initial?.id);
        }
      }

      onClose();
    } catch {
      // Błędy obsługiwane w komponencie nadrzędnym
    }
  };

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Wyczyść błąd dla tego pola
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Dodaj transakcję" : "Edytuj transakcję"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Wprowadź dane nowej transakcji"
              : "Zmień dane transakcji (typ nie może być zmieniony)"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Typ - tylko w trybie create */}
          {mode === "create" && (
            <div className="space-y-2">
              <Label>Typ transakcji</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleChange("type", "INCOME")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                    formData.type === "INCOME"
                      ? "border-green-500 bg-green-50 dark:bg-green-950"
                      : "border-border hover:border-green-300"
                  }`}
                >
                  <ArrowUpCircle className="size-5 text-green-600" />
                  <span className="font-medium">Przychód</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleChange("type", "EXPENSE")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                    formData.type === "EXPENSE"
                      ? "border-red-500 bg-red-50 dark:bg-red-950"
                      : "border-border hover:border-red-300"
                  }`}
                >
                  <ArrowDownCircle className="size-5 text-red-600" />
                  <span className="font-medium">Wydatek</span>
                </button>
              </div>
              {errors.type && <p className="text-sm text-destructive">{errors.type}</p>}
            </div>
          )}

          {mode === "edit" && (
            <div className="space-y-2">
              <Label>Typ transakcji</Label>
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg border bg-muted">
                {formData.type === "INCOME" ? (
                  <ArrowUpCircle className="size-5 text-green-600" />
                ) : (
                  <ArrowDownCircle className="size-5 text-red-600" />
                )}
                <span className="font-medium">{formData.type === "INCOME" ? "Przychód" : "Wydatek"}</span>
                <span className="text-xs text-muted-foreground ml-auto">(nie można zmienić)</span>
              </div>
            </div>
          )}

          {/* Kategoria */}
          <div className="space-y-2">
            <Label htmlFor="category">Kategoria</Label>
            <Select value={formData.category_code} onValueChange={(value) => handleChange("category_code", value)}>
              <SelectTrigger id="category" className={errors.category_code ? "border-destructive" : ""}>
                <SelectValue placeholder="Wybierz kategorię" />
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.map((cat) => (
                  <SelectItem key={cat.code} value={cat.code}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category_code && <p className="text-sm text-destructive">{errors.category_code}</p>}
          </div>

          {/* Kwota */}
          <div className="space-y-2">
            <Label htmlFor="amount">Kwota (PLN)</Label>
            <Input
              id="amount"
              type="text"
              inputMode="decimal"
              value={formData.amount_pln}
              onChange={(e) => {
                // Pozwól tylko cyfry, kropkę i przecinek
                const value = e.target.value;
                if (value === "" || /^[0-9.,]*$/.test(value)) {
                  handleChange("amount_pln", value);
                }
              }}
              placeholder="0.00"
              className={errors.amount_pln ? "border-destructive" : ""}
              disabled={isSubmitting}
            />
            {errors.amount_pln && <p className="text-sm text-destructive">{errors.amount_pln}</p>}
            <p className="text-xs text-muted-foreground">Użyj kropki lub przecinka jako separatora dziesiętnego</p>
          </div>

          {/* Data */}
          <div className="space-y-2">
            <Label htmlFor="date">Data</Label>
            <Input
              id="date"
              type="date"
              value={formData.occurred_on}
              onChange={(e) => handleChange("occurred_on", e.target.value)}
              className={errors.occurred_on ? "border-destructive" : ""}
              disabled={isSubmitting}
            />
            {errors.occurred_on && <p className="text-sm text-destructive">{errors.occurred_on}</p>}
          </div>

          {/* Notatka */}
          <div className="space-y-2">
            <Label htmlFor="note">Notatka (opcjonalnie)</Label>
            <Textarea
              id="note"
              value={formData.note}
              onChange={(e) => handleChange("note", e.target.value)}
              placeholder="Dodatkowe informacje..."
              className={`resize-none h-24 break-all ${errors.note ? "border-destructive" : ""}`}
              disabled={isSubmitting}
              maxLength={500}
            />
            {errors.note && <p className="text-sm text-destructive">{errors.note}</p>}
            <p className="text-xs text-muted-foreground">{formData.note.length}/500 znaków</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Anuluj
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Zapisywanie..." : mode === "create" ? "Dodaj" : "Zapisz zmiany"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
