# Plan implementacji widoku Szczegóły celu

## 1. Przegląd

Widok prezentuje szczegóły pojedynczego celu oszczędnościowego oraz historię jego zdarzeń (DEPOSIT/WITHDRAW) z filtrami i paginacją. Umożliwia dodawanie wpłat/wypłat, podgląd i edycję zdarzeń, wgląd w miesięczną zmianę oraz szybkie rozpoznanie statusu (priorytet, archiwum). Zawiera baner „korekty historyczne” przy operacjach poza bieżącym miesiącem. Zgodny z PRD, typami DTO i istniejącymi endpointami.

## 2. Routing widoku

- Ścieżka: `/goals/:id`
- Plik strony: `src/pages/goals/[id].astro`
- React island: `GoalDetailApp` (montowany w pliku .astro)

## 3. Struktura komponentów

- `GoalDetailApp` (kontener widoku)
  - `BackdateBanner` (reuse z dashboardu; warunkowo)
  - Layout 2-kolumnowy (desktop): lewa kolumna – przegląd; prawa kolumna – historia
    - Lewa kolumna
      - `GoalOverviewCard`
        - `GoalMonthlyChangeBadge`
        - (opcjonalnie) `GoalPriorityToggle` (reuse) + informacja o archiwizacji
        - Akcje: otwarcie `GoalEventFormModal` (DEPOSIT/WITHDRAW)
    - Prawa kolumna
      - `GoalEventsFilters`
      - Sumary: łączna w miesiącu i łącznie (z danych listy/filtra)
      - `GoalEventsListVirtual`
        - wiersz: `GoalEventRow` (z akcją Edycja → `GoalEventFormModal` w trybie edit)
      - `LoadMoreButton` (gdy `has_more`)
  - `GoalEventFormModal` (create/edit; typ „DEPOSIT”/„WITHDRAW”)
  - `ErrorState`, `EmptyState`, `Skeleton` (reuse wzorców projekcie)

## 4. Szczegóły komponentów

### GoalDetailApp

- Opis: Kontener odpowiedzialny za routing param `id`, pobieranie danych, stan filtrów (miesiąc, typ), paginację, optimistic updates i synchronizację podkomponentów.
- Główne elementy: wrapper strony, kolumny layoutu, provider kontekstu (opcjonalnie), toast area.
- Obsługiwane interakcje:
  - Zmiana miesiąca/typu w filtrach
  - Paginacja listy (Load more)
  - Otwarcie/zamknięcie modala DEPOSIT/WITHDRAW/EDIT
  - Wysłanie formularza (optimistic update + rollback na 409/422/5xx)
- Walidacja:
  - Blokada akcji dla `archived_at != null` (disabled + tooltip)
  - Dla WITHDRAW: kwota ≤ bieżące saldo (walidacja lokalna przed POST)
  - Data `occurred_on` ≤ dziś (walidacja formularza)
- Typy: `GoalDTO`, `GoalEventDTO`, `GoalEventDetailDTO`, `GoalDetailViewModel`, `GoalEventFilterState`, `GoalEventsAggregates`, `GoalEventFormValues`.
- Propsy: brak (odczyt `:id` z Astro i `window.location` lub przekazany przez `data-*` z `[id].astro`).

### GoalOverviewCard

- Opis: Karta podsumowania – nazwa, typ (etykieta PL), target, saldo, progres %, status (priorytet/archiwum) i CTA (DEPOSIT/WITHDRAW).
- Główne elementy: tytuł z nazwą, badge typu, progress bar (shadcn/ui `progress.tsx`), pola liczbowe (PLN), przyciski akcji.
- Zdarzenia: kliknięcia „Wpłać”/„Wypłać” (otwarcie modala), (opcjonalnie) toggle priorytetu (jeśli dostępny endpoint PATCH).
- Walidacja: dla archiwum – CTA disabled; tooltips z komunikatem z PRD.
- Typy: `GoalDTO` (źródło), liczby formatowane PLN.
- Propsy: `{ goal: GoalDTO; onDeposit: () => void; onWithdraw: () => void; isArchived: boolean; }`

### GoalMonthlyChangeBadge

- Opis: Badge pokazujący „zmiana w miesiącu” (Σ(DEPOSIT − WITHDRAW) w wybranym miesiącu) dla danego celu.
- Główne elementy: liczba PLN z trendem (+/−/0), mini-legend.
- Zdarzenia: brak (wyłącznie prezentacja).
- Walidacja: brak (wyliczenia po stronie FE z listy eventów dla aktywnego miesiąca).
- Typy: `GoalEventsAggregates` (pole `monthNetCents`).
- Propsy: `{ monthNetCents: number; }`

### GoalEventsFilters

