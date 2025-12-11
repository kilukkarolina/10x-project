# Plan implementacji widoku Transakcje

## 1. Przegląd

Widok Transakcje służy do przeglądania, filtrowania oraz wykonywania operacji CRUD (z soft-delete) na transakcjach. Zapewnia:

- filtry month/type/category/search z pamięcią w localStorage,
- wirtualizowaną listę z grupowaniem po dacie i sticky nagłówkami sekcji,
- paginację typu keyset z przyciskiem „Załaduj więcej”,
- formularze tworzenia/edycji w modalu oraz potwierdzenie soft-delete,
- optimistic update z rollbackiem, blokady CTA podczas mutacji,
- stany puste i komunikaty błędów po polsku,
- spójność sum z miesiącem oraz zgodność typów danych z API (kwoty w groszach, daty YYYY-MM-DD).

## 2. Routing widoku

- Ścieżka: `/transactions`.
- Implementacja: plik `src/pages/transactions.astro` z osadzonym React island `TransactionsApp.tsx` (w `src/components/transactions/`).
- Ochrona (na później): po wdrożeniu auth – dostęp tylko dla zalogowanych/zweryfikowanych, zachowanie zgodne z middleware.

## 3. Struktura komponentów

- `src/pages/transactions.astro`
  - Montuje `TransactionsApp` (React island).
- `src/components/transactions/TransactionsApp.tsx`
  - Orkiestracja: filtry, dane, lista, paginacja, modale, stany.
  - Dzieci:
    - `TransactionsFilters.tsx`
      - `MonthPicker` (reuse z dashboardu)
      - `TypeSelect.tsx` (INCOME/EXPENSE/ALL)
      - `CategorySelect.tsx` (źródło: GET /api/v1/categories, filtr po kind)
      - `SearchInput.tsx` (debounce)
      - `ClearFiltersButton.tsx`
    - `SummaryBar.tsx` (opcjonalny pasek sum: liczba rekordów strony, suma kwot aktualnie załadowanych)
    - `TransactionsListVirtual.tsx`
      - `TransactionsDateSection.tsx` (sticky header)
      - `TransactionRow.tsx` (w rzędzie akcje: Edit/Delete)
    - `LoadMoreButton.tsx`
    - `TransactionFormModal.tsx` (create/edit)
    - `ConfirmDeleteModal.tsx`
    - `EmptyState.tsx` („Dodaj pierwszą transakcję”)
    - `ErrorState.tsx`
    - `BackdateBanner.tsx` (reuse – banner „korekty historyczne” po edycji zmieniającej miesiąc)

Hooks i usługi (nowe):

- `src/components/transactions/hooks/useTransactionsFiltersState.ts`
- `src/components/transactions/hooks/useTransactionsData.ts`
- `src/components/transactions/hooks/useCategories.ts`
- `src/components/transactions/hooks/useDebouncedValue.ts`
- `src/components/transactions/hooks/useOptimisticTransactions.ts`

Pomocnicze:

- `src/components/transactions/utils/parsePlnInputToCents.ts`
- `src/components/transactions/utils/groupByDate.ts`
- (UI) Braki shadcn/ui do dodania: `dialog.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`, ewentualnie `badge.tsx`. Reuse istniejących: `button`, `card`, `select`, `skeleton`, `tooltip`.

## 4. Szczegóły komponentów

### TransactionsApp

- Opis: Kontener widoku. Łączy filtry, pobranie danych, listę, paginację, modale i banery.
- Główne elementy:
  - Pasek filtrów, ewentualny `SummaryBar`.
  - Lista wirtualizowana + sticky sekcje po dacie.
  - CTA „Dodaj transakcję”.
  - Modale create/edit i delete.
  - Stany: loading, empty, error.
- Zdarzenia:
  - Zmiana filtrów → refetch listy, reset kursora.
  - Submit create/edit → optimistic update + rollback on 409/422/5xx.
  - Delete → optimistic remove + rollback on 5xx.
  - Load more → pobranie kolejnej strony po `next_cursor`.
  - Edit skutkujący zmianą miesiąca → wyświetl `BackdateBanner`.
- Walidacja: delegowana do `TransactionFormModal` (patrz niżej), dodatkowo guardy na poziomie filtrów (format miesiąca, dozwolone wartości type).
- Typy: `TransactionsFiltersState`, `TransactionsDataState`, `TransactionsListItemVM`, `TransactionsGroupedSectionVM`.
- Propsy: brak (komponent root).

