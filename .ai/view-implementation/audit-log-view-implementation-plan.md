## Plan implementacji widoku Audit Log

## 1. Przegląd

Widok Audit Log służy do przeglądania historii zmian danych użytkownika w ostatnich 30 dniach. Umożliwia szybkie filtrowanie po typie encji, identyfikatorze encji, akcji oraz zakresie czasu, wspiera stronicowanie oparte na kursorze i efektywny rendering długich list (wirtualizacja). Szczegóły pojedynczego wpisu otwierane są w modalu z czytelnym JSON‑diff (before/after). Czas zdarzeń prezentowany jest w strefie lokalnej z tooltipem zawierającym UTC.

Powiązanie z PRD i user stories: US‑027, US‑028, US‑069, US‑070, US‑088, US‑100.

## 2. Routing widoku

- Ścieżka: `/audit-log`
- Plik strony: `src/pages/audit-log.astro` (Astro layout + React island `AuditLogApp`)
- Wymagania dostępu: tylko zalogowany i zweryfikowany użytkownik (docelowo; w dev może być `DEFAULT_USER_ID`).

## 3. Struktura komponentów

- `AuditLogApp` (root widoku)
  - `AuditLogFilters`
  - `AuditLogListVirtual`
    - `AuditLogRow`
  - `JsonDiffDialog`
  - `LoadMoreButton` (reuse z goals)
  - `EmptyState` / `ErrorState` (lokalne warianty lub reuse)

## 4. Szczegóły komponentów

### AuditLogApp

- Opis: Kontener logiki widoku. Odpowiada za stan filtrów, pobieranie danych, paginację po kursorze, obsługę błędów i otwieranie modalu diff.
- Główne elementy: wrapper sekcji, nagłówek, `AuditLogFilters`, `AuditLogListVirtual`, `JsonDiffDialog`, `LoadMoreButton`, `EmptyState`/`ErrorState`.
- Obsługiwane interakcje:
  - Zmiana filtrów i zatwierdzenie (fetch pierwszej strony, reset kursora).
  - Paginate „Załaduj więcej” (fetch kolejnej strony po `next_cursor`).
  - Kliknięcie w wiersz → otwarcie `JsonDiffDialog` dla danego wpisu (leniwe obliczanie diff).
  - Retry po błędzie (pełny reload listy lub powtórzenie ładowania kolejnej strony).
- Walidacja:
  - `entity_id` musi być poprawnym UUID v4 (frontend + API).
  - `entity_type` ∈ {`transaction`, `goal`, `goal_event`} (frontend + API).
  - `action` ∈ {`CREATE`, `UPDATE`, `DELETE`} (frontend + API).
  - `from_date`/`to_date` w ISO 8601; `from_date` ≤ `to_date` (frontend).
- Typy: `AuditLogEntryDTO`, `AuditLogListResponseDTO`, `ErrorResponseDTO`, `AuditLogFiltersVM`, `AuditLogListItemVM`, `JsonDiffVM`.
- Propsy: brak (root).

### AuditLogFilters

- Opis: Panel filtrów z kontrolkami do zawężania wyników.
- Główne elementy:
  - `Select` dla `entity_type`
  - `Input` dla `entity_id` (UUID)
  - `Select` dla `action`
  - Dwa pola `input[type="datetime-local"]` dla `from_date` i `to_date`
  - Przyciski: „Zastosuj”, „Wyczyść”
  - Tooltip z wyjaśnieniem retencji 30 dni
- Obsługiwane interakcje:
  - Zmiana wartości filtrów (kontrolowane).
  - Zatwierdzenie filtrów (emit onApply).
  - Wyczyść (reset do wartości domyślnych).
- Walidacja:
  - UUID (regex) dla `entity_id` (opcjonalne pole).
  - `from_date`/`to_date` → konwersja do ISO 8601 (UTC) przed wysyłką.
  - Enumowe wartości dla `entity_type`, `action`.
- Typy: `AuditLogFiltersVM`.
- Propsy:
  - `value: AuditLogFiltersVM`
  - `onChange(next: AuditLogFiltersVM): void`
  - `onApply(): void`
  - `onReset(): void`

### AuditLogListVirtual

- Opis: Wirtualizowana lista wpisów audit log (na bazie `@tanstack/react-virtual` – zgodnie z istniejącym `GoalEventsListVirtual`).
- Główne elementy: kontener scroll, warstwa pozycyjna, kolekcja `AuditLogRow`, „Załaduj więcej”.
- Obsługiwane interakcje:
  - Kliknięcie wiersza → `onSelect(entry)`
  - Ładowanie kolejnej strony: `onLoadMore()`
- Walidacja: brak (prezentacja).
- Typy: `AuditLogListItemVM`.
- Propsy:
  - `items: AuditLogListItemVM[]`
  - `hasMore: boolean`
  - `isLoading: boolean`
  - `onLoadMore(): void`
  - `onSelect(item: AuditLogListItemVM): void`

### AuditLogRow