- Opis: Panel filtrów listy zdarzeń (miesiąc YYYY-MM i typ: ALL/DEPOSIT/WITHDRAW) + podsumowania (miesięczne i łączne).
- Główne elementy: picker miesiąca (reuse `useMonthState`), select typu (shadcn/ui `select.tsx`), pola sum.
- Zdarzenia: `onMonthChange`, `onTypeChange`, `onReset` (opcjonalnie).
- Walidacja: `month` nie przyszły (zabezpieczenie w pickerze); typ tylko z dozwolonych literalów.
- Typy: `GoalEventFilterState`, `GoalEventsAggregates`.
- Propsy: `{ filters: GoalEventFilterState; aggregates: GoalEventsAggregates; onChange: (f: GoalEventFilterState) => void; }`

### GoalEventsListVirtual

- The purpose: Wirtualizowana lista zdarzeń sortowana po `created_at DESC, id DESC` z paginacją cursorową.
- Główne elementy: scroller, item renderer `GoalEventRow`, przechwycenie końca listy.
- Zdarzenia: `onEndReached` (ładowanie kolejnej strony), `onEdit(event)`.
- Walidacja: brak (prezentacja); spójność z kolejnością z API.
- Typy: `GoalEventDTO[]`.
- Propsy: `{ events: GoalEventDTO[]; hasMore: boolean; isLoading: boolean; onLoadMore: () => void; onEdit: (e: GoalEventDTO) => void; }`

### GoalEventRow

- Opis: Wiersz zdarzenia (data wystąpienia, typ, kwota, data utworzenia w tooltipie), akcja „Edytuj” (modal).
- Główne elementy: label typu (badge), kwota (kolor +/−), daty, przycisk Edytuj.
- Zdarzenia: `onEdit`.
- Walidacja: brak.
- Typy: `GoalEventDTO`.
- Propsy: `{ event: GoalEventDTO; onEdit: (e: GoalEventDTO) => void; }`

### GoalEventFormModal

- Opis: Modal do dodania/edycji zdarzenia (DEPOSIT/WITHDRAW). Pola: typ, data, kwota, (ukryty) `client_request_id` przy create.
- Główne elementy: `dialog.tsx`, `input.tsx`, `select.tsx`, przyciski Zapisz/Anuluj.
- Zdarzenia: `onSubmit(values)`, `onClose()`; blokada double-submit.
- Walidacja (na submit):
  - amount_pln > 0, poprawny format; parsowanie do groszy przez reuse `parsePlnInputToCents` (istnieje w transakcjach).
  - occurred_on: format YYYY-MM-DD oraz ≤ dziś.
  - przy WITHDRAW: kwota ≤ aktualne saldo (z props).
  - przy edycji: podświetlenie backdate (zmiana miesiąca ≠ aktywny) → trigger banera.
- Typy: `GoalEventFormValues`.
- Propsy: `{ mode: "create" | "edit"; initialValues?: GoalEventFormValues; goalId: string; currentBalanceCents: number; onSubmit: (values) => Promise<void>; onClose: () => void; }`

## 5. Typy

- DTO (reuse z `src/types.ts`):
  - `GoalDTO`: id, name, type_code, type_label, target_amount_cents, current_balance_cents, progress_percentage, is_priority, archived_at, created_at, updated_at.
  - `GoalEventDTO`: id, goal_id, goal_name, type ("DEPOSIT" | "WITHDRAW"), amount_cents, occurred_on, created_at.
  - `GoalEventDetailDTO`: jak `GoalEventDTO` + `goal_balance_after_cents` (odpowiedź POST).
- ViewModel/nowe typy FE:
  - `GoalDetailViewModel`:
    - `goal: GoalDTO`
    - `isArchived: boolean` (shortcut: `goal.archived_at !== null`)
    - `progressPct: number` (alias z DTO, zaokrąglenia UI)
  - `GoalEventFilterState`:
    - `month: string` (YYYY-MM)
    - `type: "ALL" | "DEPOSIT" | "WITHDRAW"`
    - `cursor?: string | null`
    - `limit: number` (domyślnie 50)
  - `GoalEventsAggregates`:
    - `monthDepositCents: number`
    - `monthWithdrawCents: number`
    - `monthNetCents: number` (Σ(DEPOSIT − WITHDRAW) dla aktywnego miesiąca)
    - `totalDepositCents: number` (dla bieżących filtrów bez month lub w obrębie listy załadowanej — komunikat, że dotyczy zakresu wyników)
    - `totalWithdrawCents: number`
    - `totalNetCents: number`
  - `GoalEventFormValues`:
    - `type: "DEPOSIT" | "WITHDRAW"`
    - `amountPlnInput: string` (wejście użytkownika)
    - `occurred_on: string` (YYYY-MM-DD)
    - `client_request_id?: string` (tworzone przy `create` – `crypto.randomUUID()`)

## 6. Zarządzanie stanem

