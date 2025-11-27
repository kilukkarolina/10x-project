// src/components/transactions/utils/groupByDate.ts

import type { TransactionsListItemVM, TransactionsGroupedSectionVM } from "../types";

/**
 * Grupuje transakcje po dacie (occurred_on)
 * Tworzy sekcje z nagłówkami dla wirtualizowanej listy
 *
 * @param items - Lista transakcji (już posortowana po occurred_on DESC)
 * @returns Sekcje pogrupowane po dacie
 */
export function groupByDate(items: TransactionsListItemVM[]): TransactionsGroupedSectionVM[] {
  const grouped = new Map<string, TransactionsListItemVM[]>();

  // Grupowanie po dacie
  for (const item of items) {
    const date = item.occurred_on;
    const existing = grouped.get(date) || [];
    existing.push(item);
    grouped.set(date, existing);
  }

  // Konwersja do VM sekcji z aria-label
  const sections: TransactionsGroupedSectionVM[] = [];

  for (const [date, sectionItems] of grouped) {
    sections.push({
      date,
      ariaLabel: `Transakcje z ${formatDateForAriaLabel(date)}`,
      items: sectionItems,
    });
  }

  return sections;
}

/**
 * Formatuje datę YYYY-MM-DD do formatu czytelnego po polsku
 *
 * @example
 * formatDateForAriaLabel("2025-01-15") // "15 stycznia 2025"
 */
function formatDateForAriaLabel(date: string): string {
  try {
    const [year, month, day] = date.split("-").map(Number);
    const monthNames = [
      "stycznia",
      "lutego",
      "marca",
      "kwietnia",
      "maja",
      "czerwca",
      "lipca",
      "sierpnia",
      "września",
      "października",
      "listopada",
      "grudnia",
    ];

    return `${day} ${monthNames[month - 1]} ${year}`;
  } catch {
    return date;
  }
}

/**
 * Formatuje datę YYYY-MM-DD do krótkiego formatu DD.MM.YYYY
 *
 * @example
 * formatDateShort("2025-01-15") // "15.01.2025"
 */
export function formatDateShort(date: string): string {
  try {
    const [year, month, day] = date.split("-");
    return `${day}.${month}.${year}`;
  } catch {
    return date;
  }
}