### TransactionsFilters

- Opis: Pasek kontrolny filtrowania listy.
- Główne elementy:
  - `MonthPicker` (reuse): value, onChange, prev/next, `isNextDisabled`.
  - `TypeSelect`: `INCOME` | `EXPENSE` | `ALL`.
  - `CategorySelect`: pobiera kategorie, filtruje po `type` (gdy `INCOME`/`EXPENSE`, zawęża listę).
  - `SearchInput`: tekst z debounce 300 ms.
  - `ClearFiltersButton`: resetuje do domyślnych.
- Zdarzenia:
  - onMonthChange, onTypeChange, onCategoryChange, onSearchChange, onClear.
- Walidacja:
  - month w formacie `YYYY-MM` i nie w przyszłości (reuse `parseMonth`, `isMonthValid`).
  - type ∈ {INCOME, EXPENSE, ALL}.
  - category – kod z listy aktywnych kategorii.
  - search – dowolny string; UI nie pozwala na wstrzyknięcie HTML (render jako text).
- Typy: `TransactionsFiltersState`, `TransactionType`.
- Propsy:
  - `value: TransactionsFiltersState`
  - `onChange: (next: TransactionsFiltersState) => void`
  - `categories: CategoryOption[]`
  - `isLoadingCategories: boolean`

### TransactionsListVirtual

- Opis: Lista z wirtualizacją i grupowaniem po dacie (YYYY-MM-DD) z nagłówkami sticky.
- Główne elementy:
  - Kontener scrollowalny, wiersze transakcji, sekcje dat.
  - Biblioteka: `@tanstack/react-virtual` (zalecane; lekka, prosta).
- Zdarzenia:
  - `onEdit(id)`, `onDelete(id)`.
  - Lazy render sekcji; utrzymanie focusu klawiatury.
- Walidacja:
  - Brak logiki walidacyjnej (tylko prezentacja).
- Typy: `TransactionsGroupedSectionVM`, `TransactionsListItemVM`.
- Propsy:
  - `sections: TransactionsGroupedSectionVM[]`
  - `isLoading: boolean`
  - `onEdit: (id: string) => void`
  - `onDelete: (id: string) => void`

### TransactionRow

- Opis: Wiersz listy; pokazuje: Data (w sekcji), Typ, Kategoria, Kwota (PLN), Notatka.
- Główne elementy:
  - Kolumny, przyciski akcji, tooltip dla kwoty/wzoru (opcjonalnie).
  - Notatka zawsze renderowana jako tekst (bez HTML) – XSS safe.
- Zdarzenia: `onEdit`, `onDelete`.
- Walidacja: Brak (prezentacja).
- Typy: `TransactionsListItemVM`.
- Propsy:
  - `item: TransactionsListItemVM`
  - `onEdit: (id: string) => void`
  - `onDelete: (id: string) => void`

### LoadMoreButton

- Opis: Przycisk ładowania kolejnej strony (keyset).
- Zdarzenia: `onClick()`.
- Walidacja: Blokada, gdy `hasMore === false` lub `isFetching === true`.
- Propsy:
  - `hasMore: boolean`
  - `isLoading: boolean`
  - `onLoadMore: () => void`

### TransactionFormModal

- Opis: Modal tworzenia/edycji transakcji.
- Główne elementy:
  - Pola: `type` (radio INCOME/EXPENSE), `category_code` (Select), `amount_pln` (Input), `occurred_on` (input type="date"), `note` (Textarea).
  - CTA: Zapisz, Anuluj.
  - UI: `Dialog` (shadcn), `Input`, `Select`, `Textarea`, `Label`, `Button`.
- Zdarzenia:
  - `onSubmit(data)`, `onCancel()`, zmiany pól, walidacje inline.
  - Disabled CTA w trakcie mutacji.
- Walidacja (client-side + spójna z API):
  - `type`: wymagany, ∈ {INCOME, EXPENSE}.
  - `category_code`: wymagany; z listy aktywnych; zgodność `kind` z `type`.
  - `amount_pln` → konwersja do `amount_cents`:
    - akceptuj `,` i `.`; dokładność 2 miejsca; > 0; wynik `int`.
  - `occurred_on`: `YYYY-MM-DD`, nie w przyszłości.
  - `note`: max 500 znaków; bez znaków kontrolnych; render jako tekst.
  - `client_request_id`: `crypto.randomUUID()` (idempotencja).