- Hooki niestandardowe:
  - `useGoalDetailData(goalId: string)`
    - Odpowiada za: pobranie `GoalDTO` (Plan A: GET /api/v1/goals/:id – jeśli dostępny; Plan B: GET /api/v1/goals i filtracja po id), utrzymanie `goal` i `isArchived`.
    - Zapewnia funkcje do local-update salda podczas optimistic updates.
  - `useGoalEventsData(goalId: string, filters: GoalEventFilterState)`
    - Odpowiada za: pobieranie listy z `GET /api/v1/goal-events`, utrzymanie `events[]`, `pagination`, `isLoading`, `error`, `loadMore`.
    - Oblicza `GoalEventsAggregates` (miesięczne i łączne) po stronie FE na podstawie załadowanych rekordów i aktywnego `filters.month`.
  - `useMonthState(initial?: string)` (reuse istniejącego hooka; jeśli wspólny, zaimportować z miejsca wspólnego).
  - `useBackdateFlag()` (reuse; ustawienie flagi po create/edit, jeśli `occurred_on` miesiąc ≠ aktywny `filters.month`).
- Stan widoku w `GoalDetailApp`:
  - `filters: GoalEventFilterState` (kontrolowany przez `GoalEventsFilters`)
  - `showBackdateBanner: boolean`
  - `modal: { open: boolean; mode: "create" | "edit"; initial?: GoalEventFormValues }`
  - `pendingRequest: boolean` (blokada double-submit)
  - `optimisticQueue`: kolejka lokalnych zmian do ewentualnego rollbacku

## 7. Integracja API

- GET `/api/v1/goals` (tymczasowo do uzyskania `GoalDTO` gdy brak `/goals/:id`)
  - Zapytanie: bez parametrów lub `include_archived=true` (jeśli chcemy również archiwalne).
  - Odpowiedź: `GoalListResponseDTO` → wybór po `id`.
- GET `/api/v1/goal-events`
  - Parametry: `goal_id` (wymagany dla widoku), `month` (YYYY-MM), `type` (opcjonalny), `cursor` (opcjonalny), `limit` (domyślnie 50).
  - Odpowiedź: `GoalEventListResponseDTO` (dane + paginacja).
- POST `/api/v1/goal-events`
  - Body: `CreateGoalEventCommand`:
    - `goal_id`, `type`, `amount_cents`, `occurred_on`, `client_request_id`.
  - Odpowiedź: `201` → `GoalEventDetailDTO` (zaktualizowane saldo `goal_balance_after_cents`).
  - Obsługa błędów:
    - `404` – brak/archiwum/usunięty cel → toast + zamknięcie modala, odświeżenie widoku.
    - `409` – `DUPLICATE_REQUEST` (idempotencja) lub `INSUFFICIENT_BALANCE` → komunikat i rollback.
    - `422` – walidacje (np. przyszła data) → inline errors w formularzu.
- GET `/api/v1/metrics/priority-goal` (opcjonalnie do synchronizacji dashboardu po zmianach – odświeżenie w tle, gdy dany cel jest priorytetem).

## 8. Interakcje użytkownika

- „Wpłać”/„Wypłać” → otwarcie `GoalEventFormModal` (tryb create, typ preselektowany).
- Submit modala (create):
  - Walidacje lokalne (format kwoty, data ≤ dziś, WITHDRAW ≤ saldo).
  - Generacja `client_request_id`.
  - Optimistic update: lokalnie dodaj rekord do listy (na początku), zaktualizuj saldo celu i agregaty.
  - Na sukces: zamknij modal; zastąp rekord danymi z serwera (id, created_at, balance_after).
  - Na błąd: rollback wpisu/zmian i pokaż toast z powodem (409/422/5xx).
- Edycja zdarzenia (tryb edit):
  - Pre-fill formularza; walidacje jak wyżej.
  - Do czasu dostępności endpointu PATCH: UI zaimplementowany, CTA „Zapisz” disabled z tooltipem „Dostępne wkrótce” lub feature-flag.
  - Po wdrożeniu PATCH: zastosować optimistic update analogicznie, przeliczyć agregaty; jeśli miesiąc zmieniony ≠ aktywny → ustaw `showBackdateBanner = true`.
- Filtry:
  - Zmiana `month` → reset listy (cursor=null), ponowne pobranie danych, przeliczenie `GoalMonthlyChangeBadge`.
  - Zmiana `type` → reset listy i pobranie.
- Paginacja: „Load more” → użycie `next_cursor`.

## 9. Warunki i walidacja

