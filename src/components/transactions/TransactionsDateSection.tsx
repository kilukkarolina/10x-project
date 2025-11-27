// src/components/transactions/TransactionsDateSection.tsx

import { formatDateShort } from "./utils/groupByDate";

interface TransactionsDateSectionProps {
  date: string; // YYYY-MM-DD
  ariaLabel: string;
}

/**
 * TransactionsDateSection - nagłówek sekcji z datą
 *
 * Sticky header grupujący transakcje po dacie
 * Używany w wirtualizowanej liście
 */
export function TransactionsDateSection({ date, ariaLabel }: TransactionsDateSectionProps) {
  return (
    <div
      className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm px-4 py-2 border-b"
      role="heading"
      aria-level={2}
      aria-label={ariaLabel}
    >
      <h2 className="text-sm font-semibold text-muted-foreground">{formatDateShort(date)}</h2>
    </div>
  );
}
