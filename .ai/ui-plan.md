# Architektura UI dla FinFlow

## 1. Przegląd struktury UI

- Fundament: jeden React‑island z klientową nawigacją (`@tanstack/router`), trasy: `/dashboard`, `/transactions`, `/goals`, `/goals/:id`, `/audit-log`, `/me`. `index.astro` przekierowuje po zalogowaniu do `/dashboard`.
- AppShell: stały układ z `Topbar` (globalny selektor miesiąca, banery systemowe, toasty) i `Sidebar` (nawigacja, pamięć zwinięcia), obszar treści z gniazdami tras i modalami.
- Źródło prawdy filtrów: parametry URL (w tym `month=YYYY-MM`), synchronizacja ze store i persystencja w `localStorage`.
- Stan i dane: `@tanstack/react-query` (staleTime/keepPreviousData per zasób, persystencja cache offline), Zustand dla stanu UI. Słowniki (`/categories`, `/goal-types`) ładowane na starcie, `staleTime: Infinity`, soft‑refresh co 24h z fallbackiem do ostatniej udanej wersji.
- Prefetch: przy zmianie `month` równoległe pobranie `metrics/monthly`, `metrics/expenses-by-category`, `metrics/priority-goal`. Skeletony i `keepPreviousData` dla płynności.
- Mutacje: centralny `apiClient` z nagłówkiem `Idempotency-Key` (UUID v7) dla POST/PATCH/DELETE, adapter błędów (422 inline, 409 rollback + toast, 429 baner z odliczaniem, 5xx ekran globalny), retry/backoff (limitowany).
- A11y: modale z focus‑trap, zamykanie ESC, toasty z `aria-live`, błędy formularzy z `aria-describedby`, listy z wirtualizacją i sticky nagłówkami. Degradacja tabel do kart <md.
- Bezpieczeństwo: sanitizacja notatek (XSS), defensywne renderowanie, brak niejawnego HTML; wyłącznie REST v1 do danych biznesowych. Blokady operacji według PRD (np. wypłaty > saldo).
- Zgodność i wydajność: spójne agregaty per miesiąc, paginacja keyset („Load more”), wirtualizacja długich list, UI bez migotania przy przełączaniu miesięcy.

Główne endpointy API (mapa na poziomie UI):
- Transakcje: `GET/POST/PATCH/DELETE /api/v1/transactions`, `GET /api/v1/transactions/:id`
- Kategorie: `GET /api/v1/categories` (readonly)
- Cele: `GET/POST/PATCH /api/v1/goals`, `POST /api/v1/goals/:id/archive`
- Zdarzenia celu: `GET/POST /api/v1/goal-events`
- Metryki: `GET /api/v1/metrics/monthly`, `GET /api/v1/metrics/expenses-by-category`, `GET /api/v1/metrics/priority-goal`
- Typy celów: `GET /api/v1/goal-types` (readonly)
- Audit Log: `GET /api/v1/audit-log`
- Profil: `GET/DELETE /api/v1/me`

## 2. Lista widoków

### Widok: Dashboard
- Ścieżka widoku: `/dashboard`
- Główny cel: szybki przegląd stanu finansów w wybranym miesiącu i kontekstowa nawigacja.
- Kluczowe informacje do wyświetlenia:
  - 4 karty: Dochód, Wydatki, Odłożone netto, Wolne środki (z tooltipem wzoru).
  - Wykres „Wydatki wg kategorii” (poziome słupki, wyłącznie EXPENSE).
  - Progress priorytetowego celu: stan, % progresu, „zmiana w tym miesiącu”.
  - Puste stany („Brak danych w tym miesiącu”).
  - Baner „korekty historyczne” po backdate.
- Kluczowe komponenty widoku:
  - `MetricsCards`, `FreeCashFlowTooltip`, `ExpensesByCategoryChart`, `PriorityGoalProgress`, `BackdateBanner`.
- UX, dostępność i względy bezpieczeństwa:
  - Czytelne liczby w formacie PL, bankierskie zaokrąglanie. Skeletony podczas ładowania.
  - Wykres z tekstem alternatywnym (opis sum i udziałów).
  - Brak danych → neutralny stan z wyjaśnieniem.
  - Dane tylko z REST v1; żadnych pochodnych obliczeń wykraczających poza kontrakt API.
