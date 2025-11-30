// src/lib/http.ts

import type { ErrorResponseDTO, RateLimitScope } from "@/types";

interface FetchJsonOptions extends RequestInit {
  /**
   * Callback do obsługi rate limit (429)
   * Jeśli nie podany, 429 będzie traktowany jak zwykły błąd
   */
  on429?: (params: { scope: RateLimitScope; retryAfterSeconds: number; message?: string }) => void;

  /**
   * Scope dla rate limit - typ akcji objętej limitem
   * Używany przy wywołaniu on429
   */
  rateLimitScope?: RateLimitScope;
}

/**
 * Helper do wywołań API z automatyczną obsługą błędów i rate limit
 *
 * Funkcjonalności:
 * - Parsowanie JSON w odpowiedzi sukcesu i błędu
 * - Automatyczna detekcja i obsługa 429 (rate limit)
 * - Spójne komunikaty błędów z ErrorResponseDTO
 * - Kompatybilność z istniejącym kodem (fetch API)
 *
 * @param input - URL lub Request object
 * @param options - Opcje fetch + dodatkowe (on429, rateLimitScope)
 * @returns Promise z sparsowanymi danymi JSON
 * @throws Error z komunikatem z API lub domyślnym
 *
 * @example
 * ```ts
 * // Podstawowe użycie
 * const data = await fetchJson<GoalDTO>("/api/v1/goals/123");
 *
 * // POST z body
 * const created = await fetchJson<GoalDTO>("/api/v1/goals", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify(payload),
 * });
 *
 * // Z obsługą 429
 * const data = await fetchJson<any>("/api/v1/auth/verify", {
 *   method: "POST",
 *   body: JSON.stringify({ code }),
 *   rateLimitScope: "verify_email",
 *   on429: ({ retryAfterSeconds }) => notify429({
 *     scope: "verify_email",
 *     retryAfterSeconds
 *   }),
 * });
 * ```
 */
export async function fetchJson<T = unknown>(input: RequestInfo | URL, options?: FetchJsonOptions): Promise<T> {
  const { on429, rateLimitScope, ...fetchOptions } = options || {};

  try {
    const response = await fetch(input, fetchOptions);

    // Sukces - parsuj JSON i zwróć
    if (response.ok) {
      return await response.json();
    }

    // Błąd - parsuj ErrorResponseDTO jeśli dostępny
    let errorData: ErrorResponseDTO | null = null;
    try {
      errorData = await response.json();
    } catch {
      // JSON parse error - użyj domyślnego komunikatu
    }

    // Specjalna obsługa 429 (rate limit)
    if (response.status === 429) {
      const retryAfterSeconds = errorData?.retry_after_seconds || 60; // Fallback do 60s
      const message = errorData?.message || "Przekroczono limit zapytań";

      // Wywołaj callback jeśli podany
      if (on429 && rateLimitScope) {
        on429({
          scope: rateLimitScope,
          retryAfterSeconds,
          message,
        });
      }

      // Rzuć błąd z komunikatem
      throw new Error(message);
    }

    // Inne błędy - przygotuj komunikat
    const errorMessage = errorData?.message || `HTTP ${response.status}: ${response.statusText}`;

    // Specjalne komunikaty dla często występujących kodów
    if (response.status === 401 || response.status === 403) {
      throw new Error("Brak dostępu. Zaloguj się ponownie.");
    }

    if (response.status === 404) {
      throw new Error(errorMessage);
    }

    if (response.status === 409) {
      throw new Error(errorMessage);
    }

    if (response.status === 400 || response.status === 422) {
      // Błędy walidacji - możemy dodać details jeśli są
      if (errorData?.details) {
        const detailsStr = Object.entries(errorData.details)
          .map(([field, msg]) => `${field}: ${msg}`)
          .join(", ");
        throw new Error(`${errorMessage} (${detailsStr})`);
      }
      throw new Error(errorMessage);
    }

    // Błędy 5xx lub inne
    throw new Error(errorMessage);
  } catch (err) {
    // Błędy sieciowe (timeout, abort, offline)
    if (err instanceof TypeError) {
      throw new Error("Błąd połączenia. Sprawdź internet i spróbuj ponownie.");
    }

    // Przepuść inne błędy
    throw err;
  }
}

/**
 * Wariant fetchJson z automatycznym timeout
 *
 * @param input - URL lub Request object
 * @param options - Opcje fetch + dodatkowe
 * @param timeoutMs - Timeout w milisekundach (domyślnie 10s)
 * @returns Promise z sparsowanymi danymi JSON
 * @throws Error przy timeout lub innych błędach
 */
export async function fetchJsonWithTimeout<T = unknown>(
  input: RequestInfo | URL,
  options?: FetchJsonOptions,
  timeoutMs = 10000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await fetchJson<T>(input, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return result;
  } catch (err) {
    clearTimeout(timeoutId);

    // Obsługa abort jako timeout
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Żądanie przekroczyło limit czasu. Spróbuj ponownie.");
    }

    throw err;
  }
}
