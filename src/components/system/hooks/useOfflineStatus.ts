import { useState, useEffect } from "react";

/**
 * Hook do monitorowania statusu połączenia sieciowego
 * Nasłuchuje zdarzeń online/offline z window
 *
 * @returns isOffline - true jeśli użytkownik jest offline
 */
export function useOfflineStatus(): boolean {
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    // Sprawdź początkowy stan z navigator.onLine
    // Odwracamy logikę: offline = !onLine
    return typeof window !== "undefined" ? !navigator.onLine : false;
  });

  useEffect(() => {
    // Handler dla zdarzenia online
    const handleOnline = () => {
      setIsOffline(false);
    };

    // Handler dla zdarzenia offline
    const handleOffline = () => {
      setIsOffline(true);
    };

    // Rejestruj listenery
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Cleanup - usuń listenery przy unmount
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOffline;
}
