# Plan implementacji widoku Globalny błąd i stany systemowe

## 1. Przegląd

Widok odpowiada za prezentację krytycznych stanów systemowych i błędów:

- globalny błąd krytyczny (5xx/awaria) z bezpiecznym fallbackiem i opcjami powrotu (US‑100),
- baner offline z detekcją statusu sieci (US‑070),
- baner rate‑limit (429) z odliczaniem retry i jasnym komunikatem (US‑046),
- spójna prezentacja błędów i brak utraty danych przy niepowodzeniach (US‑028).

Zakładamy integrację z istniejącym Toasterem (`sonner`) oraz wpięcie globalnych elementów w `Layout.astro`, aby były dostępne na każdej stronie. Dodatkowo opakujemy główne wyspy React w globalny ErrorBoundary.

## 2. Routing widoku

- Fallback: globalny ErrorBoundary (React) opakowujący główne aplikacje wyspowe:
  - `DashboardApp.tsx`, `TransactionsApp.tsx`, `GoalsApp.tsx`, `AuditLogApp.tsx`.
- Dodatkowa strona awaryjna: `/error` (Astro) – prosty ekran z komunikatem i linkami „Odśwież” / „Wróć na główną”.
- Globalne banery (offline, rate‑limit) renderowane w `Layout.astro` jako wyspa React montowana `client:load`.

## 3. Struktura komponentów

- GlobalSystemStatus (React island; montowane w `Layout.astro`)
  - OfflineBanner
  - RateLimitBanner
- GlobalErrorBoundary (React, wrapper)
  - fallback: GlobalErrorScreen

Drzewo (wysokopoziomowe):

- Layout.astro
  - GlobalSystemStatus (client:load)
  - Page content slot
- Strony Astro (np. `dashboard.astro`)
  - React: GlobalErrorBoundary
    - React: DashboardApp

## 4. Szczegóły komponentów

### GlobalErrorScreen

- Opis: Ekran błędu krytycznego dla 5xx/awarii. Prezentuje ikonę, tytuł, opis, przyciski „Odśwież” i „Wróć na główną”, opcjonalnie „Spróbuj ponownie” jeśli rodzic przekaże handler.
- Główne elementy:
  - shadcn `Card` (tło ostrzegawcze), ikona ostrzeżenia, nagłówek, opis,
  - `Button` „Odśwież” (window.location.reload),
  - `Button` „Wróć na główną” (link do `/`),
  - opcjonalny `Button` „Spróbuj ponownie” z `onRetry`.
- Obsługiwane interakcje:
  - klik „Odśwież” → pełne odświeżenie strony,
  - klik „Wróć na główną” → nawigacja do `/`,
  - klik „Spróbuj ponownie” → wywołuje `onRetry` (jeśli przekazany).
- Walidacja/warunki:
  - jeśli brak `statusCode`, pokaż domyślnie „Wystąpił błąd”,
  - jeśli `statusCode` 500–599 → komunikat 5xx.
- Typy:
  - `GlobalErrorViewModel` (sekcja 5),
  - `GlobalErrorScreenProps` (sekcja 5).
- Propsy:
  - `title: string`, `message: string`, `statusCode?: number`,
  - `onRetry?: () => void`, `homeHref?: string`.

### OfflineBanner

- Opis: Pasek na górze ekranu informujący o pracy offline. Znika automatycznie po powrocie online. Ma aria-live.
- Główne elementy:
  - shadcn `Alert` lub prosty `div` z klasami Tailwind (fixed top, full width),
  - komunikat „Jesteś offline. Niektóre funkcje mogą nie działać.”,
  - przycisk „Spróbuj ponownie” (odświeża bieżący widok), opcjonalny „Ukryj” do czasu ponownego przejścia w online.
- Obsługiwane interakcje:
  - `online/offline` (window events) – sterują widocznością,
  - „Spróbuj ponownie” → `window.location.reload()`.
- Walidacja/warunki:
  - renderuj, gdy `navigator.onLine === false`.
- Typy:
  - `SystemStatusVM` (sekcja 5),
  - `OfflineBannerProps` (sekcja 5).
- Propsy:
  - `visible: boolean`.

### RateLimitBanner

- Opis: Pasek informujący o limicie 429 (zwłaszcza verify/reset e‑mail). Pokazuje pozostały czas blokady; po zejściu do 0 znika i umożliwia ponowienie akcji.
- Główne elementy:
  - shadcn `Alert` lub `div` sticky top (poniżej OfflineBanner, z marginesem),
  - treść: „Przekroczono limit. Spróbuj ponownie za XXs.”,
  - odliczanie (sekundnik), przycisk „Spróbuj ponownie” (enabled po 0s).
- Obsługiwane interakcje:
  - `notify429({ scope, retryAfterSeconds })` ustawia baner i startuje licznik,
  - po 0 sekundach baner znika lub pokazuje CTA retry (wywołuje przekazany callback).
- Walidacja/warunki:
  - oczekuje `retry_after_seconds` z API; jeśli brak → fallback do 60s,
  - licznik nie powinien zejść poniżej 0, cleanup timera on unmount.
