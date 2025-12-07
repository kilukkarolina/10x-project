## Plan implementacji widoku Cele

## 1. Przegląd
Widok „Cele” umożliwia przegląd i zarządzanie celami oszczędnościowymi użytkownika: tworzenie nowych celów, oznaczanie priorytetu oraz archiwizację bez utraty historii. Domyślnie prezentuje cele aktywne, z możliwością przełączenia widoku na zarchiwizowane. Widok jest spójny z PRD i story US‑019, US‑020, US‑021, US‑040, US‑055, US‑059, US‑076.

## 2. Routing widoku
- Ścieżka: `/goals` (nowa strona Astro).
- Plik: `src/pages/goals.astro` (layout: `src/layouts/Layout.astro`), z „React island” `GoalsApp` (TSX) montowanym w treści strony.

## 3. Struktura komponentów
- `GoalsApp` (kontener)
  - `GoalsToolbar`
    - przełącznik „Pokaż archiwalne”
    - przycisk „Utwórz cel”
  - `GoalsList`
    - `GoalListItem` (w wierszu/kaflu: nazwa, typ, target, saldo, progres, status, akcje)
      - `GoalPriorityToggle` (akcja ustaw/usuń priorytet)
      - `GoalArchiveButton` (otwiera `GoalArchiveConfirm`)
  - `GoalCreateModal` (modal utworzenia celu)
  - `GoalArchiveConfirm` (modal potwierdzenia archiwizacji)
  - Stany pomocnicze: `EmptyState` (brak celów), `ErrorState`, `Skeleton` (ładowanie)

## 4. Szczegóły komponentów
### GoalsApp
- Opis: Główny kontener widoku. Zarządza stanem filtrowania (archiwalne), pobieraniem danych, mutacjami i modalami.
- Główne elementy:
  - Sekcja nagłówka (toolbar) z przełącznikiem archiwalnych i CTA „Utwórz cel”.
  - Lista celów lub puste/errorowe/szkieletowe stany.
- Obsługiwane interakcje:
  - Otwórz/zamknij `GoalCreateModal`.
  - Przełącz `include_archived` → refetch.
  - Po `create`, `update` (priority), `archive` → aktualizacja listy i UI (optimistic, z rollbackiem).
- Walidacja: Delegowana do formularza/modali i API; w kontenerze jedynie strażniki typu „zablokuj akcje dla zarchiwizowanych”.
- Typy: `GoalDTO`, `GoalTypeDTO`, `GoalListItemVM`, `GoalsFiltersState`, `CreateGoalPayload`, `UpdateGoalPayload`.
- Propsy: brak (komponent najwyższego rzędu).

### GoalsToolbar
- Opis: Pasek akcji nad listą celów.
- Główne elementy: tytuł, przełącznik „Pokaż archiwalne”, liczba celów, przycisk „Utwórz cel”.
- Zdarzenia: `onToggleArchived(include: boolean)`, `onCreateClick()`.
- Walidacja: brak (prosty stan boolean).
- Typy: `GoalsFiltersState` (fragment).
- Propsy: `{ includeArchived: boolean; onToggleArchived: (v: boolean) => void; onCreateClick: () => void; totalCount: number; }`.

### GoalsList
- Opis: Prezentuje listę celów z akcjami wiersza.
- Główne elementy: lista `GoalListItem`; fallback: `EmptyState`, `ErrorState`, `Skeleton`.
- Zdarzenia: bubble z akcji wierszy (`onPriorityToggle`, `onArchiveClick`).
- Walidacja: brak dodatkowej (delegacja do itemu/serwera).
- Typy: `GoalListItemVM[]`.
- Propsy: `{ items: GoalListItemVM[]; isLoading: boolean; error: string | null; onTogglePriority: (id: string, next: boolean) => void; onArchiveClick: (id: string) => void; }`.