- Typy: `TransactionFormVM`, `CreateTransactionCommand`, `UpdateTransactionCommand`, `TransactionDTO`.
- Propsy:
  - `mode: "create" | "edit"`
  - `initial?: TransactionDTO` (dla edycji)
  - `defaultType?: TransactionType`
  - `categories: CategoryOption[]`
  - `onSubmit: (payload: CreateTransactionPayload | UpdateTransactionPayload) => Promise<void>`
  - `onClose: () => void`
  - `isSubmitting: boolean`

### ConfirmDeleteModal

- Opis: Modal potwierdzenia soft-delete.
- Główne elementy: treść, CTA „Usuń” (danger), „Anuluj”.
- Zdarzenia: `onConfirm()`, `onCancel()`.
- Propsy:
  - `open: boolean`
  - `onConfirm: () => Promise<void>`
  - `onCancel: () => void`
  - `isSubmitting: boolean`

### SummaryBar (opcjonalny)

- Opis: Pasek z sumą i liczbą pozycji aktualnie załadowanych (nie globalny sumator miesiąca, aby uniknąć dodatkowych zapytań).
- Propsy:
  - `visibleCount: number`
  - `visibleSumCents: number`

### EmptyState / ErrorState / BackdateBanner

- Reuse: istniejące wzorce z dashboardu; `BackdateBanner` pokazywany chwilowo po edycji z backdate.

## 5. Typy

Nowe typy/VM (oprócz istniejących w `src/types.ts`):

```ts
// Stan filtrów widoku
export interface TransactionsFiltersState {
  month: string; // "YYYY-MM"
  type: "INCOME" | "EXPENSE" | "ALL";
  category?: string | null; // code
  search?: string; // tekst
  limit: number; // domyślnie 50
}

// Opcja kategorii do Select
export interface CategoryOption {
  code: string;
  kind: "INCOME" | "EXPENSE";
  label: string; // label_pl
}

// VM pojedynczego wiersza listy
export interface TransactionsListItemVM {
  id: string;
  occurred_on: string; // "YYYY-MM-DD"
  type: "INCOME" | "EXPENSE";
  category_code: string;
  category_label: string;
  amount_cents: number;
  amount_pln: string; // sformatowane, np. "1 234,56" (formatCurrencyPL)
  note?: string | null; // bezpiecznie renderowane jako tekst
}

// VM sekcji pogrupowanej po dacie
export interface TransactionsGroupedSectionVM {
  date: string; // "YYYY-MM-DD"
  ariaLabel: string; // np. "Transakcje z 2025-01-15"
  items: TransactionsListItemVM[];
}

// Dane formularza (VM warstwy UI)
export interface TransactionFormVM {
  type: "INCOME" | "EXPENSE";
  category_code: string;
  amount_pln: string; // "1234,56" lub "1234.56"
  occurred_on: string; // "YYYY-MM-DD"
  note?: string | null;
}

// Payloady do serwera
export interface CreateTransactionPayload {
  type: "INCOME" | "EXPENSE";
  category_code: string;
  amount_cents: number;
  occurred_on: string;
  note?: string | null;
  client_request_id: string;
}

export type UpdateTransactionPayload = Partial<{
  category_code: string;
  amount_cents: number;
  occurred_on: string;
  note: string | null;
}>;
```

Reuse typów z `src/types.ts`: `TransactionDTO`, `TransactionListResponseDTO`, `TransactionType`, `CreateTransactionCommand`, `UpdateTransactionCommand`, `TransactionCategoryDTO`, `TransactionCategoryListResponseDTO`.

## 6. Zarządzanie stanem

- `useTransactionsFiltersState`
  - Przechowuje: `month`, `type`, `category`, `search`, `limit`.
  - Pamięć w localStorage pod kluczami:
    - `ff.transactions.month`
    - `ff.transactions.type`
    - `ff.transactions.category`
    - `ff.transactions.search`
  - Zmiana filtra resetuje kursor i dane listy.
- `useDebouncedValue(value, 300)` – do `search`.
- `useCategories(type)` – ładuje `GET /api/v1/categories?kind=...`, cache w pamięci komponentu; błąd → toast i pusta lista.
- `useTransactionsData(filters)`
  - Trzyma: `items: TransactionsListItemVM[]`, `sections: TransactionsGroupedSectionVM[]`, `pagination: { next_cursor, has_more }`, `loading`, `error`.
  - Metody: `refetch()`, `loadMore()`, `applyOptimisticCreate/Update/Delete`, `rollback()`.
  - Mapuje `TransactionDTO` → `TransactionsListItemVM` (z `formatCurrencyPL`) i grupuje po dacie (`groupByDate`).
