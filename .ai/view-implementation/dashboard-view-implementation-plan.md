## Plan implementacji widoku Dashboard

## 1. Przegląd
Widok Dashboard prezentuje szybki, spójny i dostępny przegląd kondycji finansowej użytkownika w wybranym miesiącu. Obejmuje cztery karty metryk (Dochód, Wydatki, Odłożone netto, Wolne środki z tooltipem wzoru), wykres „Wydatki wg kategorii”, progres celu priorytetowego (z miesięczną zmianą), puste stany oraz baner „korekty historyczne” po zmianach z backdate. Dane pochodzą wyłącznie z REST v1 i nie są ponownie przeliczane po stronie klienta (brak pochodnych obliczeń poza formatowaniem prezentacyjnym).

Klucz: spójność danych między widokami (US‑052, US‑073), natychmiastowa reakcja na zmianę miesiąca (US‑083), zgodność zakresu danych wykresu (tylko wydatki; US‑098), czytelność i dostępność (format PL, alt dla wykresu).

## 2. Routing widoku
- Ścieżka: `/dashboard`
- Plik strony: `src/pages/dashboard.astro`
- Widok renderowany jako wyspa React:
  - Kontener: `DashboardApp` w `src/components/dashboard/DashboardApp.tsx` z `client:load` (lub `client:only="react"` zgodnie z potrzebą hydracji).
  - Synchronizacja miesiąca z query param `?month=YYYY-MM` (deep linki, współdzielenie stanu z innymi widokami).

## 3. Struktura komponentów
- `src/pages/dashboard.astro`
  - `DashboardApp` (React)
    - `MonthPicker`
    - `BackdateBanner`
    - `MetricsCards`
      - `FreeCashFlowTooltip`
    - `ExpensesByCategoryChart`
    - `PriorityGoalProgress`
    - `EmptyState` (gdy brak danych w miesiącu)
    - `DashboardSkeleton` (ładowanie)
    - `ErrorState` (błędy sieci/serwera)

## 4. Szczegóły komponentów
### DashboardApp
- Opis: Orkiestrator widoku. Posiada stan miesiąca, pobiera dane z API równolegle, zarządza stanami (loading/error/empty), propaguje dane do dzieci, synchronizuje `?month` w URL i `localStorage`.
- Główne elementy:
  - Pasek sterowania miesiącem (`MonthPicker`)
  - Baner backdate (`BackdateBanner`)
  - Siatka kart (`MetricsCards`)
  - Wykres (`ExpensesByCategoryChart`)
  - Progres celu (`PriorityGoalProgress`)
  - Skeleton/Empty/Error
- Obsługiwane interakcje:
  - Zmiana miesiąca (przyciski +/- i wybór z listy; natychmiastowy refetch wszystkich sekcji).
  - Ręczny retry przy błędzie.
- Walidacja:
  - `month` w formacie `YYYY-MM`, nie może być w przyszłości (blokada w `MonthPicker` + sanity check po stronie stanu).
- Typy:
  - Wejścia/wyjścia API: `MonthlyMetricsDTO`, `ExpensesByCategoryResponseDTO`, `PriorityGoalMetricsDTO`.
  - ViewModel: `MetricsCardsVM`, `ExpenseCategoryChartItemVM[]`, `PriorityGoalProgressVM`.
- Propsy: brak (komponent korzeniowy wyspy).

### MonthPicker
- Opis: Kontrolka wyboru miesiąca (prev/next, dropdown), wymusza dopuszczalny zakres i synchronizuje z URL.
- Główne elementy: przyciski (Prev/Next), `Select`/`Popover` z listą miesięcy, label bieżącego miesiąca.
- Interakcje:
  - `onChange(month: DashboardMonth)`.
  - Blokada „Next” dla miesięcy > bieżący (US‑083, walidacja z API).
- Walidacja:
  - Format `YYYY-MM`, zakres: od minimalnego (opcjonalnie) do bieżącego.
