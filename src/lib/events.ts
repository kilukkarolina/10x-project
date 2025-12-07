/**
 * System eventów dla komunikacji między widokami aplikacji
 *
 * Używa Custom Events (w ramach jednej strony) + localStorage (między stronami)
 * do powiadamiania o zmianach w danych które powinny wywołać odświeżenie w innych widokach
 */

// Typy eventów
export enum AppEvent {
  TRANSACTION_CHANGED = "app:transaction-changed",
  GOAL_CHANGED = "app:goal-changed",
  GOAL_EVENT_CHANGED = "app:goal-event-changed",
  MONTH_CHANGED = "app:month-changed",
}

interface TransactionChangedDetail {
  action: "create" | "update" | "delete";
  transactionId?: string;
  month?: string;
}

interface GoalChangedDetail {
  action: "create" | "update" | "archive" | "priority-changed";
  goalId?: string;
}

interface GoalEventChangedDetail {
  action: "create" | "update";
  goalId: string;
  eventId?: string;
}

interface MonthChangedDetail {
  month: string; // YYYY-MM
  source: "dashboard" | "transactions";
}

type AppEventDetail = TransactionChangedDetail | GoalChangedDetail | GoalEventChangedDetail | MonthChangedDetail;

const STORAGE_KEY_PREFIX = "finflow:data-version:";

/**
 * Emituje event aplikacyjny (w tej samej stronie) i inkrementuje wersję w localStorage (między stronami)
 */
export function emitAppEvent(eventType: AppEvent, detail?: AppEventDetail): void {
  // Emituj Custom Event dla tej samej strony
  const event = new CustomEvent(eventType, { detail });
  window.dispatchEvent(event);

  // Inkrementuj wersję danych w localStorage
  const key = STORAGE_KEY_PREFIX + eventType;
  const currentVersion = parseInt(localStorage.getItem(key) || "0");
  localStorage.setItem(key, (currentVersion + 1).toString());

  // Debug log
  if (typeof window !== "undefined" && window.localStorage) {
    const newVersion = localStorage.getItem(key);
    // eslint-disable-next-line no-console
    console.log(`[Events] Emitted ${eventType}, new version: ${newVersion}`);
  }
}

/**
 * Nasłuchuje na event aplikacyjny (w tej samej stronie)
 */
export function listenToAppEvent(eventType: AppEvent, handler: (detail?: AppEventDetail) => void): () => void {
  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<AppEventDetail>;
    handler(customEvent.detail);
  };

  window.addEventListener(eventType, listener);

  // Zwróć funkcję cleanup
  return () => {
    window.removeEventListener(eventType, listener);
  };
}

/**
 * Pobiera aktualną wersję danych dla danego typu eventu
 */
export function getDataVersion(eventType: AppEvent): number {
  const key = STORAGE_KEY_PREFIX + eventType;
  return parseInt(localStorage.getItem(key) || "0");
}

/**
 * Zapisuje aktualnie sprawdzoną wersję dla danego widoku
 */
export function saveCheckedVersion(eventType: AppEvent, viewKey: string, version: number): void {
  const key = `finflow:checked-version:${viewKey}:${eventType}`;
  localStorage.setItem(key, version.toString());
}

/**
 * Pobiera ostatnio sprawdzoną wersję dla danego widoku
 */
export function getCheckedVersion(eventType: AppEvent, viewKey: string): number {
  const key = `finflow:checked-version:${viewKey}:${eventType}`;
  return parseInt(localStorage.getItem(key) || "0");
}

/**
 * Sprawdza czy dane się zmieniły od ostatniego sprawdzenia
 */
export function hasDataChanged(eventType: AppEvent, viewKey: string): boolean {
  const currentVersion = getDataVersion(eventType);
  const checkedVersion = getCheckedVersion(eventType, viewKey);

  // eslint-disable-next-line no-console
  console.log(
    `[Events] Check ${eventType} for ${viewKey}: current=${currentVersion}, checked=${checkedVersion}, changed=${currentVersion > checkedVersion}`
  );

  return currentVersion > checkedVersion;
}