- `useOptimisticTransactions`
  - Zapamiętuje snapshot listy na czas mutacji, stosuje zmiany lokalne; w razie błędu – rollback i toast.

## 7. Integracja API

### Endpoints i mapowanie

- GET `/api/v1/transactions`
  - Query: `month`, `type`, `category`, `search`, `cursor`, `limit`.
  - Response: `TransactionListResponseDTO`.
  - Front: mapuj `data[]` do VM; trzymaj `pagination.next_cursor`, `has_more`; sumuj `meta.total_amount_cents` (strona) do `SummaryBar`.
- POST `/api/v1/transactions`
  - Body: `CreateTransactionPayload` (z `client_request_id: crypto.randomUUID()`).
  - 201 → `TransactionDTO` (wstaw do listy z zachowaniem sortowania i sekcji).
  - 409 → toast „Zduplikowano żądanie – zapis pominięty”, rollback.
  - 422/400 → pokaż błędy walidacji przy polach, rollback.
- GET `/api/v1/transactions/:id`
  - Użycie: gdy otwieramy edycję poza listą źródłową lub potrzebujemy odświeżyć pojedynczy rekord.
- PATCH `/api/v1/transactions/:id`
  - Body: `UpdateTransactionPayload` (bez `type`).
  - 200 → `TransactionDTO` (z `backdate_warning?: true`); zaktualizuj pozycję, ewentualnie przenieś między sekcjami.
  - Jeśli `backdate_warning` → pokaż `BackdateBanner` (timeout/kliknięcie zamyka).
- DELETE `/api/v1/transactions/:id`
  - 204 → usuń wiersz z listy (optimistic).
  - 404/5xx → rollback i toast.
- GET `/api/v1/categories?kind=INCOME|EXPENSE`
  - Response: `TransactionCategoryListResponseDTO`; mapuj do `CategoryOption[]`.

Nagłówki/Cache:

- Kategorie: `Cache-Control: public, max-age=3600` – można cache’ować w pamięci do 1h.

## 8. Interakcje użytkownika

- Zmiana miesiąca/typu/kategorii/wyszukiwania → reset listy i fetch nowych danych.
- Klik „Dodaj transakcję” → otwiera `TransactionFormModal` w trybie create.
- Submit create:
  - walidacja (front), disable CTA, optimistic insert (tymczasowy wpis), request POST,
  - sukces → zastąp tymczasowy wpis danymi z serwera,
  - błąd → rollback i toast.
- Edit z wiersza → wypełnia `TransactionFormModal` danymi pozycji; submit analogicznie do create (PATCH).
- Delete → `ConfirmDeleteModal` → optimistic remove → DELETE → rollback on error.
- Load more → dociąga po `next_cursor`, dopina do listy, aktualizuje grupy/sekcje.
- Focus/klawiatura:
  - TAB porusza się logicznie po filtrach i liście,
  - ESC zamyka modale; przy niezatwierdzonych zmianach ostrzeżenie.

## 9. Warunki i walidacja

- Formularz:
  - `type`: wymagane; radio; domyślnie wg ostatniego wyboru lub `EXPENSE`.
  - `category_code`: wymagane; lista ograniczona do `kind` zgodnego z `type`; backend waliduje dodatkowo (US-092/053).
  - `amount_pln` → `amount_cents`:
    - parser akceptuje `,`/`.` jako separator dziesiętny; tylko 2 miejsca; > 0,
    - wynik typu `int` w groszach (US-085).
  - `occurred_on`: format `YYYY-MM-DD`, nie w przyszłości (US-036).
  - `note`: max 500; bez znaków kontrolnych; w UI zawsze render jako zwykły tekst (US-050).
  - `client_request_id`: `crypto.randomUUID()` (US-047/077).
- Filtry:
  - `month`: `YYYY-MM` i nie w przyszłości (reuse utils),
  - `type`: INCOME/EXPENSE/ALL,
  - `category`: musi istnieć w słowniku aktywnych kategorii; UI nie pozwoli wpisać dowolnego stringa,
  - `search`: bez wymagań – po stronie BE i tak `ilike`; UI renderuje bezpiecznie.