- Typy: `DashboardMonth` (alias string `YYYY-MM`).
- Propsy:
  - `value: DashboardMonth`
  - `onChange: (m: DashboardMonth) => void`
  - `minMonth?: DashboardMonth`

### BackdateBanner
- Opis: Baner „korekty historyczne” prezentowany po wykryciu zmian poza bieżącym miesiącem (backdate). Dismissowalny, wygasa po czasie/sesji.
- Główne elementy: ikona/info, treść, przycisk zamknięcia.
- Interakcje:
  - Dismiss → zapis do `sessionStorage`/stanu, zdarzenie niweluje się do czasu kolejnej korekty.
- Walidacja:
  - Prezentacja wyłącznie gdy istnieje `backdateFlag` (np. `sessionStorage["ff.backdate"] === "1"` lub event globalny).
- Typy: `BackdateState = { visible: boolean; message: string }`.
- Propsy:
  - `visible: boolean`
  - `onClose: () => void`
  - `message?: string`

### MetricsCards
- Opis: 4 karty z wartościami miesiąca. Tooltip we wzorze „Wolne środki”.
- Główne elementy: 4 `Card` (shadcn/ui), etykiety i wartości w PLN, znacznik „Refreshed at” (gdy dostępny).
- Interakcje:
  - Hover tooltip nad „Wolne środki” (wykorzystuje `FreeCashFlowTooltip`).
- Walidacja:
  - Brak obliczeń po stronie FE; wyświetla wartości z `MonthlyMetricsDTO`.
- Typy: `MetricsCardsVM`, `MonthlyMetricsDTO`.
- Propsy:
  - `data: MetricsCardsVM`
  - `loading?: boolean`
  - `error?: string`

### FreeCashFlowTooltip
- Opis: Tooltip z pełnym wzorem (US‑065). Używa pola `free_cash_flow_formula` (dostarczone przez API).
- Główne elementy: ikona/informacja, tooltip content.
- Interakcje: hover/focus.
- Walidacja: brak (tylko prezentacja).
- Typy: `string`.
- Propsy:
  - `formula: string`

### ExpensesByCategoryChart
- Opis: Wykres słupkowy poziomy wydatków per kategoria (wyłącznie EXPENSE; US‑017, US‑098).
- Główne elementy: oś kategorii (etykiety PL), słupki z wartościami PLN (2 miejsca po przecinku), alt tekst (podsumowanie dla a11y).
- Interakcje: hover (tooltip wartości), focus obszaru wykresu (keyboard a11y), opcjonalne sortowanie (DESC po kwocie).
- Walidacja:
  - Dane tylko z endpointu `/metrics/expenses-by-category`.
  - Brak danych → neutralny stan (US‑017/US‑037/US‑061).
- Typy: `ExpenseCategoryChartItemVM[]`.
- Propsy:
  - `data: ExpenseCategoryChartItemVM[]`
  - `totalCents: number`
  - `loading?: boolean`
  - `error?: string`

### PriorityGoalProgress
- Opis: Pasek progresu celu priorytetowego z miesięczną zmianą (US‑018, US‑055, US‑064). Gdy brak celu priorytetowego → placeholder/CTA do ustawienia priorytetu.
- Główne elementy: nazwa celu, pasek postępu, wartości „aktualnie/target”, miesięczna zmiana w groszach (PLN, znak).
- Interakcje:
  - CTA „Ustaw cel priorytetowy” → np. nawigacja do `/goals`.
- Walidacja:
  - 404 z API → prezentacja placeholdera (nie błąd krytyczny).
- Typy: `PriorityGoalProgressVM | null`.
- Propsy:
  - `data: PriorityGoalProgressVM | null`
  - `loading?: boolean`
  - `error?: string`

