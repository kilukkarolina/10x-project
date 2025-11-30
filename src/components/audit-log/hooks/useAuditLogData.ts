// src/components/audit-log/hooks/useAuditLogData.ts

import { useState, useCallback } from "react";
import type { AuditLogListResponseDTO, ErrorResponseDTO } from "@/types";
import type { AuditLogFiltersVM, AuditLogListItemVM } from "../types";
import { mapAuditLogDtoToVm } from "../mappers";

interface UseAuditLogDataReturn {
  items: AuditLogListItemVM[];
  cursor: string | null;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  fetchFirstPage: () => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook do pobierania i zarządzania danymi audit log
 *
 * Odpowiedzialności:
 * - Pobieranie wpisów z API z paginacją po kursorze
 * - Mapowanie DTO → VM
 * - Zarządzanie stanem ładowania, błędów, kursora
 *
 * @param filters - Filtry audit log
 * @returns Dane, stany, metody fetchFirstPage, loadMore, refresh
 */
export function useAuditLogData(filters: AuditLogFiltersVM): UseAuditLogDataReturn {
  const [items, setItems] = useState<AuditLogListItemVM[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Buduje URL API z query params
   */
  const buildApiUrl = useCallback(
    (currentCursor: string | null): string => {
      const url = new URL("/api/v1/audit-log", window.location.origin);

      // entity_type
      if (filters.entityType) {
        url.searchParams.set("entity_type", filters.entityType);
      }

      // entity_id
      if (filters.entityId) {
        url.searchParams.set("entity_id", filters.entityId);
      }

      // action
      if (filters.action) {
        url.searchParams.set("action", filters.action);
      }

      // from_date
      if (filters.fromDate) {
        url.searchParams.set("from_date", filters.fromDate);
      }

      // to_date
      if (filters.toDate) {
        url.searchParams.set("to_date", filters.toDate);
      }

      // cursor
      if (currentCursor) {
        url.searchParams.set("cursor", currentCursor);
      }

      // limit
      url.searchParams.set("limit", filters.limit.toString());

      return url.toString();
    },
    [filters]
  );

  /**
   * Pobiera pierwszą stronę danych (reset paginacji)
   */
  const fetchFirstPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const url = buildApiUrl(null);
      const response = await fetch(url);

      if (!response.ok) {
        // Parsowanie błędu z API
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        try {
          const errorData: ErrorResponseDTO = await response.json();
          errorMessage = errorData.message || errorMessage;

          // Specjalne obsługa błędów autoryzacji
          if (response.status === 401 || response.status === 403) {
            errorMessage = "Brak dostępu. Zaloguj się ponownie.";
          }
        } catch {
          // Ignore JSON parse error
        }

        throw new Error(errorMessage);
      }

      const data: AuditLogListResponseDTO = await response.json();

      // Mapowanie DTO → VM
      const mapped = data.data.map(mapAuditLogDtoToVm);

      setItems(mapped);
      setCursor(data.pagination.next_cursor);
      setHasMore(data.pagination.has_more);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się pobrać danych dziennika zmian";
      setError(message);
      setItems([]);
      setCursor(null);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [buildApiUrl]);

  /**
   * Pobiera kolejną stronę danych (paginate)
   */
  const loadMore = useCallback(async () => {
    if (!cursor || !hasMore || isLoading) return;

    setIsLoading(true);

    try {
      const url = buildApiUrl(cursor);
      const response = await fetch(url);

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        try {
          const errorData: ErrorResponseDTO = await response.json();
          errorMessage = errorData.message || errorMessage;

          // Obsługa INVALID_CURSOR - reset paginacji
          if (errorData.error === "INVALID_CURSOR") {
            errorMessage = "Sesja paginacji wygasła. Lista została zresetowana.";
            setCursor(null);
            setHasMore(false);
          }
        } catch {
          // Ignore JSON parse error
        }

        throw new Error(errorMessage);
      }

      const data: AuditLogListResponseDTO = await response.json();

      // Mapowanie i dołączenie do istniejącej listy
      const mapped = data.data.map(mapAuditLogDtoToVm);

      setItems((prev) => [...prev, ...mapped]);
      setCursor(data.pagination.next_cursor);
      setHasMore(data.pagination.has_more);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się pobrać kolejnej strony";
      // Nie ustawiamy error dla loadMore - użytkownik może spróbować ponownie kliknąć "Load more"
      // Błąd jest propagowany do wywołującego (handleLoadMore w AuditLogApp)
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, [cursor, hasMore, isLoading, buildApiUrl]);

  /**
   * Odświeża całą listę (retry po błędzie)
   */
  const refresh = useCallback(async () => {
    await fetchFirstPage();
  }, [fetchFirstPage]);

  return {
    items,
    cursor,
    hasMore,
    isLoading,
    error,
    fetchFirstPage,
    loadMore,
    refresh,
  };
}