- Zgodność sum (US-052/073): dla filtrów `month` + `type` (bez `category`/`search`) suma listy miesiąca powinna równać się kartom dashboardu; testowana e2e. W widoku prezentujemy sumę aktualnie załadowanych pozycji; pełna suma miesiąca dostępna na dashboardzie.

## 10. Obsługa błędów

- 400 (query/body) – pokazuj komunikaty walidacji przy odpowiednich polach.
- 409 (idempotencja) – „To żądanie zostało już przetworzone”.
- 422 (walidacje biznesowe, np. kategoria nieaktywna/niezgodny typ) – inline errors + toast.
- 404 (GET by id / DELETE) – „Nie znaleziono transakcji”; w DELETE: rollback optimistic.
- 5xx/timeout – toast „Wystąpił błąd, spróbuj ponownie”, `Try again` w Empty/ErrorState; zachowaj wartości formularza.
- Sieć słaba – CTA w stanie `loading/disabled`; retry po błędzie (US-070/097).
- XSS – notatki renderowane jako tekst; brak `dangerouslySetInnerHTML` (US-050).
- Backdate – po edycji z miesiącem innym niż poprzednio: `BackdateBanner` (US-024).

## 11. Kroki implementacji

1. Routing i szkielet
   - Utwórz `src/pages/transactions.astro` i React island `TransactionsApp.tsx`.
   - Dodaj layout i breadcrumb/tytuł zgodnie z istniejącym stylem.
2. UI bazowe i brakujące komponenty shadcn/ui
   - Dodaj `ui/dialog.tsx`, `ui/input.tsx`, `ui/label.tsx`, `ui/textarea.tsx` (wg standardu shadcn w projekcie).
3. Hooks i utils
   - `useTransactionsFiltersState` (localStorage klucze `ff.transactions.*`).
   - `useDebouncedValue`.
   - `useCategories` (GET /categories, cache 1h).
   - `useTransactionsData` (GET /transactions; mapowanie DTO→VM; grupowanie; load more).
   - `useOptimisticTransactions`.
   - Utils: `groupByDate`, `parsePlnInputToCents` (konwersja z „pln string” do groszy).
4. Pasek filtrów
   - Zintegruj `MonthPicker` (reuse), `TypeSelect`, `CategorySelect` (zależny od `type`), `SearchInput` (debounce) i „Wyczyść”.
   - Zmiana filtra resetuje kursor i refetch listy.
5. Lista wirtualizowana
   - Zaimplementuj `TransactionsListVirtual` na `@tanstack/react-virtual`.
   - Dodaj `TransactionRow` i `TransactionsDateSection` (sticky headers).
6. Paginacja keyset
   - `LoadMoreButton` i obsługa `next_cursor` z API.
7. Formularz create/edit
   - `TransactionFormModal` z walidacją inline, parsowaniem kwot, blokadą CTA podczas mutacji.
   - POST: optimistic insert, rollback on error.
   - PATCH: optimistic update, obsługa `backdate_warning` → `BackdateBanner`.
8. Delete (soft-delete)
   - `ConfirmDeleteModal`, optimistic remove, rollback on błąd.
9. Stany i dostępność
   - `EmptyState` („Dodaj pierwszą transakcję”), `ErrorState` z retry.
   - Role/nagłówki sekcji, aria-live dla toastów, focus management w modalach.
10. Testy ręczne (ścieżki z US)

- US-006/007/008/009/010/011/012/013/014/015/024/028/036/047/050/052/053/057/060/061/073/085/092/097.

11. Optymalizacje

- Memoizacja listy/wierszy, `React.memo`, ograniczenie re-renderów, lazy mount modalów.

12. Dokumentacja

- README sekcja widoku: filtry, interakcje, edge cases, a11y.

## Uwagi implementacyjne i decyzje

- Wirtualizacja: `@tanstack/react-virtual` (lekka, prosta). Alternatywy: `react-window`.
- Kwoty: prezentacja `formatCurrencyPL` (reuse), wejście → `parsePlnInputToCents`.
- Idempotencja: `client_request_id = crypto.randomUUID()` po stronie klienta.
- Spójność z dashboardem: sumy miesiąca weryfikujemy w testach integracyjnych; w widoku pokazujemy sumę załadowanych pozycji.
- Bezpieczeństwo: notatki zawsze jako tekst; brak HTML injection.
- Lokalizacja: wszystkie komunikaty/etykiety po polsku; zgodnie z PRD (i18n docelowo centralny słownik).