### EmptyState
- Opis: Neutralny stan „Brak danych w tym miesiącu”.
- Główne elementy: ikona/informacja, krótki opis.
- Interakcje: link/CTA do dodania pierwszej transakcji (opcjonalnie).
- Propsy:
  - `visible: boolean`

### DashboardSkeleton
- Opis: Placeholdery ładowania dla kart/wykresu/paska progresu.
- Propsy:
  - `variant?: "all" | "cards" | "chart" | "goal"`

### ErrorState
- Opis: Prezentacja błędu (5xx/timeout/other) z akcją „Spróbuj ponownie”.
- Propsy:
  - `message: string`
  - `onRetry?: () => void`

## 5. Typy
Pola wejściowe/DTO (z BE, `src/types.ts`):
- `MonthlyMetricsDTO`: { month, income_cents, expenses_cents, net_saved_cents, free_cash_flow_cents, free_cash_flow_formula, refreshed_at }
- `ExpensesByCategoryResponseDTO`: { month, data: ExpenseByCategoryDTO[], total_expenses_cents }
- `PriorityGoalMetricsDTO`: { goal_id, name, type_code, type_label, target_amount_cents, current_balance_cents, progress_percentage, monthly_change_cents, month }
- `TransactionCategoryDTO`: (słownik, gdyby potrzebny do etykiet)

Nowe aliasy/ViewModel (FE):

```ts
type DashboardMonth = string; // "YYYY-MM"

type MetricsCardsVM = {
  month: DashboardMonth;
  incomeCents: number;
  expensesCents: number;
  netSavedCents: number;
  freeCashFlowCents: number;
  freeCashFlowFormula: string;
  refreshedAt: string | null;
  // Prezentacja
  incomePLN: string;
  expensesPLN: string;
  netSavedPLN: string;
  freeCashFlowPLN: string;
};

type ExpenseCategoryChartItemVM = {
  categoryCode: string;
  categoryLabel: string;
  totalCents: number;
  totalPLN: string;
  percentage: number; // 2 miejsca po przecinku (z BE)
  transactionCount: number;
};

type PriorityGoalProgressVM = {
  goalId: string;
  name: string;
  typeCode: string;
  typeLabel: string;
  targetCents: number;
  currentCents: number;
  progressPercentage: number;
  monthlyChangeCents: number;
  month: DashboardMonth;
  // Prezentacja
  targetPLN: string;
  currentPLN: string;
  monthlyChangePLN: string; // ze znakiem
};
```

## 6. Zarządzanie stanem
- Źródła prawdy:
  - Wyłącznie dane z REST v1 (brak dodatkowych agregacji na FE).
  - `DashboardMonth` trzymany w stanie aplikacji i w URL (`?month=`) oraz w `localStorage` (ostatnio użyty).
- Hooki:
  - `useMonthState()`:
    - API: `{ month, setMonth, goPrev, goNext, isNextDisabled }`
    - Inicjalizacja: z `URLSearchParams` lub `localStorage` (fallback: bieżący miesiąc).
    - Blokada miesięcy przyszłych.
  - `useDashboardData(month)`:
    - Równoległe pobieranie: `/metrics/monthly`, `/metrics/expenses-by-category`, `/metrics/priority-goal`.
    - Zwraca: `{ metrics, expenses, priorityGoal, loading, error, refetch }`.
    - Obsługa `AbortController` przy zmianie miesiąca; key-cache per `month`.
  - `useBackdateFlag()`:
    - Źródło: `sessionStorage["ff.backdate"]` lub nasłuch niestandardowego eventu `finflow:backdate-change`.
    - API: `{ visible, consume() }`.
- Przechowywanie:
  - `localStorage["ff.dashboard.month"] = "YYYY-MM"`.
  - `sessionStorage["ff.backdate"] = "1"` (ustawiane przez moduł edycji transakcji/goal_event poza dashboardem).

## 7. Integracja API
Wszystkie zapytania `GET`, `Content-Type: application/json`.