### GoalListItem
- Opis: Pojedynczy cel: nazwa, `type_label`, wartości kwotowe, pasek postępu, statusy (badge: „Priorytet”, „Zarchiwizowany”), akcje.
- Główne elementy: `Card` + `Progress` z `@/components/ui`, `Badge`, przyciski `Button`/`Tooltip`.
- Zdarzenia: `onTogglePriority(id, next)`, `onArchiveClick(id)`.
- Walidacja/strażniki UI:
  - Jeśli `archived_at` ≠ null → ukryj `GoalPriorityToggle`, zablokuj archiwizację (już zarchiwizowany).
  - Jeśli `is_priority` = true → przycisk archiwizacji disabled + tooltip (API i tak zwróci 409).
- Typy: `GoalListItemVM`.
- Propsy: `{ item: GoalListItemVM; onTogglePriority: (id: string, next: boolean) => void; onArchiveClick: (id: string) => void; }`.

### GoalPriorityToggle
- Opis: Steruje priorytetem celu (set/unset). Po ustawieniu na jednym celu, backend atomowo usuwa priorytet z poprzedniego.
- Główne elementy: przełącznik/przycisk z `Tooltip`; stan „loading” w trakcie PATCH.
- Zdarzenia: `onChange(next: boolean)`.
- Walidacja/strażniki: disabled, gdy `archived_at` ≠ null.
- Typy: `UpdateGoalPayload` (z `is_priority`).
- Propsy: `{ checked: boolean; disabled?: boolean; onChange: (next: boolean) => void; isLoading?: boolean; }`.

### GoalArchiveButton / GoalArchiveConfirm
- Opis: Akcja archiwizacji + modal potwierdzenia z informacją, że historia pozostaje nienaruszona.
- Główne elementy: `Dialog` (shadcn), tekst: „Archiwizacja nie usuwa historii”.
- Zdarzenia: `onConfirm()`, `onCancel()`.
- Walidacja/strażniki: disabled, gdy `is_priority` = true (API zwróci 409; pokazujemy komunikat i sugestię usunięcia priorytetu).
- Typy: `ArchiveGoalResponseDTO`.
- Propsy (`GoalArchiveConfirm`): `{ open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => Promise<void>; isSubmitting: boolean; }`.

### GoalCreateModal
- Opis: Formularz utworzenia celu: `name`, `type_code` (z `/goal-types`), `target_amount`, opcjonalnie „Ustaw jako priorytet”.
- Główne elementy: `Dialog`, `Input`, `Select`, `Label`, walidacje inline, komunikaty błędów.
- Zdarzenia: `onSubmit(payload)`, `onClose()`.
- Walidacja (UI + zgodna z API):
  - `name`: 1–100 znaków.
  - `type_code`: wymagany, z listy zwróconej przez `/goal-types`.
  - `target_amount_cents`: > 0, liczba całkowita (z pola tekstowego parsujemy PL wejście do groszy).
  - `is_priority`: opcjonalne; konflikt 409 obsłużony komunikatem.
- Typy: `CreateGoalPayload`, `GoalTypeDTO`.
- Propsy: `{ open: boolean; onOpenChange: (v: boolean) => void; goalTypes: GoalTypeDTO[]; onSubmit: (p: CreateGoalPayload) => Promise<void>; isSubmitting: boolean; serverError: string | null; }`.

## 5. Typy
- DTO (zdefiniowane): `GoalDTO`, `GoalTypeDTO`, `GoalListResponseDTO`, `CreateGoalCommand`, `UpdateGoalCommand`, `ArchiveGoalResponseDTO`, `GoalTypeListResponseDTO`.
- Nowe ViewModel/stan:

```ts
export type GoalListItemVM = {
  id: string;
  name: string;
  type_code: string;
  type_label: string;
  target_amount_cents: number;
  target_amount_pln: string;
  current_balance_cents: number;
  current_balance_pln: string;
  progress_percentage: number;
  is_priority: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GoalsFiltersState = {
  include_archived: boolean;
};

export type CreateGoalPayload = {
  name: string;
  type_code: string;
  target_amount_cents: number;
  is_priority?: boolean;
};

export type UpdateGoalPayload = {
  name?: string;
  target_amount_cents?: number;
  is_priority?: boolean;
};
```