- Opis: Pojedynczy wiersz listy z informacjami o czasie (lokalny + tooltip z UTC), encji, akcji i streszczeniu zmian.
- Główne elementy: kolumny tekstowe, `Tooltip` dla czasu (UTC).
- Obsługiwane interakcje: klik wiersza (otwarcie szczegółów).
- Walidacja: treść renderowana jako tekst (bez HTML) → odporność na XSS.
- Typy: `AuditLogListItemVM`.
- Propsy:
  - `item: AuditLogListItemVM`
  - `onClick(item: AuditLogListItemVM): void`

### JsonDiffDialog

- The purpose: Modal prezentujący różnice `before` vs `after`. Lazy compute (tylko po otwarciu), bezpieczne renderowanie (pre/code, brak dangerouslySetInnerHTML).
- Główne elementy: `Dialog` (z `ui/dialog`), przełącznik widoku (diff | pełny JSON), sekcja różnic, przyciski zamknięcia.
- Interakcje:
  - Otwórz/zamknij
  - Przełącz widok
  - Kopiuj JSON (przycisk pomocniczy)
- Walidacja: obsługa przypadku `before === null` (CREATE) i `after === null` (DELETE).
- Typy: `JsonDiffVM`
- Propsy:
  - `open: boolean`
  - `entry: AuditLogEntryDTO | null`
  - `onOpenChange(next: boolean): void`
  - `computeDiff(entry: AuditLogEntryDTO): JsonDiffVM` (wstrzyknięta strategia diff, aby łatwo testować)

## 5. Typy

### Reużywane DTO (z `src/types.ts`)

- `AuditLogEntryDTO`: `{ id, entity_type, entity_id, action, before, after, performed_at }`
- `AuditLogListResponseDTO`: `{ data: AuditLogEntryDTO[], pagination: { next_cursor, has_more, limit } }`
- `ErrorResponseDTO`: `{ error, message, details?, retry_after_seconds? }`

### Nowe typy (ViewModel)

```ts
export type AuditLogFiltersVM = {
  entityType?: "transaction" | "goal" | "goal_event";
  entityId?: string; // UUID v4
  action?: "CREATE" | "UPDATE" | "DELETE";
  fromDate?: string; // ISO 8601 (UTC)
  toDate?: string; // ISO 8601 (UTC)
  limit: number; // 1..100 (domyślnie 50)
};

export type AuditLogListItemVM = {
  id: string;
  entityType: "transaction" | "goal" | "goal_event";
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  performedAtLocal: string; // np. "2025-01-16 11:00"
  performedAtUTC: string; // np. "2025-01-16T10:00:00Z"
  summary: string; // krótkie streszczenie zmian
};

export type JsonDiffChange = {
  path: string; // np. "amount_cents"
  from: unknown;
  to: unknown;
  kind: "added" | "removed" | "changed";
};

export type JsonDiffVM = {
  changes: JsonDiffChange[];
  beforePretty: string; // JSON.stringify(before, null, 2)
  afterPretty: string; // JSON.stringify(after, null, 2)
};
```

## 6. Zarządzanie stanem

- Stan filtrów: kontrolowany w `AuditLogApp`; zapisywany w `localStorage` (klucz np. `auditLogFilters:v1`); przy inicjalizacji odczyt i walidacja.
- Stan listy: `items: AuditLogListItemVM[]`, `cursor: string | null`, `hasMore: boolean`, `isLoading: boolean`, `error: Error | null`.
- Stan modalu: `selectedEntry: AuditLogEntryDTO | null`, `dialogOpen: boolean`, `diffCache: Map<string, JsonDiffVM>` dla memoizacji.
- Custom hooki:
  - `useAuditLogData(filters)`: fetch pierwszej strony, reset kursora; zwraca metody `loadMore()`, `refresh()` i bieżący stan.
  - `useJsonDiff()`: zwraca `computeDiff(entry)` i przechowuje cache wyników.

## 7. Integracja API

- Endpoint: `GET /api/v1/audit-log`
- Query params: `entity_type?`, `entity_id?`, `action?`, `from_date?`, `to_date?`, `cursor?`, `limit?`.
- Request:
  - Budowa query string wyłącznie z obecnych, poprawnych parametrów.
  - `datetime-local` → ISO 8601 (UTC), np. poprzez utworzenie `Date` z lokalnej strefy i konwersję do `toISOString()`.
- Response:
  - Sukces: `AuditLogListResponseDTO`.
  - Błąd 400: walidacja (INVALID_CURSOR/VALIDATION_ERROR) → toast + reset kursora/naprawa pól.
  - Błąd 401/403: brak dostępu (US‑088) → komunikat „Brak dostępu”.
  - Błąd 5xx/timeout (US‑070/US‑100): ekran błędu lub sekcja z przyciskiem „Spróbuj ponownie”.

## 8. Interakcje użytkownika