- WITHDRAW ≤ `goal.current_balance_cents` (lokalnie i przez API).
- `occurred_on` ≤ dzisiejsza data (lokalnie; API zwróci 422 w razie naruszenia).
- `amount_pln` > 0; parser akceptuje `,` i `.` (reuse `parsePlnInputToCents`).
- `archived_at != null` → ukryj/wyłącz CTA tworzenia i edycji; dodaj informację, że historia pozostaje, ale nowe operacje są zablokowane.
- Priorytet: gdy cel priorytetowy zmieni się poza widokiem (np. na liście), widok po powrocie/przeładowaniu ma spójne dane (refetch na mount i po mutacji).
- Baner backdate: ustaw przy create/edit, jeśli `occurred_on` nie należy do aktywnego `filters.month`.

## 10. Obsługa błędów

- 400/422: podświetlenie pól w formularzu + komunikat PL (inline) oraz toast.
- 404: zamknięcie modala, komunikat „Cel nie istnieje lub jest zarchiwizowany”; przekierowanie do `/goals` przy twardym 404 celu.
- 409 DUPLICATE_REQUEST: idempotencja – pokaż toast „Operacja została już zarejestrowana” (brak podwójnych wpisów).
- 409 INSUFFICIENT_BALANCE: komunikat „Kwota wypłaty przekracza saldo” z ewentualnym wskazaniem aktualnego salda.
- 5xx/timeout: toast + przycisk „Spróbuj ponownie”; rollback optimistic.
- Brak danych miesiąca: neutralny stan „Brak danych w tym miesiącu” (lista i badge pokazują 0).

## 11. Kroki implementacji

1. Routing i skeleton
   - Utwórz `src/pages/goals/[id].astro` (import globalnego layoutu i mount `GoalDetailApp`).
   - Dodaj kontener layoutu 2-kolumnowego (na desktop), prosty `Skeleton`.
2. Kontener `GoalDetailApp`
   - Odczytaj `id` z paramów; zainicjuj `useMonthState` (domyślnie bieżący miesiąc).
   - Zaimplementuj `useGoalDetailData` (Plan A: GET `/goals/:id` po dodaniu endpointu; Plan B: GET `/goals` + filtr po `id`).
   - Zaimplementuj `useGoalEventsData` (GET `/goal-events` z `goal_id`, `month`, opcjonalnie `type`, paginacja cursorowa).
   - Oblicz `GoalEventsAggregates` (miesiąc i łącznie dla zakresu wyników).
3. Komponenty lewa kolumna
   - `GoalOverviewCard`: prezentacja danych + przyciski akcji (disabled przy archiwum).
   - `GoalMonthlyChangeBadge`: wartość z agregatów.
   - (Opcjonalnie) `GoalPriorityToggle`: reuse istniejącego komponentu; dopasuj API gdy dostępne.
4. Komponenty prawa kolumna
   - `GoalEventsFilters`: select typu i picker miesiąca; `onChange` aktualizuje `filters` i resetuje listę.
   - `GoalEventsListVirtual`: wirtualizacja, `GoalEventRow`, `LoadMoreButton` na końcu.
5. Modal `GoalEventFormModal`
   - Pola: typ (select), data (input type="date"), kwota (input text); mapowanie do groszy parserem.
   - Tryb create: generacja `client_request_id`, optimistic add + update salda i agregatów; obsługa błędów jak w sekcji 10.
   - Tryb edit: UI gotowy, disabled submit (do czasu endpointu PATCH) lub za feature-flagą.
6. Backdate banner
   - Reuse `BackdateBanner`; hook `useBackdateFlag` podnosi flagę, gdy create/edit poza `filters.month`.
7. Formatowanie i i18n
   - Format PLN: `Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" })` (spójnie w projekcie).
   - Teksty do centralnego słownika (PL) – komunikaty toasts/tooltipów.
8. Dostępność i UX
   - Modal: focus na pierwszym polu; ESC zamyka; blokada double-submit; aria-live dla toastów.
   - Przyciski CTA: stany Loading/Disabled (US-097).
9. Testy ręczne (scenariusze kluczowe)
   - DEPOSIT w bieżącym miesiącu (sukces).
   - WITHDRAW z kwotą > saldo (blokada klienta i 409 z serwera – weryfikacja toasta i rollback).
   - Operacja z datą w przeszłym miesiącu → baner backdate.
   - Zarchiwizowany cel → CTA disabled; lista zdarzeń nadal dostępna.
10. Refine i wydajność

- Weryfikacja płynności listy i czasu odpowiedzi ≤200 ms (dla typowych zakresów).
- Debounce zmian filtrów (opcjonalnie 200–300 ms).

11. (Opcjonalnie) Backend follow-ups

- Dodać `GET /api/v1/goals/:id` (schema i service są gotowe).
- Dodać `PATCH /api/v1/goal-events/:id` lub RPC do edycji zdarzeń (wymagania US-039).
- Dodać `POST /api/v1/goals/:id/archive` (już istnieje service), jeśli potrzebne z widoku szczegółów.