- Powiązane endpointy API: `metrics/monthly`, `metrics/expenses-by-category`, `metrics/priority-goal`, `categories`.
- Powiązane historyjki PRD: US‑016, US‑017, US‑018, US‑037, US‑061, US‑065, US‑073, US‑083, US‑055, US‑064, US‑089, US‑090, US‑098, US‑052.

### Widok: Transakcje
- Ścieżka widoku: `/transactions`
- Główny cel: przegląd, filtrowanie i CRUD transakcji (soft‑delete) z płynną paginacją i spójnością metryk.
- Kluczowe informacje do wyświetlenia:
  - Lista z grupowaniem po dacie (sticky), kolumny: Data, Typ, Kategoria, Kwota (PLN), Notatka.
  - Filtry: `month`, `type` (INCOME/EXPENSE/ALL), `category`, `search`.
  - Paginacja keyset („Load more”), wskaźniki sum zgodne z miesiącem i filtrami.
  - Puste stany i komunikaty o limitach/wyszukiwaniu.
- Kluczowe komponenty widoku:
  - `TransactionsFilters`, `TransactionsListVirtual`, `LoadMoreButton`, `TransactionFormModal` (create/edit), `ConfirmDeleteModal`.
- UX, dostępność i względy bezpieczeństwa:
  - Wirtualizacja listy, klawiatura i screen‑readery (role, nagłówki grup).
  - Sanitizacja notatek; blokada „dzikich” pól (422).
  - Optimistic update z natychmiastowym rollbackiem przy 409/422; disabled CTA podczas mutacji.
  - Degradacja do kart <md.
- Powiązane endpointy API: `GET/POST/PATCH/DELETE /transactions`, `GET /transactions/:id`, `GET /categories`.
- Powiązane historyjki PRD: US‑006, US‑007, US‑008, US‑009, US‑010, US‑011, US‑012, US‑013, US‑014, US‑015, US‑024, US‑028, US‑036, US‑047, US‑050, US‑052, US‑053, US‑057, US‑060, US‑061, US‑073, US‑085, US‑092, US‑097.

### Widok: Cele
- Ścieżka widoku: `/goals`
- Główny cel: przegląd i zarządzanie celami (tworzenie, oznaczanie priorytetu, archiwizacja).
- Kluczowe informacje do wyświetlenia:
  - Lista celów (aktywne domyślnie, opcja pokazania archiwalnych).
  - Dla każdego: nazwa, typ, target, saldo, progres, status priorytetu/archiwizacji.
  - Akcje: „Utwórz cel” (modal), „Ustaw jako priorytet”, „Archiwizuj”.
- Kluczowe komponenty widoku:
  - `GoalsList`, `GoalCreateModal`, `GoalPriorityToggle`, `GoalArchiveConfirm`.
- UX, dostępność i względy bezpieczeństwa:
  - Walidacje targetu > 0, typ z listy. Jednoczesny priorytet wymuszony transakcyjnie (w UI jasny stan).
  - Archiwizacja bez usuwania historii; potwierdzenie i informacja o skutkach.
- Powiązane endpointy API: `GET/POST/PATCH /goals`, `POST /goals/:id/archive`, `GET /goal-types`.
- Powiązane historyjki PRD: US‑019, US‑020, US‑021, US‑040, US‑055, US‑059, US‑076.

### Widok: Szczegóły celu
- Ścieżka widoku: `/goals/:id`
- Główny cel: przegląd stanu celu (lewa kolumna) i historia zdarzeń (prawa kolumna), z możliwością DEPOSIT/WITHDRAW i edycji zdarzeń.
- Kluczowe informacje do wyświetlenia:
  - Przegląd: nazwa, typ, target, saldo, progres %, wskaźnik „zmiana w miesiącu”.
  - Historia: lista `goal_events` z filtrami po miesiącu i typie; sumy miesiąca i sumaryczna.
  - Akcje: `DEPOSIT`/`WITHDRAW` (modal), edycja `goal_event` (modal).
  - Baner „korekty historyczne” po backdate.
