import { createContext, useContext } from "react";
import type { RateLimitScope } from "@/types";

interface NotifyRateLimitParams {
  scope: RateLimitScope;
  retryAfterSeconds: number;
  message?: string;
}

interface SystemStatusContextValue {
  notify429: (params: NotifyRateLimitParams) => void;
}

/**
 * Context do udostępniania metod zarządzania statusem systemowym
 * Używany głównie do zgłaszania rate limit (429) z różnych miejsc w aplikacji
 */
export const SystemStatusContext = createContext<SystemStatusContextValue | null>(null);

/**
 * Hook do używania SystemStatusContext
 * Pozwala na zgłoszenie 429 z dowolnego miejsca w aplikacji
 *
 * @throws Error jeśli użyty poza SystemStatusProvider
 */
export function useSystemStatus(): SystemStatusContextValue {
  const context = useContext(SystemStatusContext);

  if (!context) {
    throw new Error("useSystemStatus must be used within SystemStatusProvider");
  }

  return context;
}