- `GET /api/v1/metrics/monthly?month=YYYY-MM`
  - 200: `MonthlyMetricsDTO`
  - 400: zły format miesiąca (wyświetl błąd przy `MonthPicker` i przywróć ostatni poprawny miesiąc)
  - Mapowanie → `MetricsCardsVM` (formatowanie PLN na FE, wzór z pola `free_cash_flow_formula` bez modyfikacji).

- `GET /api/v1/metrics/expenses-by-category?month=YYYY-MM`
  - 200: `ExpensesByCategoryResponseDTO` (pole `percentage` już policzone)
  - 400: zły format miesiąca
  - Mapowanie → `ExpenseCategoryChartItemVM[]` (formatowanie PLN na FE).

- `GET /api/v1/metrics/priority-goal?month=YYYY-MM`
  - 200: `PriorityGoalMetricsDTO`
  - 404: brak celu priorytetowego → placeholder zamiast błędu
  - Mapowanie → `PriorityGoalProgressVM` (formatowanie PLN, zaokrąglenia tylko prezentacyjne).

Uwagi:
- Nie nadpisujemy/wtórnie nie liczymy `free_cash_flow_*` ani `percentage` na FE.
- Przy zmianie miesiąca wykonujemy trzy żądania równolegle; częściowe niepowodzenia → degradacja łagodna (sekcje niezależne).

## 8. Interakcje użytkownika
- Zmiana miesiąca:
  - `MonthPicker` aktualizuje `month` w stanie i w URL; wszystkie sekcje refetch równolegle; przycisk „Następny” zablokowany dla przyszłych miesięcy (US‑083).
- Tooltip wolnych środków:
  - Hover nad ikoną/etykietą „Wolne środki” otwiera tooltip ze wzorem (US‑016, US‑065).
- Wykres:
  - Hover pokazuje wartość PLN i udział; alt tekst zawiera podsumowanie (US‑017, US‑037).
- Progres celu:
  - Gdy brak celu → placeholder z CTA do ustawienia priorytetu (np. link do `/goals`) (US‑018, US‑055).
- Baner backdate:
  - Po wykryciu flagi backdate (z innego flow) pokazujemy baner na dashboardzie (US‑024 w PRD – korekty historyczne).

Powiązanie z US:
- US‑016: `MetricsCards` + `FreeCashFlowTooltip` + `MonthPicker`.
- US‑017/US‑037/US‑098: `ExpensesByCategoryChart` (tylko EXPENSE; neutralny stan).
- US‑018/US‑055/US‑064: `PriorityGoalProgress` (miesięczna zmiana; placeholder przy braku).
- US‑061: `EmptyState` (brak danych miesiąca).
- US‑052/US‑073/US‑089/US‑090: spójność dzięki korzystaniu wyłącznie z REST v1 i braku obliczeń po stronie FE.
- US‑083: synchroniczna zmiana miesiąca (wszystkie sekcje refetch).

## 9. Warunki i walidacja
- `month`:
  - Format `YYYY-MM`, zakres ≤ bieżący miesiąc; walidacja UI + sanity check w stanie; błędy 400 → komunikat i rollback do ostatniego poprawnego.
- Karty metryk:
  - Prezentują wartości z `MonthlyMetricsDTO`; brak pochodnych obliczeń.
- Wykres:
  - Dane wyłącznie EXPENSE, dokładnie jak zwraca API; brak mieszania dochodów (US‑098).
  - Pusta odpowiedź → neutralny stan (komunikat).
- Progres celu:
  - 404 → placeholder; 200 → pasek i zmiana miesięczna; formaty PLN.
- Backdate:
  - Baner wyłącznie przy ustawionej fladze (np. `sessionStorage`), dismiss zapamiętywany do końca sesji.