## 6. Zarządzanie stanem
- Hooki (analogicznie do modułu Transakcje):
  - `useGoalsFiltersState()`
    - Stan: `{ include_archived }` + synchronizacja z `localStorage` (klucz: `ff.goals.include_archived`).
    - API: `setIncludeArchived(boolean)`.
  - `useGoalsData(filters)`
    - Pobiera `/api/v1/goals?include_archived={bool}`.
    - Mapuje `GoalDTO` → `GoalListItemVM` (formatowanie kwot przez `formatCurrencyPL`).
    - Zwraca: `{ items, isLoading, error, refetch, count }`.
  - `useGoalTypesData()`
    - Pobiera `/api/v1/goal-types` (cache klienta w stanie hooka; prosty TTL lub rely on HTTP cache).
  - `useGoalMutations()`
    - `createGoal(payload): Promise<GoalDTO>` (POST `/goals`).
    - `updateGoal(id, payload): Promise<GoalDTO>` (PATCH `/goals/:id`) – do `is_priority` i ewentualnej edycji nazwy/targetu (na przyszłość).
    - `archiveGoal(id): Promise<ArchiveGoalResponseDTO>` (POST `/goals/:id/archive`).
- Optimistic updates:
  - Priority: optymistycznie ustaw `is_priority` na bieżącym wierszu i zdejmij z poprzedniego (lokalnie); przy błędzie rollback.
  - Archive: optymistycznie usuń z listy (gdy `include_archived=false`) lub ustaw `archived_at` lokalnie; rollback po błędzie.

## 7. Integracja API
- `GET /api/v1/goals?include_archived={bool}` → `GoalListResponseDTO` (`{ data: GoalDTO[] }`).
- `POST /api/v1/goals` (body: `CreateGoalCommand`) → `GoalDTO`.
  - 409: konflikt priorytetu; 422/400: walidacje.
- `PATCH /api/v1/goals/:id` (body: `UpdateGoalCommand`) → `GoalDTO`.
  - 404: brak celu; 422/400: walidacje (w tym „nie można aktualizować zarchiwizowanego”).
- `POST /api/v1/goals/:id/archive` → `ArchiveGoalResponseDTO`.
  - 404: brak celu; 409: „najpierw usuń priorytet”; 422: już zarchiwizowany.
- `GET /api/v1/goal-types` → `GoalTypeListResponseDTO` (`{ data: GoalTypeDTO[] }`).

## 8. Interakcje użytkownika
- „Utwórz cel”:
  - Otwiera modal → walidacje inline → `POST /goals`.
  - Sukces: zamknij modal, dodaj element do listy (na początku), pokaż potwierdzenie.
  - Błędy: komunikaty z API (PL), focus na pierwsze błędne pole.
- „Ustaw jako priorytet”:
  - Kliknięcie w wierszu → `PATCH /goals/:id { is_priority: true/false }`.
  - UI: loading/disabled na przycisku, optymistyczna aktualizacja, rollback po błędzie.
  - Efekt: tylko jeden wiersz z badge „Priorytet” (lokalnie i serwerowo).
- „Archiwizuj”:
  - Kliknięcie → modal potwierdzenia → `POST /goals/:id/archive`.
  - Sukces: usuń z listy (gdy aktywne) lub oznacz jako `archived_at` (gdy przeglądamy archiwalne).
  - Przy 409: pokaż komunikat i CTA „Usuń priorytet” (wywołaj PATCH `is_priority=false`, potem ponów archiwizację).
- „Pokaż archiwalne”:
  - Przełącznik → refetch listy z `include_archived=true`.

## 9. Warunki i walidacja
- Formularz utworzenia:
  - `name`: required (1–100); puste/za długie → błąd.
  - `type_code`: required, wartości z `/goal-types`; brak na liście → błąd.
  - `target_amount_cents`: required, int > 0; wejście z przecinkiem/kropką przeliczane do groszy (użyć istniejącego parsera PLN).
  - `is_priority`: opcjonalne; przy konflikcie 409 komunikat: „Tylko jeden cel może być priorytetowy”.
- Wiersz listy:
  - `archived_at` ≠ null → akcje disabled (priority/archiwizacja), tooltip o stanie.
- Archiwizacja:
  - Jeśli `is_priority=true` → pokaż komunikat o konieczności zdjęcia priorytetu (z opcją automatycznej akcji).