- Kluczowe komponenty widoku:
  - `GoalOverviewCard`, `GoalMonthlyChangeBadge`, `GoalEventsFilters`, `GoalEventsListVirtual`, `GoalEventFormModal`.
- UX, dostępność i względy bezpieczeństwa:
  - Walidacja WITHDRAW ≤ saldo; blokada operacji dla celów zarchiwizowanych.
  - Idempotencja mutacji; rollback i komunikaty przy 409/422; puste stany.
  - Informacja o priorytecie i szybkie przełączenie.
- Powiązane endpointy API: `GET /goals`, `GET /goal-events`, `POST /goal-events`, `PATCH (przez RPC, jeśli przewidziane później)`, `GET /metrics/priority-goal`.
- Powiązane historyjki PRD: US‑022, US‑023, US‑039, US‑041, US‑058, US‑064, US‑055, US‑059, US‑076, US‑089.

### Widok: Audit Log
- Ścieżka widoku: `/audit-log`
- Główny cel: przegląd historii zmian użytkownika (30 dni, wirtualizacja), szybkie filtrowanie i podgląd diff JSON.
- Kluczowe informacje do wyświetlenia:
  - Lista wpisów: czas (lokalny w UI, UTC w tooltipie), encja, akcja, streszczenie zmian.
  - Filtry: `entity_type`, `entity_id`, `action`, `from_date`, `to_date`, paginacja/cursor.
  - Szczegóły: Drawer/Modal z JSON‑diff (before/after), formatowanie i bezpieczeństwo wyświetlania.
- Kluczowe komponenty widoku:
  - `AuditLogFilters`, `AuditLogListVirtual`, `JsonDiffDrawer`.
- UX, dostępność i względy bezpieczeństwa:
  - Duże payloady: wirtualizacja, leniwe ładowanie diffu.
  - Czytelne etykiety i wyjaśnienia czasu (UTC vs lokalny).
  - Dostęp tylko do własnych danych; komunikat przy braku danych lub po retencji 30 dni.
- Powiązane endpointy API: `GET /audit-log`.
- Powiązane historyjki PRD: US‑027, US‑028, US‑069, US‑088, US‑070, US‑100.

### Widok: Mój profil
- Ścieżka widoku: `/me`
- Główny cel: podgląd profilu i podstawowych akcji (status weryfikacji, ponowna wysyłka verify, reset hasła – link/CTA, usunięcie konta).
- Kluczowe informacje do wyświetlenia:
  - Email, status weryfikacji, data utworzenia.
  - Akcje: „Wyślij ponownie e‑mail weryfikacyjny” (limity), „Reset hasła”, „Usuń konto” (ostrzeżenie o 24h).
- Kluczowe komponenty widoku:
  - `ProfileCard`, `VerifyEmailPanel`, `DangerZoneCard`.
- UX, dostępność i względy bezpieczeństwa:
  - Jasne komunikaty o limitach (baner z czasem do odblokowania).
  - Potwierdzenia destrukcyjnych akcji; blokady podczas przetwarzania.
- Powiązane endpointy API: `GET/DELETE /me` (+ akcje verify/reset wg integracji operacyjnej).
- Powiązane historyjki PRD: US‑081, US‑093, US‑033, US‑034, US‑046, US‑030, US‑071.

### Widok: Globalny błąd i stany systemowe
- Ścieżka widoku: fallback (np. `/error` lub globalny ErrorBoundary)
- Główny cel: prezentacja błędów krytycznych 5xx, baneru offline, rate‑limit 429 z odliczaniem.
- Kluczowe komponenty widoku: `GlobalErrorScreen`, `OfflineBanner`, `RateLimitBanner`.
- Powiązane historyjki PRD: US‑070, US‑100, US‑028, US‑046.

## 3. Mapa podróży użytkownika

### Flow A: Pierwsze uruchomienie → Dodanie pierwszej transakcji
1. `/dashboard` (brak danych) → placeholder „Dodaj pierwszą transakcję”.
2. CTA otwiera `TransactionFormModal` (prefill: `type=EXPENSE`, `date=today`).
3. Zapis (POST `/transactions`) z `Idempotency-Key` → optimistic update.
4. Po sukcesie: invalidacje `transactions`, `metrics/*` (miesiąc z daty wpisu), toast sukcesu.
5. UI pokazuje zaktualizowane karty i wykres; brak placeholderów.