## 10. Obsługa błędów
- 400 (zły miesiąc): pokaż błąd przy kontrolce miesiąca, cofnij `month` do poprzedniego poprawnego, nie aktualizuj sekcji.
- 404 (cel priorytetowy): nie traktować jako błąd krytyczny; wyświetlić placeholder.
- 5xx/timeout/sieć:
  - Sekcje niezależne pokazują `ErrorState` z przyciskiem „Spróbuj ponownie”.
  - Globalny komunikat (toast) opcjonalnie.
- Częściowe niepowodzenie:
  - Np. metryki 200, wykres 500 → karty działają, wykres pokazuje błąd; refetch na żądanie.
- Abort przy szybkiej zmianie miesiąca:
  - Anulowanie trwających żądań; zapobieganie migotaniu poprzez skeletony sekcyjne.

## 11. Kroki implementacji
1) Routing i kontener:
   - Utwórz `src/pages/dashboard.astro` i osadź `DashboardApp` (React island).
   - Ustal źródło miesiąca: `?month` → stan; fallback do `localStorage`/bieżącego.
2) Hooki stanu:
   - `useMonthState()` z blokadą przyszłych miesięcy i synchronizacją URL.
   - `useDashboardData(month)` z równoległymi wywołaniami i `AbortController`.
   - `useBackdateFlag()` (sesyjna flaga + dismiss).
3) Util formatowania:
   - `formatCurrencyPL(cents: number): string` z prezentacją PL (przecinek dziesiętny, kropka tysięcy lub spacja niełamliwa, zgodnie z PRD) i sufiksem „PLN” w UI. Uwaga: nie zmieniamy wartości liczbowych z BE.
4) Komponenty UI:
   - `MonthPicker` (prev/next/wybór), `BackdateBanner`, `MetricsCards` + `FreeCashFlowTooltip`, `ExpensesByCategoryChart`, `PriorityGoalProgress`, `EmptyState`, `DashboardSkeleton`, `ErrorState`.
   - W miarę możliwości użyj shadcn/ui (`Card`, `Tooltip`, `Progress`, `Skeleton`, `Button`). Jeśli brakujące – dodaj minimalne warianty w `src/components/ui`.
5) Integracja API:
   - Implementuj klienta fetch z timeoutem i nagłówkami; trzy wywołania równolegle przy starcie i przy każdej zmianie `month`.
   - Włącz obsługę `Cache-Control` z serwera (można stosować `no-store` przy ręcznym odświeżeniu).
6) Stany ładowania/puste/błędy:
   - Skeletony sekcyjne, neutralne komunikaty, niezależny retry na sekcję.
7) A11y i UX:
   - Alt tekst dla wykresu (podsumowanie wartości i udziałów).
   - Tooltip dostępny z klawiatury (focus), role/aria dla toastów/błędów.
8) Testy ręczne (AC z US):
   - Zmiana miesiąca → wszystkie sekcje aktualizują się synchronicznie (US‑083).
   - Spójność wartości z listami i wykresami (US‑052, US‑073, US‑089, US‑090).
   - Wykres tylko EXPENSE (US‑098); puste dane → neutralny stan (US‑017, US‑061).
   - Brak priorytetu → placeholder (US‑018, US‑055).
9) Telemetria/diagnoza (opcjonalnie):
   - Logi konsolowe wyłącznie w dev, bez PII.
10) Hardening:
   - Odporność na wolne łącze (timeout + retry), abort przy szybkiej nawigacji miesięcy.
   - Zabezpieczenie przed błędnymi parametrami `month` w URL (sanity check).

--- 

Uwagi implementacyjne:
- Dane nie mogą być przeliczane wtórnie na FE. Wszystkie sumy i wzory przyjmujemy z REST v1, a FE odpowiada wyłącznie za format wyświetlania i dostępność.
- Dla spójności między widokami, `DashboardMonth` i synchronizacja `?month` powinny być wspólne dla listy transakcji/goal events (to ułatwi zachowanie AC z US‑052/073/083).

