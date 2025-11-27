// src/components/transactions/hooks/useTransactionMutations.ts

import { useState, useCallback } from "react";
import type { TransactionDTO } from "@/types";
import type { CreateTransactionPayload, UpdateTransactionPayload } from "../types";

interface UseTransactionMutationsReturn {
  createTransaction: (payload: CreateTransactionPayload) => Promise<TransactionDTO>;
  updateTransaction: (id: string, payload: UpdateTransactionPayload) => Promise<TransactionDTO>;
  deleteTransaction: (id: string) => Promise<void>;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  error: string | null;
}

/**
 * Hook do mutacji transakcji (create, update, delete)
 *
 * Odpowiedzialności:
 * - Wywołania API dla operacji CRUD
 * - Obsługa błędów
 * - Stany loading dla każdej operacji
 */
export function useTransactionMutations(): UseTransactionMutationsReturn {
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createTransaction = useCallback(async (payload: CreateTransactionPayload): Promise<TransactionDTO> => {
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error("Zduplikowano żądanie – zapis pominięty");
        }
        if (response.status === 422 || response.status === 400) {
          const data = await response.json();
          throw new Error(data.message || "Błąd walidacji danych");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: TransactionDTO = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się utworzyć transakcji";
      setError(message);
      throw err;
    } finally {
      setIsCreating(false);
    }
  }, []);

  const updateTransaction = useCallback(
    async (id: string, payload: UpdateTransactionPayload): Promise<TransactionDTO> => {
      setIsUpdating(true);
      setError(null);

      try {
        const response = await fetch(`/api/v1/transactions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Nie znaleziono transakcji");
          }
          if (response.status === 422 || response.status === 400) {
            const data = await response.json();
            throw new Error(data.message || "Błąd walidacji danych");
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: TransactionDTO = await response.json();
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Nie udało się zaktualizować transakcji";
        setError(message);
        throw err;
      } finally {
        setIsUpdating(false);
      }
    },
    []
  );

  const deleteTransaction = useCallback(async (id: string): Promise<void> => {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/transactions/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Nie znaleziono transakcji");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się usunąć transakcji";
      setError(message);
      throw err;
    } finally {
      setIsDeleting(false);
    }
  }, []);

  return {
    createTransaction,
    updateTransaction,
    deleteTransaction,
    isCreating,
    isUpdating,
    isDeleting,
    error,
  };
}
