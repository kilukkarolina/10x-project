// src/components/audit-log/AuditLogListVirtual.tsx

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AuditLogRow } from "./AuditLogRow";
import { LoadMoreButton } from "@/components/goals/LoadMoreButton";
import type { AuditLogListItemVM } from "./types";

interface AuditLogListVirtualProps {
  items: AuditLogListItemVM[];
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  onSelect: (item: AuditLogListItemVM) => void;
}

/**
 * AuditLogListVirtual - wirtualizowana lista wpisów audit log
 *
 * Używa @tanstack/react-virtual do efektywnego renderowania długich list
 * Sortowanie: performed_at DESC (od najnowszych)
 *
 * Struktura:
 * - Lista wierszy wpisów (AuditLogRow)
 * - Przycisk "Load more" na końcu (gdy hasMore)
 */
export function AuditLogListVirtual({ items, hasMore, isLoading, onLoadMore, onSelect }: AuditLogListVirtualProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Konfiguracja virtualizera
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Szacowana wysokość wiersza
    overscan: 5, // Renderuj 5 dodatkowych itemów poza viewport
  });

  // Loading state (inicjalne)
  if (isLoading && items.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 border rounded-lg bg-card">
        <div className="text-sm text-muted-foreground">Ładowanie danych...</div>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return null; // EmptyState renderowany jest w AuditLogApp
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="space-y-3">
      {/* Wirtualizowana lista */}
      <div ref={parentRef} className="h-[600px] overflow-auto border rounded-lg bg-card">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualItem) => {
            const item = items[virtualItem.index];

            if (!item) return null;

            return (
              <div
                key={item.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <AuditLogRow item={item} onClick={onSelect} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Przycisk "Load more" */}
      {hasMore && <LoadMoreButton onClick={onLoadMore} isLoading={isLoading} />}
    </div>
  );
}
