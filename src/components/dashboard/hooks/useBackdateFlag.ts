import { useState, useEffect, useCallback } from "react";

const BACKDATE_FLAG_KEY = "ff.backdate";
const BACKDATE_EVENT = "finflow:backdate-change";

interface UseBackdateFlagReturn {
  visible: boolean;
  consume: () => void;
}

/**
 * Hook obsługujący flagę backdate (korekty historyczne)
 *
 * Odpowiedzialności:
 * - Odczyt flagi z sessionStorage
 * - Nasłuch na custom event backdate-change
 * - Dismissowanie banera (zapis do sessionStorage)
 */
export function useBackdateFlag(): UseBackdateFlagReturn {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Sprawdź flagę przy montowaniu
    const checkFlag = () => {
      if (typeof window !== "undefined") {
        try {
          const flag = sessionStorage.getItem(BACKDATE_FLAG_KEY);
          setVisible(flag === "1");
        } catch (error) {
          console.error("Failed to read backdate flag:", error);
        }
      }
    };

    checkFlag();

    // Nasłuchuj na custom event
    const handleBackdateEvent = () => {
      checkFlag();
    };

    if (typeof window !== "undefined") {
      window.addEventListener(BACKDATE_EVENT, handleBackdateEvent);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(BACKDATE_EVENT, handleBackdateEvent);
      }
    };
  }, []);

  // Funkcja dismissująca baner
  const consume = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(BACKDATE_FLAG_KEY);
        setVisible(false);
      } catch (error) {
        console.error("Failed to clear backdate flag:", error);
      }
    }
  }, []);

  return {
    visible,
    consume,
  };
}