### Flow B: Ustawienie priorytetowego celu i wpłata
1. `/goals` → „Utwórz cel” (modal) → POST `/goals`.
2. Oznaczenie jako priorytet (PATCH `/goals/:id`, transakcyjne wyłączenie poprzedniego).
3. `/goals/:id` → `DEPOSIT` (modal) → POST `/goal-events` (idempotencja).
4. Invalidacje: `goal-events`, `goals`, `metrics/priority-goal`, `metrics/monthly`, `metrics/expenses-by-category`.
5. Dashboard pokazuje wzrost „Odłożone netto” i progres celu.

### Flow C: Korekta historyczna transakcji (backdate)
1. `/transactions` → edycja (PATCH `/transactions/:id`) zmienia miesiąc.
2. Serwer zwraca `backdate_warning: true` → UI pokazuje baner z linkiem do nowego miesiąca.
3. Invalidacje metryk obu miesięcy oraz listy transakcji; płynna aktualizacja kart.

### Flow D: Przegląd zmian w Audit Log
1. `/audit-log` domyślnie zakres 30 dni.
2. Użytkownik filtruje po typie/encji, przewija wirtualizowaną listę.
3. Kliknięcie w wiersz otwiera `JsonDiffDrawer` z czytelnymi różnicami (bezpieczny render).

## 4. Układ i struktura nawigacji

- AppShell:
  - `Topbar`: `MonthSelector` (synchronizowany z URL), `FreeCashFlowTooltip`, toasty i banery (`OfflineBanner`, `RateLimitBanner`, `BackdateBanner`).
  - `Sidebar`: linki do `/dashboard`, `/transactions`, `/goals`, `/audit-log`, `/me`; pamięć zwinięcia; <md jako overlay.
  - `ContentOutlet`: gniazda tras i „modal routes” dla formularzy (nie blokują historii strony).
- Nawigacja i URL:
  - Globalny `month=YYYY-MM` dotyczy `/dashboard`, `/transactions`, `/goals/:id`. `Audit Log` używa `from_date`/`to_date`.
  - Filtry list (typ/kategoria/search/cursor) w URL; synchronizacja ze store i `localStorage`.
  - Prefetch danych metryk przy zmianie `month`; zachowanie `keepPreviousData` dla płynności.
- Responsywność:
  - Desktop‑first; <md: Sidebar jako overlay, tabele degradują do kart, utrzymana dostępność klawiatury.

## 5. Kluczowe komponenty

- App i układ:
  - `AppShell`, `Topbar`, `Sidebar`, `ContentOutlet`, `ToastProvider`, `ErrorBoundary`.
  - Banery systemowe: `OfflineBanner`, `RateLimitBanner`, `BackdateBanner`, `GlobalErrorScreen`.
- Sterowanie czasem i filtrami:
  - `MonthSelector` (URL + store), `TransactionsFilters`, `GoalEventsFilters`.
- Listy i tabele:
  - `TransactionsListVirtual` (grupowanie po dacie, sticky nagłówki), `GoalEventsListVirtual`, `AuditLogListVirtual`.
- Formularze i modale:
  - `TransactionFormModal` (create/edit), `ConfirmDeleteModal`, `GoalCreateModal`, `GoalEventFormModal`, `GoalArchiveConfirm`.
- Karty i wizualizacje:
  - `MetricsCards`, `FreeCashFlowTooltip`, `ExpensesByCategoryChart`, `PriorityGoalProgress`, `GoalOverviewCard`, `GoalMonthlyChangeBadge`, `GoalsList`.
- Integracja z API i słowniki:
  - `apiClient` (nagłówki, idempotencja, adapter błędów, retry/backoff), `DictionariesProvider` (`/categories`, `/goal-types`, staleTime Infinity, soft‑refresh 24h).
- A11y i bezpieczeństwo:
  - Focus‑trap w modalach, `aria-live` dla toastów, `aria-describedby` dla błędów, sanitizacja notatek, blokady operacji zgodnie z PRD (np. WITHDRAW > saldo).