## 10. Obsługa błędów
- Kategorie błędów i reakcje UI:
  - 400/422 (walidacje): wyświetl pod polami/form alert; dla wierszy – toast/alert przy przycisku.
  - 404: komunikat „Nie znaleziono celu” (po aktualizacji/archiwizacji).
  - 409 (priorytet/archiwizacja): jasny komunikat + akcja naprawcza.
  - Sieć/5xx/timeout: banner w widoku listy + przycisk „Spróbuj ponownie”; w mutacjach – rollback optimistic i komunikat.
- Dostępność: alerty mają role/aria-live, focus na błąd.

## 11. Kroki implementacji
1) Routing
- Utwórz `src/pages/goals.astro` z layoutem `Layout.astro` i osadzeniem `GoalsApp` jako island.

2) Struktura katalogów widoku
- `src/components/goals/`:
  - `GoalsApp.tsx`, `GoalsToolbar.tsx`, `GoalsList.tsx`, `GoalListItem.tsx`,
  - `GoalPriorityToggle.tsx`, `GoalArchiveButton.tsx`, `GoalArchiveConfirm.tsx`, `GoalCreateModal.tsx`,
  - `EmptyState.tsx`, `ErrorState.tsx` (można zaadaptować istniejące wzorce z Transakcji/Dashboardu),
  - `types.ts`, `hooks/` (`useGoalsData.ts`, `useGoalTypesData.ts`, `useGoalsFiltersState.ts`, `useGoalMutations.ts`), `mappers.ts`.

3) Typy i mapowania
- Zdefiniuj `GoalListItemVM`, `GoalsFiltersState`, payloady mutacji.
- `mappers.ts`: `mapGoalDtoToVm(dto: GoalDTO) → GoalListItemVM` (z `formatCurrencyPL`).

4) Hooki danych
- `useGoalsFiltersState` (localStorage sync; klucz `ff.goals.include_archived`).
- `useGoalsData(filters)` (fetch, stany, refetch).
- `useGoalTypesData` (fetch `/goal-types`, proste cache).

5) Hooki mutacji
- `useGoalMutations`:
  - `createGoal` (obsługa 400/422/409; zwrot `GoalDTO`).
  - `updateGoal` (używane do `is_priority`).
  - `archiveGoal` (obsługa 404/409/422).

6) Komponenty UI
- `GoalsToolbar`: przełącznik archiwalne + CTA.
- `GoalsList` i `GoalListItem` z akcjami.
- `GoalCreateModal`: formularz (parsowanie PLN → grosze z istniejącym parserem z modułu Transakcji).
- `GoalArchiveConfirm`: modal z potwierdzeniem i opisem skutków.

7) Stany i interakcje
- Spójne „loading/disabled” dla akcji; optimistic update i rollback.
- Po sukcesie mutacji – aktualizacja listy (lokalnie) i/lub `refetch`.

8) Dostępność i UX
- Focus management w modalach (otwarcie na pierwszym polu, ESC zamyka).
- Tooltips dla zablokowanych akcji (priorytet/archiwum).

9) Testy ręczne (MVP)
- Utworzenie celu (z/prior.), konflikt priorytetu, archiwizacja (w tym przypadek 409), przełącznik archiwalnych.

10) Wydajność i przyszłość
- Lista bez wirtualizacji (typowo niska liczba celów); w razie potrzeb – prosta paginacja.
- Opcjonalnie: event `window.dispatchEvent(new CustomEvent("ff:priority-goal:changed"))` dla natychmiastowej aktualizacji innych widoków, jeśli kiedyś współdzielimy stan między wyspami.

—

Zgodność z PRD i story:
- US‑019: formularz tworzenia, walidacje, dodanie do listy, opcjonalny priorytet.
- US‑020: pojedynczy priorytet – wymuszony przez serwer, spójnie odzwierciedlony w UI (optimistic + rollback).
- US‑021: archiwizacja z potwierdzeniem; brak twardego usuwania; element znika z listy aktywnych.
- US‑040: przełącznik archiwalnych, bez wpływu na dashboard.
- US‑055/US‑059/US‑076: natychmiastowa zgodność priorytetu (po mutacji) i jasna informacja, że archiwizacja nie usuwa historii.


