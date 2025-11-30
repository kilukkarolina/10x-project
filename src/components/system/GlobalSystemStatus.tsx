import type { ReactNode } from "react";
import { useOfflineStatus } from "./hooks/useOfflineStatus";
import { useRateLimit } from "./hooks/useRateLimit";
import { SystemStatusContext } from "./hooks/SystemStatusContext";
import { OfflineBanner } from "./OfflineBanner";
import { RateLimitBanner } from "./RateLimitBanner";

interface GlobalSystemStatusProps {
  children?: ReactNode;
}

/**
 * Orkiestrator globalnych stanów systemowych
 * - Monitoruje status połączenia sieciowego (online/offline)
 * - Zarządza stanem rate limit (429)
 * - Renderuje odpowiednie banery
 * - Udostępnia metody do zgłaszania 429 przez Context API
 *
 * Montowany w Layout.astro jako wyspa client:load
 */
export function GlobalSystemStatus({ children }: GlobalSystemStatusProps) {
  const isOffline = useOfflineStatus();
  const { rateLimit, notify429, clear } = useRateLimit();

  // Wylicz offset dla RateLimitBanner jeśli OfflineBanner jest widoczny
  // Wysokość OfflineBanner to ~96px (padding + content)
  const rateLimitTopOffset = isOffline ? 96 : 0;

  return (
    <SystemStatusContext.Provider value={{ notify429 }}>
      {/* Baner offline - najwyższy priorytet, zawsze na top: 0 */}
      <OfflineBanner visible={isOffline} />

      {/* Baner rate limit - wyświetlany poniżej offline jeśli oba widoczne */}
      <RateLimitBanner rateLimit={rateLimit} onClear={clear} topOffset={rateLimitTopOffset} />

      {/* Opcjonalne dzieci (jeśli używamy jako wrapper) */}
      {children}
    </SystemStatusContext.Provider>
  );
}
