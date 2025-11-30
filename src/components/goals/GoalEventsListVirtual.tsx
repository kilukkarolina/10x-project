// src/components/goals/GoalEventsListVirtual.tsx

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { GoalEventRow } from "./GoalEventRow";
import { LoadMoreButton } from "./LoadMoreButton";
import type { GoalEventVM } from "./types";

interface GoalEventsListVirtualProps {
  events: GoalEventVM[];
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  onEdit: (event: GoalEventVM) => void;
}

/**
 * GoalEventsListVirtual - wirtualizowana lista zdarzeń celu
 *
 * Używa @tanstack/react-virtual do efektywnego renderowania długich list
 * Sortowanie: created_at DESC, id DESC (od najnowszych)
 *
 * Struktura:
 * - Lista wierszy zdarzeń (GoalEventRow)
 * - Przycisk "Load more" na końcu (gdy hasMore)
 */
export function GoalEventsListVirtual({ events, hasMore, isLoading, onLoadMore, onEdit }: GoalEventsListVirtualProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Konfiguracja virtualizera
  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60, // Szacowana wysokość wiersza
    overscan: 5, // Renderuj 5 dodatkowych itemów poza viewport
  });

  // Loading state (inicjalne)
  if (isLoading && events.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 border rounded-lg bg-card">
        <div className="text-sm text-gray-500">Ładowanie zdarzeń...</div>
      </div>
    );
  }

  // Empty state
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 border rounded-lg bg-card text-center">
        <p className="text-sm text-gray-600 font-medium">Brak zdarzeń</p>
        <p className="text-xs text-gray-500 mt-1">Nie znaleziono żadnych wpłat ani wypłat w tym zakresie</p>
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();

  return (
    <div className="space-y-3">
      {/* Wirtualizowana lista */}
      <div ref={parentRef} className="h-[500px] overflow-auto border rounded-lg bg-card">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {items.map((virtualItem) => {
            const event = events[virtualItem.index];

            if (!event) return null;

            return (
              <div
                key={event.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <GoalEventRow event={event} onEdit={onEdit} />
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
