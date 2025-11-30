// src/components/audit-log/AuditLogApp.tsx

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { AuditLogFilters } from "./AuditLogFilters";
import { AuditLogListVirtual } from "./AuditLogListVirtual";
import { JsonDiffDialog } from "./JsonDiffDialog";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { useAuditLogData } from "./hooks/useAuditLogData";
import { useJsonDiff } from "./hooks/useJsonDiff";
import type { AuditLogFiltersVM, AuditLogListItemVM } from "./types";
import type { AuditLogEntryDTO } from "@/types";

// Domyślne wartości filtrów
const DEFAULT_FILTERS: AuditLogFiltersVM = {
  limit: 50,
};

// Klucz localStorage
const FILTERS_STORAGE_KEY = "auditLogFilters:v1";

/**
 * AuditLogApp - główny kontener widoku Audit Log
 *
 * Odpowiedzialności:
 * - Zarządzanie stanem filtrów (persist w localStorage)
 * - Pobieranie danych z API (cursor-based pagination)
 * - Obsługa błędów i stanów pustych
 * - Otwieranie modalu diff dla pojedynczego wpisu
 */
export function AuditLogApp() {
  // ============================================================================
  // Stan filtrów
  // ============================================================================

  const [filters, setFilters] = useState<AuditLogFiltersVM>(() => {
    // Odczyt z localStorage przy inicjalizacji
    try {
      const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AuditLogFiltersVM;
        // Walidacja podstawowa
        if (typeof parsed === "object" && parsed !== null) {
          return { ...DEFAULT_FILTERS, ...parsed };
        }
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_FILTERS;
  });

  // Zapisz filtry do localStorage przy każdej zmianie
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // Ignore storage errors
    }
  }, [filters]);

  // ============================================================================
  // Dane z API
  // ============================================================================

  const { items, hasMore, isLoading, error, fetchFirstPage, loadMore, refresh } = useAuditLogData(filters);

  // ============================================================================
  // Diff computation
  // ============================================================================

  const { computeDiff } = useJsonDiff();

  // ============================================================================
  // Stan modalu diff
  // ============================================================================

  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntryDTO | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // ============================================================================
  // Handlers - Filtry
  // ============================================================================

  const handleFiltersChange = (next: AuditLogFiltersVM) => {
    setFilters(next);
  };

  const handleFiltersApply = () => {
    // Zastosowanie filtrów → fetch pierwszej strony
    fetchFirstPage();
  };

  const handleFiltersReset = () => {
    setFilters(DEFAULT_FILTERS);
    // Po resecie również fetchujemy pierwszą stronę
    fetchFirstPage();
  };

  // ============================================================================
  // Handlers - Lista
  // ============================================================================

  const handleRowClick = async (item: AuditLogListItemVM) => {
    // Fetch pełnego wpisu z API (zawiera before/after)
    try {
      const url = new URL(`/api/v1/audit-log/${item.id}`, window.location.origin);
      const response = await fetch(url.toString());

      if (!response.ok) {
        const message =
          response.status === 404
            ? "Wpis nie został znaleziony"
            : `Nie udało się pobrać szczegółów (${response.status})`;
        toast.error(message);
        return;
      }

      const entry: AuditLogEntryDTO = await response.json();
      setSelectedEntry(entry);
      setDialogOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Wystąpił błąd podczas pobierania szczegółów";
      toast.error(message);
    }
  };

  const handleLoadMore = async () => {
    try {
      await loadMore();
    } catch (err) {
      // Błąd już jest obsłużony w loadMore, ale możemy dodać toast
      const message = err instanceof Error ? err.message : "Nie udało się załadować więcej danych";
      toast.error(message);
    }
  };

  // ============================================================================
  // Initial fetch
  // ============================================================================

  useEffect(() => {
    void fetchFirstPage();
  }, [fetchFirstPage]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Nagłówek */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Dziennik zmian</h1>
        <p className="text-sm text-muted-foreground">Przeglądaj historię zmian danych z ostatnich 30 dni</p>
      </div>

      {/* Filtry */}
      <div className="mb-6">
        <AuditLogFilters
          value={filters}
          onChange={handleFiltersChange}
          onApply={handleFiltersApply}
          onReset={handleFiltersReset}
        />
      </div>

      {/* Główna treść */}
      <div className="space-y-4">
        {/* Stan błędu */}
        {error && !isLoading && <ErrorState error={error} onRetry={refresh} />}

        {/* Stan ładowania (inicjalny) */}
        {isLoading && items.length === 0 && !error && (
          <div className="flex items-center justify-center py-12 border rounded-lg bg-card">
            <div className="text-sm text-muted-foreground">Ładowanie danych...</div>
          </div>
        )}

        {/* Stan pusty */}
        {!isLoading && !error && items.length === 0 && <EmptyState />}

        {/* Lista wirtualizowana */}
        {!error && items.length > 0 && (
          <AuditLogListVirtual
            items={items}
            hasMore={hasMore}
            isLoading={isLoading}
            onLoadMore={handleLoadMore}
            onSelect={handleRowClick}
          />
        )}
      </div>

      {/* Modal diff */}
      <JsonDiffDialog open={dialogOpen} entry={selectedEntry} onOpenChange={setDialogOpen} computeDiff={computeDiff} />
    </div>
  );
}