- Typy:
  - `RateLimitInfo`, `RateLimitScope`, `RateLimitBannerProps` (sekcja 5),
  - wykorzystuje `ErrorResponseDTO.retry_after_seconds`.
- Propsy:
  - `rateLimit: RateLimitInfo | null`,
  - `onRetry?: () => void`,
  - `onClear: () => void`.

### GlobalSystemStatus

- Opis: Orkiestrator globalnych stanów. Słucha `online/offline`, ekspozycja prostych metod do zgłaszania 429, renderuje banery.
- Główne elementy:
  - Hooki: `useOfflineStatus()`, `useRateLimit()`,
  - renderuje warunkowo `OfflineBanner` i `RateLimitBanner`,
  - kontekst (Context API) do udostępniania `notify429` w całej aplikacji.
- Obsługiwane interakcje:
  - subskrypcja zdarzeń sieciowych,
  - przyjmowanie zgłoszeń 429 z miejsc wywołań API (np. formularze verify/reset).
- Walidacja/warunki:
  - kolejka zgłoszeń 429 – ostatni wygrywa (nadpisanie banera),
  - auto-clear po czasie/po retry.
- Typy:
  - `SystemStatusVM`, `RateLimitInfo`.
- Propsy:
  - brak (samodzielny root), lub opcjonalne `children` jeśli zdecydujemy się opakowywać.

### GlobalErrorBoundary

- Opis: React Error Boundary opakowujący główne wyspy. Błędy renderu/efektów → fallback `GlobalErrorScreen`.
- Główne elementy:
  - biblioteka `react-error-boundary` lub własna klasa `ErrorBoundary`,
  - `fallbackRender` z `GlobalErrorScreen`.
- Obsługiwane interakcje:
  - `onReset` (retry) przekazywane z kontekstu/props,
  - raportowanie błędów (konsola/Sentry – opcjonalnie na przyszłość).
- Walidacja/warunki:
  - obsługa tylko błędów renderu, nie Promise rejection; dla fetch – pozostają lokalne `ErrorState` lub toasty.
- Typy:
  - `GlobalErrorBoundaryProps`, `GlobalErrorFallbackProps` (sekcja 5).
- Propsy:
  - `children: ReactNode`, `onRetry?: () => void`.

## 5. Typy

Nowe typy (ViewModel + interfejsy props):

```ts
// VM statusów globalnych
export interface SystemStatusVM {
  isOffline: boolean;
  rateLimit: RateLimitInfo | null;
  lastCriticalError?: {
    statusCode?: number;
    message: string;
    atISO: string;
  };
}

// Rate limit
export type RateLimitScope = "verify_email" | "reset_password" | "api_general";

export interface RateLimitInfo {
  scope: RateLimitScope;
  retryAt: number; // epoch ms, wyliczony = Date.now() + retry_after_seconds * 1000
  secondsLeft: number; // dynamicznie aktualizowane
  message?: string; // z ErrorResponseDTO.message jeśli dostępny
}

// GlobalErrorScreen
export interface GlobalErrorScreenProps {
  title: string;
  message: string;
  statusCode?: number;
  onRetry?: () => void;
  homeHref?: string; // domyślnie "/"
}

// OfflineBanner
export interface OfflineBannerProps {
  visible: boolean;
}

// RateLimitBanner
export interface RateLimitBannerProps {
  rateLimit: RateLimitInfo | null;
  onRetry?: () => void;
  onClear: () => void;
}

// ErrorBoundary
export interface GlobalErrorBoundaryProps {
  children: React.ReactNode;
  onRetry?: () => void;
}
```

Wykorzystanie istniejących typów:

- `ErrorResponseDTO` – źródło `message` i `retry_after_seconds` (dla 429).

## 6. Zarządzanie stanem

- `useOfflineStatus()`:
  - stan: `isOffline` (init z `!navigator.onLine`),
  - subskrypcje: `window.addEventListener("online"/"offline")`,
  - cleanup na unmount.
- `useRateLimit()`:
  - stan: `rateLimit: RateLimitInfo | null`,
  - API: `notify429({ scope, retryAfterSeconds, message? })`, `clear()`,
  - timer 1s do aktualizacji `secondsLeft` i auto-clear po `secondsLeft <= 0`,
  - zapis `retryAt` zamiast „licznika” dla odporności na tab visibility.
- `GlobalSystemStatusProvider` (Context):
  - udostępnia `notify429` i `state.rateLimit` dla dowolnego formularza/akcji w aplikacji,
  - montowany w `Layout.astro` (wyspa React).
- `GlobalErrorBoundary`:
  - lokalny dla każdej głównej wyspy (utrzymujemy separację awarii poszczególnych modułów).

## 7. Integracja API

- Brak nowych endpointów. Integracja polega na ujednoliceniu obsługi odpowiedzi błędów:
  - Błędy 5xx i timeouty → lokalne `ErrorState` albo przechwycone przez ErrorBoundary (render-time),
  - 429 → pobranie `retry_after_seconds` z `ErrorResponseDTO` i wywołanie `notify429(...)`.
