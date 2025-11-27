// src/components/transactions/types.ts

/**
 * Stan filtrów widoku Transakcje
 */
export interface TransactionsFiltersState {
  month: string; // "YYYY-MM"
  type: "INCOME" | "EXPENSE" | "ALL";
  category?: string | null; // code
  search?: string; // tekst
  limit: number; // domyślnie 50
}

/**
 * Opcja kategorii do Select
 */
export interface CategoryOption {
  code: string;
  kind: "INCOME" | "EXPENSE";
  label: string; // label_pl
}

/**
 * VM pojedynczego wiersza listy
 */
export interface TransactionsListItemVM {
  id: string;
  occurred_on: string; // "YYYY-MM-DD"
  type: "INCOME" | "EXPENSE";
  category_code: string;
  category_label: string;
  amount_cents: number;
  amount_pln: string; // sformatowane, np. "1 234,56" (formatCurrencyPL)
  note?: string | null; // bezpiecznie renderowane jako tekst
}

/**
 * VM sekcji pogrupowanej po dacie
 */
export interface TransactionsGroupedSectionVM {
  date: string; // "YYYY-MM-DD"
  ariaLabel: string; // np. "Transakcje z 2025-01-15"
  items: TransactionsListItemVM[];
}

/**
 * Dane formularza (VM warstwy UI)
 */
export interface TransactionFormVM {
  type: "INCOME" | "EXPENSE";
  category_code: string;
  amount_pln: string; // "1234,56" lub "1234.56"
  occurred_on: string; // "YYYY-MM-DD"
  note?: string | null;
}

/**
 * Payloady do serwera
 */
export interface CreateTransactionPayload {
  type: "INCOME" | "EXPENSE";
  category_code: string;
  amount_cents: number;
  occurred_on: string;
  note?: string | null;
  client_request_id: string;
}

export type UpdateTransactionPayload = Partial<{
  category_code: string;
  amount_cents: number;
  occurred_on: string;
  note: string | null;
}>;
