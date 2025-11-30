// src/components/audit-log/hooks/useJsonDiff.ts

import { useMemo, useRef } from "react";
import type { AuditLogEntryDTO } from "@/types";
import type { JsonDiffVM, JsonDiffChange } from "../types";

/**
 * Hook do obliczania różnic JSON między before i after
 *
 * Odpowiedzialności:
 * - Obliczanie różnic (added, removed, changed)
 * - Formatowanie JSON (pretty print)
 * - Cache wyników dla wydajności
 *
 * @returns computeDiff - funkcja obliczająca diff dla wpisu
 */
export function useJsonDiff() {
  // Cache wyników (memoizacja)
  const cacheRef = useRef<Map<string, JsonDiffVM>>(new Map());

  /**
   * Oblicza różnice między before i after
   */
  const computeDiff = useMemo(() => {
    return (entry: AuditLogEntryDTO): JsonDiffVM => {
      // Sprawdź cache
      const cached = cacheRef.current.get(entry.id);
      if (cached) {
        return cached;
      }

      // Oblicz diff
      const before = entry.before as Record<string, unknown> | null;
      const after = entry.after as Record<string, unknown> | null;

      const changes = computeChanges(before, after);
      const beforePretty = before ? JSON.stringify(before, null, 2) : "null";
      const afterPretty = after ? JSON.stringify(after, null, 2) : "null";

      const result: JsonDiffVM = {
        changes,
        beforePretty,
        afterPretty,
      };

      // Zapisz do cache
      cacheRef.current.set(entry.id, result);

      return result;
    };
  }, []);

  return { computeDiff };
}

/**
 * Oblicza zmiany między dwoma obiektami JSON
 */
function computeChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): JsonDiffChange[] {
  const changes: JsonDiffChange[] = [];

  // CREATE: before === null
  if (!before && after) {
    for (const key in after) {
      changes.push({
        path: key,
        from: null,
        to: after[key],
        kind: "added",
      });
    }
    return changes;
  }

  // DELETE: after === null
  if (before && !after) {
    for (const key in before) {
      changes.push({
        path: key,
        from: before[key],
        to: null,
        kind: "removed",
      });
    }
    return changes;
  }

  // UPDATE: porównaj pola
  if (before && after) {
    // Pola dodane lub zmienione
    for (const key in after) {
      if (!(key in before)) {
        changes.push({
          path: key,
          from: null,
          to: after[key],
          kind: "added",
        });
      } else if (!isEqual(before[key], after[key])) {
        changes.push({
          path: key,
          from: before[key],
          to: after[key],
          kind: "changed",
        });
      }
    }

    // Pola usunięte
    for (const key in before) {
      if (!(key in after)) {
        changes.push({
          path: key,
          from: before[key],
          to: null,
          kind: "removed",
        });
      }
    }
  }

  return changes;
}

/**
 * Porównuje dwie wartości (głębokie porównanie dla obiektów)
 */
function isEqual(a: unknown, b: unknown): boolean {
  // Prosta porównania dla prymitywów
  if (a === b) return true;

  // null/undefined
  if (a == null || b == null) return false;

  // Różne typy
  if (typeof a !== typeof b) return false;

  // Obiekty i tablice - porównanie JSON
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  return false;
}