- Zalecenie: dodać prosty helper `fetchJson` (np. `src/lib/http.ts`):
  - parsuje JSON w sukcesie i w błędzie,
  - jeśli `response.status === 429`, próbuje odczytać `retry_after_seconds` i wywołuje `notify429`,
  - rzuca `Error` z czytelną wiadomością do lokalnego `ErrorState`/toasta.
- Dla formularzy verify/reset e‑mail (gdy będą dodane): na 429 wyłączyć CTA, podeprzeć się stanem z `useRateLimit()`.

## 8. Interakcje użytkownika

- Offline:
  - przejście offline → pojawia się `OfflineBanner`,
  - klik „Spróbuj ponownie” → odświeżenie strony,
  - powrót online → baner znika automatycznie.
- Rate‑limit:
  - pojawienie 429 → `RateLimitBanner` z odliczaniem,
  - 0s → baner znika albo przycisk „Spróbuj ponownie” staje się aktywny; klik wywołuje ponowną próbę akcji.
- Błąd krytyczny:
  - render error w wyspie → `GlobalErrorScreen` z „Odśwież” i „Wróć na główną”, opcjonalnie „Spróbuj ponownie”.
- Błędy sieciowe zwykłe:
  - toast błędu (sonner) + rollback optimistic update (zgodnie z istniejącymi hookami).

## 9. Warunki i walidacja

- Offline:
  - wyłącznie `navigator.onLine === false` → pokaż baner; aria-live „polite”.
- Rate‑limit:
  - jeśli `retry_after_seconds` nieobecne → fallback 60s,
  - licznik ≥ 0; chronić przed wielokrotnymi timerami (jeden aktywny),
  - scope („verify_email”, „reset_password”) pozwala różnicować treści (na przyszłość).
- Globalny błąd:
  - status 5xx → komunikat 5xx,
  - brak kodu → komunikat ogólny „Wystąpił błąd”.
- A11y:
  - bannery z `role="status"` i `aria-live="polite"`, focus nie jest kradziony,
  - przyciski posiadają etykiety tekstowe.

## 10. Obsługa błędów

- JSON parse error w odpowiedzi błędu:
  - fallback do komunikatu `HTTP <status>: <statusText>`,
  - nadal emitujemy toast.
- Brak `retry_after_seconds`:
  - ustaw `secondsLeft = 60`,
  - pokaż informację o przybliżeniu.
- Błąd w ErrorBoundary fallback:
  - renderuj minimalny tekstowy fallback bez zależności od shadcn (ostatnia linia obrony).
- Zduplikowane 429:
  - nadpisujemy stan ostatnim zgłoszeniem; timer resetuje się.

## 11. Kroki implementacji

1. Struktura i miejsce montowania:
   - utwórz `src/components/system/` i dodaj: `GlobalSystemStatus.tsx`, `OfflineBanner.tsx`, `RateLimitBanner.tsx`, `GlobalErrorBoundary.tsx`, `GlobalErrorScreen.tsx`,
   - dodaj `src/components/system/hooks/` z `useOfflineStatus.ts`, `useRateLimit.ts`, oraz opcjonalnie `SystemStatusContext.tsx`.
2. Montaż globalny:
   - w `src/layouts/Layout.astro` załaduj `GlobalSystemStatus` jako wyspę `client:load` (podobnie do `Toaster`), upewnij się, że banery są renderowane nad treścią (sticky/fixed top, z-index).
3. ErrorBoundary:
   - opakuj `DashboardApp`, `GoalsApp`, `TransactionsApp`, `AuditLogApp` w `GlobalErrorBoundary` (wewnątrz komponentu root lub wrapper komponent),
   - fallback przekazuje `onRetry` (np. re-render hooków danych lub `window.location.reload()`).
4. Helper HTTP:
   - dodaj `src/lib/http.ts` z `fetchJson(input, init, { on429 })`,
   - w miejscach wywołań (gdy będą dotyczyć verify/reset) przekazuj `on429 = (sec) => notify429({ scope, retryAfterSeconds: sec })`.
5. A11y i UI:
   - `OfflineBanner` i `RateLimitBanner` z `role="status"` i `aria-live="polite"`,
   - responsywne style Tailwind (sticky/fixed top, wysoka czytelność).
6. Teksty i i18n:
   - na teraz twarde polskie komunikaty (zgodnie z PRD), w przyszłości ekstrakcja do `pl.ts`.
7. Testy ręczne:
   - `offline`: wyłącz sieć w devtools → baner pojawia się i znika po powrocie,
   - `429`: zasymuluj odpowiedź z `retry_after_seconds` → odliczanie, CTA po 0s,
   - `ErrorBoundary`: sztucznie rzuć błąd w wyspie → `GlobalErrorScreen`.
8. QA kryteria PRD:
   - US‑100: 5xx/awaria → ekran z odświeżeniem i powrotem,
   - US‑070: 5xx/timeout → „Spróbuj ponownie” dostępne,
   - US‑046: 429 → baner z odliczaniem i blokadą do czasu 0s,
   - US‑028: czytelne błędy + brak utraty danych (rollback pozostaje w logice istniejących hooków).