- Zastosuj filtry → załaduj pierwszą stronę wyników, przewiń do góry listy, wyczyść błędy.
- Kliknij wiersz → otwórz modal diff; oblicz diff leniwie; pokaż zmiany i pełny JSON.
- Załaduj więcej → jeśli `has_more`, pobierz kolejną stronę po `next_cursor` i doklej do listy.
- Wyczyść filtry → reset formularza; zapisz do `localStorage`; przeładuj listę.
- Tooltip czasu → hover na czasie pokazuje dokładny `performed_at` w UTC.

## 9. Warunki i walidacja

- `entity_type` i `action`: tylko wartości z enumów.
- `entity_id`: UUID v4 (regex), w przeciwnym razie blokada submitu z komunikatem.
- `from_date`, `to_date`:
  - oba w ISO 8601 (UTC),
  - `from_date` ≤ `to_date` (walidacja na froncie),
  - opcjonalnie: podpowiedź o retencji 30 dni (starsze i tak nie zwrócą wyników).
- Kursory: obsługa błędu `INVALID_CURSOR` → reset paginacji i informacja dla użytkownika.
- XSS: wszystkie wartości renderować jako tekst; JSON w `<pre><code>` bez HTML.

## 10. Obsługa błędów

- 400 (walidacja): inline na polach + toast; szczegóły z `details` (jeśli obecne).
- 401/403 (autoryzacja): sekcja z informacją o braku dostępu; link do logowania/odświeżenia.
- 404 (pusty wynik): `EmptyState` z informacją o braku danych w tym zakresie.
- 5xx/timeout: komponent błędu z akcją „Spróbuj ponownie” (US‑070/US‑100). Jeżeli błąd przy „Load more”, pozostaw już wczytane elementy.
- Sieć offline: komunikat o braku połączenia; przyciski disabled, retry po odzyskaniu łącza.

## 11. Kroki implementacji

1. Routing
   - Dodaj `src/pages/audit-log.astro` (layout, heading, React island `AuditLogApp`).
2. Szkielet `AuditLogApp`
   - Struktura sekcji, placeholdery dla filtrów, listy i modalu.
   - Local state dla filtrów, listy, błędów, modalu.
3. `AuditLogFilters`
   - Kontrolki: `Select` (entity_type, action), `Input` (entity_id), `datetime-local` (from/to).
   - Walidacje UI (UUID, zakres dat).
   - Persist do `localStorage` (w `AuditLogApp`).
4. Warstwa danych
   - `useAuditLogData(filters)`: fetch pierwszej strony, obsługa kursora i `loadMore()`.
   - Mapowanie `AuditLogEntryDTO` → `AuditLogListItemVM` (czas lokalny + tooltip UTC, summary).
5. Lista i wiersz
   - `AuditLogListVirtual` na bazie `@tanstack/react-virtual` (analogicznie do `GoalEventsListVirtual`).
   - `AuditLogRow` z tooltipem (UTC), klik → otwarcie modalu.
   - Reuse `LoadMoreButton`.
6. `JsonDiffDialog`
   - Dialog z zakładką „Diff” i „Pełny JSON”.
   - `useJsonDiff` + cache wyników; obsługa CREATE/DELETE.
7. Stany specjalne
   - `EmptyState` dla braku danych (zakres/retencja).
   - `ErrorState` dla 5xx/timeout z przyciskiem Retry.
8. Obsługa błędów
   - Toasty dla błędów walidacji i sieciowych (PL copy).
   - Specjalne ścieżki dla 401/403.
9. Testy manualne
   - Filtry (każda kombinacja), paginacja, retry.
   - UTC vs lokalny, tooltip, diff dla UPDATE/CREATE/DELETE.
10. Optymalizacje

- Memoizacja listy i diffów.
- Lazy import ewentualnej biblioteki diff (opcjonalnie, jeśli zajdzie potrzeba).

## 12. Mapowanie user stories na implementację

- US‑027: Lista wpisów z `before/after`, `performed_at` (UTC), modal diff; retencja 30 dni (komunikat).
- US‑028: Czytelne komunikaty błędów (toasty, inline), brak utraty stanu filtrów.
- US‑069: Czas lokalny w wierszu + tooltip z UTC.
- US‑070: Retry na błędach 5xx/timeout („Spróbuj ponownie”), bez utraty już pobranych danych.
- US‑088: Błędy autoryzacji 401/403 → komunikat „Brak dostępu”.
- US‑100: Globalny ekran błędu przy krytycznych awariach z opcją odświeżenia.

## 13. Notatki implementacyjne

- Wirtualizacja: wykorzystać istniejący wzorzec z `GoalEventsListVirtual` (`@tanstack/react-virtual`).
- Komponenty UI: `ui/select`, `ui/input`, `ui/button`, `ui/dialog`, `ui/tooltip`.
- Konwersja dat: helper do `datetime-local` → ISO 8601 (UTC) i odwrotnie.
- XSS: żadnego HTML z danych, tylko tekst, `pre/code` dla JSON.
- Wydajność: leniwe liczenie diffu, cache wyników, przewidywalna wysokość wierszy (estimateSize).
