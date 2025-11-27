// src/components/transactions/TransactionsListVirtual.tsx

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TransactionsDateSection } from "./TransactionsDateSection";
import { TransactionRow } from "./TransactionRow";
import type { TransactionsGroupedSectionVM } from "./types";

interface TransactionsListVirtualProps {
  sections: TransactionsGroupedSectionVM[];
  isLoading: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * TransactionsListVirtual - wirtualizowana lista transakcji z grupowaniem po dacie
 *
 * Używa @tanstack/react-virtual do efektywnego renderowania długich list
 * Sekcje dat są sticky (przyklejone do góry podczas scrollowania)
 *
 * Struktura:
 * - Sekcje pogrupowane po dacie (TransactionsDateSection)
 * - Wiersze transakcji w każdej sekcji (TransactionRow)
 */
export function TransactionsListVirtual({ sections, isLoading, onEdit, onDelete }: TransactionsListVirtualProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Flatten sections do pojedynczej listy itemów dla virtualizera
  // Każdy item to albo nagłówek sekcji, albo wiersz transakcji
  const allItems = sections.flatMap((section) => [
    { type: "section" as const, section },
    ...section.items.map((item) => ({ type: "item" as const, item })),
  ]);

  // Konfiguracja virtualizera
  const virtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      // Sekcje (nagłówki) są niższe niż wiersze transakcji
      const item = allItems[index];
      return item && item.type === "section" ? 40 : 60;
    },
    overscan: 5, // Renderuj 5 dodatkowych itemów poza viewport
  });

  if (isLoading && sections.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-muted-foreground">Ładowanie transakcji...</div>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-muted-foreground">Brak transakcji do wyświetlenia</div>
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();

  return (
    <div ref={parentRef} className="h-[600px] overflow-auto border rounded-lg bg-card">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {items.map((virtualItem) => {
          const item = allItems[virtualItem.index];

          if (!item) return null;

          if (item.type === "section") {
            return (
              <div
                key={`section-${item.section.date}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <TransactionsDateSection date={item.section.date} ariaLabel={item.section.ariaLabel} />
              </div>
            );
          }

          return (
            <div
              key={`item-${item.item.id}`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <TransactionRow item={item.item} onEdit={onEdit} onDelete={onDelete} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
