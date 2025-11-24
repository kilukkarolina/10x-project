# API Endpoint Implementation Plan: GET /api/v1/metrics/expenses-by-category

## 1. Przegląd punktu końcowego

Endpoint zwraca rozbicie wydatków użytkownika według kategorii dla określonego miesiąca. Dla każdej kategorii, w której użytkownik miał wydatki, zwracany jest:
- kod i etykieta kategorii
- łączna kwota wydatków w groszach
- procentowy udział w całkowitych wydatkach miesiąca
- liczba transakcji w tej kategorii

Dane są agregowane na podstawie tabeli `transactions` z filtrami:
- `type = 'EXPENSE'`
- `month = <specified_month>` (wygenerowana kolumna)
- `deleted_at IS NULL` (tylko aktywne transakcje)
- `user_id = <current_user>` (przez RLS)

Endpoint jest częścią dashboardu i służy do wizualizacji wydatków (wykres słupków poziomych).

---

## 2. Szczegóły żądania

**Metoda HTTP:** `GET`

**Struktura URL:** `/api/v1/metrics/expenses-by-category`

**Parametry:**
- **Wymagane:**
  - `month` (query string) - Miesiąc do analizy w formacie YYYY-MM (np. "2025-01")

- **Opcjonalne:**
  - Brak

**Request Body:** Brak (metoda GET)

**Przykładowe zapytanie:**
```http
GET /api/v1/metrics/expenses-by-category?month=2025-01 HTTP/1.1
Host: api.finflow.app
```

**Nagłówki wymagane:**
- `Content-Type: application/json` (w odpowiedzi)
- Uwierzytelnienie: obecnie `DEFAULT_USER_ID`, docelowo `Authorization: Bearer <token>`

---

## 3. Wykorzystywane typy

### Istniejące typy (src/types.ts):

**ExpenseByCategoryDTO:**
```typescript
export interface ExpenseByCategoryDTO {
  category_code: string;
  category_label: string;
  total_cents: number;
  expense_percentage: number; // Percentage of total expenses
  transaction_count: number;
}
```

**ExpensesByCategoryResponseDTO:**
```typescript
export interface ExpensesByCategoryResponseDTO {
  month: string; // YYYY-MM format
  data: ExpenseByCategoryDTO[];
  total_expenses_cents: number;
}
```

**ErrorResponseDTO:**
```typescript
export interface ErrorResponseDTO {
  error: string;
  message: string;
  details?: Record<string, string>;
  retry_after_seconds?: number;
}
```

### Nowy schemat walidacji (do utworzenia):

**Lokalizacja:** `src/lib/schemas/expenses-by-category.schema.ts`

```typescript
import { z } from "zod";

export const GetExpensesByCategoryQuerySchema = z.object({
  month: z
    .string({ required_error: "Month parameter is required" })
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
      message: "Month must be in YYYY-MM format (e.g., 2025-01)",
    })
    .refine(
      (val) => {
        const [year, month] = val.split("-").map(Number);
        const inputDate = new Date(year, month - 1, 1);
        const now = new Date();
        const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return inputDate <= currentMonth;
      },
      {
        message: "Month cannot be in the future",
      }
    ),
});

export type GetExpensesByCategoryQuery = z.infer<typeof GetExpensesByCategoryQuerySchema>;
```

### **WAŻNA UWAGA - Niespójność w typach:**

W specyfikacji API (linie 546-578) pole nazywa się `percentage`, ale w `ExpenseByCategoryDTO` jest `expense_percentage`. 

**Rekomendacja:** 
- Używać nazwy z types.ts (`expense_percentage`)
- Lub zmienić interfejs, żeby pasował do specyfikacji
- **Dla spójności z API Plan należy zmapować w odpowiedzi: `expense_percentage` → `percentage`**

---

## 4. Szczegóły odpowiedzi

### Sukces: HTTP 200 OK

**Content-Type:** `application/json`

**Body:** `ExpensesByCategoryResponseDTO`

```json
{
  "month": "2025-01",
  "data": [
    {
      "category_code": "GROCERIES",
      "category_label": "Zakupy spożywcze",
      "total_cents": 85000,
      "percentage": 36.17,
      "transaction_count": 12
    },
    {
      "category_code": "TRANSPORT",
      "category_label": "Transport",
      "total_cents": 45000,
      "percentage": 19.15,
      "transaction_count": 8
    }
  ],
  "total_expenses_cents": 235000
}
```

**Nagłówki:**
- `Content-Type: application/json`
- `Cache-Control: private, max-age=300, stale-while-revalidate=60` (cache na 5 minut)

**Specjalne przypadki:**
- **Brak wydatków w miesiącu:**
  ```json
  {
    "month": "2025-01",
    "data": [],
    "total_expenses_cents": 0
  }
  ```

- **Wszystkie wydatki w jednej kategorii:**
  ```json
  {
    "month": "2025-01",
    "data": [
      {
        "category_code": "GROCERIES",
        "category_label": "Zakupy spożywcze",
        "total_cents": 100000,
        "percentage": 100.0,
        "transaction_count": 5
      }
    ],
    "total_expenses_cents": 100000
  }
  ```

### Błędy:

#### 400 Bad Request - Brak parametru month
```json
{
  "error": "Validation Error",
  "message": "Invalid query parameters",
  "details": {
    "month": "Month parameter is required"
  }
}
```

#### 400 Bad Request - Nieprawidłowy format miesiąca
```json
{
  "error": "Validation Error",
  "message": "Invalid query parameters",
  "details": {
    "month": "Month must be in YYYY-MM format (e.g., 2025-01)"
  }
}
```

#### 400 Bad Request - Miesiąc w przyszłości
```json
{
  "error": "Validation Error",
  "message": "Invalid query parameters",
  "details": {
    "month": "Month cannot be in the future"
  }
}
```

#### 401 Unauthorized (przyszłość, po implementacji auth)
```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred. Please try again later."
}
```

---

## 5. Przepływ danych

### Architektura warstw:
```
Client → API Endpoint → Service Layer → Supabase (PostgreSQL) → Response
```

### Szczegółowy przepływ:

1. **Request handling (API Endpoint)**
   - Przyjęcie żądania GET z query param `month`
   - Ekstrakcja parametru z URL

2. **Validation (Zod Schema)**
   - Walidacja formatu YYYY-MM
   - Sprawdzenie, czy miesiąc nie jest w przyszłości
   - Zwrócenie 400 w przypadku błędów walidacji

3. **Authentication (Middleware - obecnie tymczasowe)**
   - Pobranie `userId` (obecnie `DEFAULT_USER_ID`)
   - W przyszłości: `context.locals.supabase.auth.getUser()`

4. **Service Layer Call**
   - Wywołanie `getExpensesByCategory(supabase, userId, month)`

5. **Database Query (Service)**
   ```sql
   SELECT 
     t.category_code,
     tc.label_pl as category_label,
     SUM(t.amount_cents) as total_cents,
     COUNT(*) as transaction_count
   FROM transactions t
   INNER JOIN transaction_categories tc 
     ON t.category_code = tc.code
   WHERE 
     t.user_id = <userId>
     AND t.type = 'EXPENSE'
     AND t.month = <normalized_month>
     AND t.deleted_at IS NULL
   GROUP BY t.category_code, tc.label_pl
   ORDER BY total_cents DESC
   ```

6. **Data Transformation (Service)**
   - Obliczenie `total_expenses_cents` (suma wszystkich `total_cents`)
   - Obliczenie `percentage` dla każdej kategorii: `(total_cents / total_expenses_cents) * 100`
   - Zaokrąglenie procentów do 2 miejsc po przecinku
   - Konwersja bigint → number (jeśli potrzeba)

7. **Response Mapping**
   - Mapowanie `expense_percentage` → `percentage` (zgodnie ze specyfikacją API)
   - Zwrócenie `ExpensesByCategoryResponseDTO`

8. **Response Headers**
   - Ustawienie `Content-Type: application/json`
   - Ustawienie `Cache-Control` (5 minut)

9. **Error Handling**
   - Try-catch na poziomie endpointu
   - Logowanie błędów do console.error
   - Zwrócenie 500 w przypadku nieoczekiwanych błędów

### RLS (Row Level Security):
- Tabela `transactions` automatycznie filtruje rekordy przez `user_id = auth.uid()`
- Dodatkowa weryfikacja `email_confirmed = true` (przez politykę RLS)

---

## 6. Względy bezpieczeństwa

### 1. Uwierzytelnianie
**Obecnie:**
- Używany jest `DEFAULT_USER_ID` (tymczasowe rozwiązanie)

**Docelowo:**
- Sprawdzenie tokena JWT przez middleware Astro
- `context.locals.supabase.auth.getUser()` zwraca zalogowanego użytkownika
- Zwrócenie 401 jeśli użytkownik nie jest zalogowany

### 2. Autoryzacja (RLS)
- Row Level Security w Supabase automatycznie filtruje dane użytkownika
- Polityka na tabeli `transactions`:
  ```sql
  USING (
    user_id = auth.uid() 
    AND EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.email_confirmed = true
    )
  )
  ```
- Użytkownik widzi tylko swoje wydatki
- Wymóg potwierdzonego emaila

### 3. Walidacja danych wejściowych
- **Query param `month`:**
  - Regex walidacja formatu YYYY-MM
  - Sprawdzenie zakresu miesiąca (01-12)
  - Blokada przyszłych miesięcy
  - Zod schema zapobiega injection attacks

### 4. SQL Injection
- **Ochrona:** Supabase automatycznie parametryzuje zapytania
- `.eq("type", "EXPENSE")` jest bezpieczne
- Nie używać string interpolacji w zapytaniach SQL

### 5. Rate Limiting
- **Brak** specjalnych limitów dla endpointów READ-ONLY
- Dashboard endpoints mogą być cache'owane (5 min)
- Supabase Free Tier ma własne limity API

### 6. Wrażliwe dane
- **Brak wrażliwych danych w odpowiedzi:**
  - Kategorie (publiczny słownik)
  - Kwoty (należą do użytkownika, RLS zabezpiecza)
  - Liczba transakcji (nieszkodliwa metryka)

### 7. CORS
- Konfiguracja w Astro (jeśli frontend na innej domenie)
- Dla SPA w tym samym pochodzeniu: brak problemu

### 8. Headers bezpieczeństwa
- `Content-Type: application/json` zapobiega MIME sniffing
- `Cache-Control: private` - nie cache'ować na shared caches

### 9. Logowanie błędów
- Nie logować wrażliwych danych (tokeny, hasła)
- Logować: userId, month, error message
- Console.error dla development
- W produkcji: zewnętrzny service (Sentry, etc.)

---

## 7. Obsługa błędów

### Klasyfikacja błędów:

#### 1. Błędy walidacji (400 Bad Request)

**Scenariusz:** Brak parametru `month`
- **Przyczyna:** Client nie wysłał query param `month`
- **Kod:** 400
- **Response:**
  ```json
  {
    "error": "Validation Error",
    "message": "Invalid query parameters",
    "details": { "month": "Month parameter is required" }
  }
  ```

**Scenariusz:** Nieprawidłowy format miesiąca
- **Przyczyna:** Client wysłał `month=2025/01` lub `month=202501`
- **Kod:** 400
- **Response:**
  ```json
  {
    "error": "Validation Error",
    "message": "Invalid query parameters",
    "details": { "month": "Month must be in YYYY-MM format (e.g., 2025-01)" }
  }
  ```

**Scenariusz:** Nieprawidłowy zakres miesiąca
- **Przyczyna:** Client wysłał `month=2025-13` lub `month=2025-00`
- **Kod:** 400
- **Response:** (złapane przez regex)
  ```json
  {
    "error": "Validation Error",
    "message": "Invalid query parameters",
    "details": { "month": "Month must be in YYYY-MM format (e.g., 2025-01)" }
  }
  ```

**Scenariusz:** Miesiąc w przyszłości
- **Przyczyna:** Client wysłał `month=2026-12` (przyszłość)
- **Kod:** 400
- **Response:**
  ```json
  {
    "error": "Validation Error",
    "message": "Invalid query parameters",
    "details": { "month": "Month cannot be in the future" }
  }
  ```

#### 2. Błędy uwierzytelniania (401 Unauthorized)

**Scenariusz:** Brak tokena autoryzacyjnego (przyszłość)
- **Przyczyna:** Client nie wysłał tokena JWT w nagłówku
- **Kod:** 401
- **Response:**
  ```json
  {
    "error": "Unauthorized",
    "message": "Authentication required"
  }
  ```

**Scenariusz:** Nieważny token (przyszłość)
- **Przyczyna:** Token JWT wygasł lub jest nieprawidłowy
- **Kod:** 401
- **Response:**
  ```json
  {
    "error": "Unauthorized",
    "message": "Invalid or expired authentication token"
  }
  ```

#### 3. Błędy bazy danych (500 Internal Server Error)

**Scenariusz:** Błąd połączenia z bazą danych
- **Przyczyna:** Supabase jest niedostępny lub timeout
- **Kod:** 500
- **Logowanie:**
  ```typescript
  console.error("Database error in getExpensesByCategory:", {
    error: error.message,
    userId,
    month,
  });
  ```
- **Response:**
  ```json
  {
    "error": "Internal Server Error",
    "message": "An unexpected error occurred. Please try again later."
  }
  ```

**Scenariusz:** Błąd zapytania SQL
- **Przyczyna:** Błąd w konstrukcji query lub polityce RLS
- **Kod:** 500
- **Logowanie:** Jak wyżej
- **Response:** Jak wyżej

#### 4. Nieoczekiwane błędy (500 Internal Server Error)

**Scenariusz:** Błąd w logice transformacji danych
- **Przyczyna:** Nieoczekiwany typ danych z bazy (np. null w nieoczekiwanym miejscu)
- **Kod:** 500
- **Logowanie:**
  ```typescript
  console.error("Error in GET /api/v1/metrics/expenses-by-category:", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    userId,
    month,
  });
  ```
- **Response:**
  ```json
  {
    "error": "Internal Server Error",
    "message": "An unexpected error occurred. Please try again later."
  }
  ```

### Hierarchia obsługi błędów:

```typescript
try {
  // 1. Walidacja Zod (400)
  try {
    validatedQuery = GetExpensesByCategoryQuerySchema.parse(queryParams);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response 400 with details
    }
    throw error; // Re-throw unexpected errors
  }

  // 2. Auth check (401) - przyszłość
  // if (!userId) return Response 401

  // 3. Service call (może rzucić błąd 500)
  const expenses = await getExpensesByCategory(supabase, userId, month);

  // 4. Success response (200)
  return Response 200 with data

} catch (error) {
  // 5. Catch-all dla nieoczekiwanych błędów (500)
  console.error(...);
  return Response 500
}
```

### Strategia logowania:

**Development:**
- `console.error()` z pełnymi szczegółami błędu
- Stack trace dla debugging

**Production (przyszłość):**
- Zewnętrzny service (Sentry, LogRocket)
- Strukturalne logi (JSON)
- Monitorowanie metryk błędów

**Czego NIE logować:**
- Tokenów autoryzacyjnych
- Haseł
- Pełnych danych użytkownika (tylko userId)

---

## 8. Rozważania dotyczące wydajności

### 1. Optymalizacja zapytań SQL

**Wykorzystane indeksy (z db-plan.md):**

- `idx_tx_user_type_month(user_id, type, month) WHERE deleted_at IS NULL`
  - **Zastosowanie:** Filtrowanie transakcji wydatków dla danego miesiąca
  - **Efektywność:** Index-only scan możliwy dla części warunków

- `idx_tx_user_month(user_id, month) WHERE deleted_at IS NULL`
  - **Zastosowanie:** Backup index jeśli query optimizer wybierze inną ścieżkę

**Query plan (spodziewany):**
```
→ Aggregate (GROUP BY category_code)
  → Nested Loop Join (transactions ⋈ transaction_categories)
    → Index Scan on idx_tx_user_type_month
      Filter: user_id = ? AND type = 'EXPENSE' AND month = ? AND deleted_at IS NULL
    → Index Scan on transaction_categories_pkey
      Filter: code = category_code
```

**Złożoność:**
- **Czas:** O(n log n) gdzie n = liczba transakcji użytkownika w miesiącu
- **Pamięć:** O(k) gdzie k = liczba kategorii (maksymalnie 9 kategorii EXPENSE)

**Szacunkowe czasy (na Supabase Free Tier):**
- **10 transakcji/miesiąc:** ~5-10ms
- **100 transakcji/miesiąc:** ~10-20ms
- **1000 transakcji/miesiąc:** ~50-100ms

### 2. Caching

**HTTP Caching:**
```typescript
"Cache-Control": "private, max-age=300, stale-while-revalidate=60"
```

- **`private`:** Nie cache'ować na shared caches (CDN)
- **`max-age=300`:** Cache przez 5 minut na kliencie
- **`stale-while-revalidate=60`:** Pozwól na stale content przez dodatkową minutę podczas revalidacji

**Uzasadnienie:**
- Dane miesięczne zmieniają się rzadko (tylko gdy user dodaje/usuwa transakcje)
- Dashboard może tolerować 5-minutowe opóźnienie
- Zmniejsza obciążenie bazy danych

**Alternatywy (przyszłość):**
- Redis cache na poziomie service layer
- Invalidacja cache po utworzeniu/usunięciu transakcji
- Cache key: `expenses-by-category:${userId}:${month}`

### 3. Paginacja

**Nie wymagana** dla tego endpointu:
- Maksymalnie 9 kategorii wydatków (stały słownik)
- Response size: ~200-500 bytes (zależnie od liczby kategorii)
- Brak ryzyka timeoutu

### 4. Agregacja po stronie bazy

**Zalety:**
- Minimalizacja transferu danych (zwracamy sumy, nie poszczególne transakcje)
- Wykorzystanie mocy obliczeniowej PostgreSQL
- Mniejsze obciążenie memory na serwerze aplikacyjnym

**Query zwraca tylko:**
```
9 rows × (category_code + label + total_cents + count) ≈ 200-400 bytes
```

Zamiast:
```
100 transactions × (id + amount + category + date + ...) ≈ 10-20 KB
```

### 5. Connection pooling

**Supabase:**
- Automatyczny connection pooling (PgBouncer)
- Limit połączeń na Free Tier: 60 connections
- **Best practice:** Używać pojedynczego `supabaseClient` instance

### 6. Wąskie gardła i mitigacje

**Potencjalne problemy:**

| Problem | Prawdopodobieństwo | Mitygacja |
|---------|-------------------|-----------|
| Wolne zapytanie dla power users (>1000 tx/miesiąc) | Niskie | Indeksy częściowe z `deleted_at IS NULL` |
| Rate limit Supabase (60 req/s) | Średnie | HTTP caching (5 min), debouncing na FE |
| N+1 query problem | Brak | Single query z JOIN |
| Timeout na Supabase (2s limit) | Bardzo niskie | Agregacja ograniczona do 1 miesiąca |

### 7. Monitorowanie (przyszłość)

**Metryki do śledzenia:**
- Czas odpowiedzi endpointu (p50, p95, p99)
- Liczba 500 errors
- Cache hit rate
- Supabase query duration

**Alerty:**
- P95 > 500ms → sprawdzić query plan
- Error rate > 1% → sprawdzić logi

---

## 9. Etapy wdrożenia

### Krok 1: Utworzenie schematu walidacji Zod

**Plik:** `src/lib/schemas/expenses-by-category.schema.ts`

**Zadanie:**
- Skopiować schemat z `monthly-metrics.schema.ts` (identyczna walidacja `month`)
- Lub zaimportować i reużyć ten sam schemat (DRY principle)
- Dodać eksport typu TypeScript

**Kod:**
```typescript
import { z } from "zod";

export const GetExpensesByCategoryQuerySchema = z.object({
  month: z
    .string({ required_error: "Month parameter is required" })
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
      message: "Month must be in YYYY-MM format (e.g., 2025-01)",
    })
    .refine(
      (val) => {
        const [year, month] = val.split("-").map(Number);
        const inputDate = new Date(year, month - 1, 1);
        const now = new Date();
        const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return inputDate <= currentMonth;
      },
      {
        message: "Month cannot be in the future",
      }
    ),
});

export type GetExpensesByCategoryQuery = z.infer<
  typeof GetExpensesByCategoryQuerySchema
>;
```

**Weryfikacja:**
- Import schema w innym pliku - sprawdzić czy nie ma błędów TypeScript

---

### Krok 2: Utworzenie service layer

**Plik:** `src/lib/services/expenses-by-category.service.ts`

**Zadanie:**
1. Stworzyć funkcję `getExpensesByCategory()`
2. Zaimplementować normalizację miesiąca
3. Wykonać zapytanie do Supabase z JOIN
4. Obliczyć agregaty i procenty
5. Obsłużyć przypadek braku wydatków

**Kod (szkielet):**
```typescript
import type { SupabaseClient } from "@/db/supabase.client";
import type { ExpensesByCategoryResponseDTO, ExpenseByCategoryDTO } from "@/types";

/**
 * Normalize month string to first day of month in YYYY-MM-DD format
 */
function normalizeMonth(month: string): string {
  return `${month}-01`;
}

/**
 * Calculate percentage with 2 decimal places
 */
function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 10000) / 100; // Round to 2 decimals
}

/**
 * Get expenses breakdown by category for a specific month
 *
 * Business logic:
 * 1. Query transactions table filtered by EXPENSE type and month
 * 2. JOIN with transaction_categories for labels
 * 3. Group by category_code and aggregate SUM, COUNT
 * 4. Calculate total_expenses_cents
 * 5. Calculate percentage for each category
 * 6. Sort by total_cents DESC
 * 7. Return empty array if no expenses
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID to fetch expenses for
 * @param month - Month in YYYY-MM format
 * @returns Expenses by category response DTO
 * @throws Error if database query fails
 */
export async function getExpensesByCategory(
  supabase: SupabaseClient,
  userId: string,
  month: string
): Promise<ExpensesByCategoryResponseDTO> {
  const normalizedMonth = normalizeMonth(month);

  // Query with JOIN and aggregation
  const { data, error } = await supabase
    .from("transactions")
    .select(
      `
      category_code,
      amount_cents,
      transaction_categories!inner (
        label_pl
      )
    `
    )
    .eq("user_id", userId)
    .eq("type", "EXPENSE")
    .eq("month", normalizedMonth)
    .is("deleted_at", null);

  if (error) {
    console.error("Database error in getExpensesByCategory:", error);
    throw new Error(`Failed to fetch expenses by category: ${error.message}`);
  }

  // If no expenses, return empty response
  if (!data || data.length === 0) {
    return {
      month,
      data: [],
      total_expenses_cents: 0,
    };
  }

  // Manual aggregation (since Supabase doesn't support GROUP BY in JS client)
  const categoryMap = new Map<string, {
    category_code: string;
    category_label: string;
    total_cents: number;
    transaction_count: number;
  }>();

  for (const row of data) {
    const code = row.category_code;
    const label = row.transaction_categories.label_pl;
    const amount = row.amount_cents;

    if (categoryMap.has(code)) {
      const existing = categoryMap.get(code)!;
      existing.total_cents += amount;
      existing.transaction_count += 1;
    } else {
      categoryMap.set(code, {
        category_code: code,
        category_label: label,
        total_cents: amount,
        transaction_count: 1,
      });
    }
  }

  // Calculate total expenses
  let totalExpensesCents = 0;
  for (const cat of categoryMap.values()) {
    totalExpensesCents += cat.total_cents;
  }

  // Build result array with percentages
  const resultData: ExpenseByCategoryDTO[] = [];
  for (const cat of categoryMap.values()) {
    resultData.push({
      category_code: cat.category_code,
      category_label: cat.category_label,
      total_cents: cat.total_cents,
      expense_percentage: calculatePercentage(cat.total_cents, totalExpensesCents),
      transaction_count: cat.transaction_count,
    });
  }

  // Sort by total_cents DESC
  resultData.sort((a, b) => b.total_cents - a.total_cents);

  return {
    month,
    data: resultData,
    total_expenses_cents: totalExpensesCents,
  };
}
```

**Uwagi:**
- Supabase JS client nie wspiera `GROUP BY` bezpośrednio, więc agregacja odbywa się manualnie w kodzie
- Alternatywnie: użyć `.rpc()` z funkcją PostgreSQL zwracającą zagregowane dane
- RLS automatycznie filtruje po `user_id`

**Weryfikacja:**
- Unit test z mockowanym Supabase client
- Test przypadku: brak wydatków (pusta tablica)
- Test przypadku: jeden wydatek (100% w jednej kategorii)
- Test przypadku: wiele kategorii

---

### Krok 3: Utworzenie endpointu API

**Plik:** `src/pages/api/v1/metrics/expenses-by-category/index.ts`

**Struktura katalogów:**
```
src/pages/api/v1/metrics/
├── monthly/
│   └── index.ts
└── expenses-by-category/
    └── index.ts  ← nowy plik
```

**Zadanie:**
1. Zaimportować zależności (Zod, service, typy)
2. Stworzyć handler GET
3. Zaimplementować walidację query params
4. Wywołać service layer
5. Obsłużyć błędy
6. Zwrócić odpowiedź z odpowiednimi nagłówkami

**Kod (szkielet):**
```typescript
import type { APIContext } from "astro";
import { z } from "zod";

import { supabaseClient, DEFAULT_USER_ID } from "@/db/supabase.client";
import { GetExpensesByCategoryQuerySchema } from "@/lib/schemas/expenses-by-category.schema";
import { getExpensesByCategory } from "@/lib/services/expenses-by-category.service";
import type { ErrorResponseDTO } from "@/types";

export const prerender = false;

/**
 * Format Zod validation errors into flat object
 */
function formatZodErrors(error: z.ZodError): Record<string, string> {
  const formatted: Record<string, string> = {};
  error.errors.forEach((err) => {
    const path = err.path.join(".");
    formatted[path] = err.message;
  });
  return formatted;
}

/**
 * GET /api/v1/metrics/expenses-by-category
 *
 * Retrieves expenses breakdown by category for a specified month.
 *
 * Query parameters:
 * - month (required): Month in YYYY-MM format (e.g., "2025-01")
 *
 * Success response: 200 OK
 * {
 *   month: "2025-01",
 *   data: [
 *     {
 *       category_code: "GROCERIES",
 *       category_label: "Zakupy spożywcze",
 *       total_cents: 85000,
 *       percentage: 36.17,
 *       transaction_count: 12
 *     },
 *     ...
 *   ],
 *   total_expenses_cents: 235000
 * }
 *
 * If no expenses exist for the month, returns:
 * {
 *   month: "2025-01",
 *   data: [],
 *   total_expenses_cents: 0
 * }
 *
 * Error responses:
 * - 400: Invalid query parameters
 * - 401: Authentication required (future)
 * - 500: Unexpected server error
 */
export async function GET(context: APIContext): Promise<Response> {
  try {
    // Step 1: Extract and validate query parameters
    const url = new URL(context.request.url);
    const queryParams = {
      month: url.searchParams.get("month"),
    };

    let validatedQuery;
    try {
      validatedQuery = GetExpensesByCategoryQuerySchema.parse(queryParams);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorResponse: ErrorResponseDTO = {
          error: "Validation Error",
          message: "Invalid query parameters",
          details: formatZodErrors(error),
        };

        return new Response(JSON.stringify(errorResponse), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw error;
    }

    // Step 2: Get user ID
    // TODO: Replace with auth.getUser() when authentication is implemented
    const userId = DEFAULT_USER_ID;

    // Step 3: Fetch expenses by category from service layer
    const expenses = await getExpensesByCategory(
      supabaseClient,
      userId,
      validatedQuery.month
    );

    // Step 4: Map response to match API spec (expense_percentage → percentage)
    const response = {
      month: expenses.month,
      data: expenses.data.map((item) => ({
        category_code: item.category_code,
        category_label: item.category_label,
        total_cents: item.total_cents,
        percentage: item.expense_percentage, // Map to API spec name
        transaction_count: item.transaction_count,
      })),
      total_expenses_cents: expenses.total_expenses_cents,
    };

    // Step 5: Return success response
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Cache for 5 minutes (dashboard data, rarely changes)
        "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    // Step 6: Handle unexpected errors
    console.error("Error in GET /api/v1/metrics/expenses-by-category:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    const errorResponse: ErrorResponseDTO = {
      error: "Internal Server Error",
      message: "An unexpected error occurred. Please try again later.",
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

**Uwagi:**
- Mapowanie `expense_percentage` → `percentage` w odpowiedzi (zgodnie z API spec)
- Cache-Control identyczny jak w `/metrics/monthly`
- Struktura obsługi błędów identyczna jak w istniejących endpointach

**Weryfikacja:**
- Manualny test: `curl "http://localhost:4321/api/v1/metrics/expenses-by-category?month=2025-01"`
- Test błędów: brak param, zły format, przyszły miesiąc

---

### Krok 4: (Opcjonalnie) Rozważenie modyfikacji types.ts

**Problem:**
- API spec używa `percentage`
- `ExpenseByCategoryDTO` używa `expense_percentage`

**Opcje:**

**Opcja A: Zostawić types.ts bez zmian + mapowanie w endpoincie** (ZALECANE)
- ✅ Nie łamie istniejącego kodu
- ✅ Jasne mapowanie w jednym miejscu (endpoint)
- ❌ Niewielka duplikacja logiki

**Opcja B: Zmienić interfejs na `percentage`**
```typescript
export interface ExpenseByCategoryDTO {
  category_code: string;
  category_label: string;
  total_cents: number;
  percentage: number; // Changed from expense_percentage
  transaction_count: number;
}
```
- ✅ Zgodność z API spec
- ❌ Wymaga sprawdzenia, czy interface jest używany gdzie indziej

**Rekomendacja:** Opcja A (mapowanie w endpoincie)

---

### Krok 5: Testowanie manualne

**Narzędzia:**
- `curl` lub Postman/Insomnia
- Dev server: `npm run dev`

**Test Cases:**

**TC1: Prawidłowe zapytanie z wydatkami**
```bash
curl -X GET "http://localhost:4321/api/v1/metrics/expenses-by-category?month=2025-01"
```
**Oczekiwany result:** 200 OK z danymi

**TC2: Miesiąc bez wydatków**
```bash
curl -X GET "http://localhost:4321/api/v1/metrics/expenses-by-category?month=2020-01"
```
**Oczekiwany result:** 200 OK z pustą tablicą `data: []`

**TC3: Brak parametru month**
```bash
curl -X GET "http://localhost:4321/api/v1/metrics/expenses-by-category"
```
**Oczekiwany result:** 400 Bad Request

**TC4: Nieprawidłowy format miesiąca**
```bash
curl -X GET "http://localhost:4321/api/v1/metrics/expenses-by-category?month=2025/01"
```
**Oczekiwany result:** 400 Bad Request

**TC5: Miesiąc w przyszłości**
```bash
curl -X GET "http://localhost:4321/api/v1/metrics/expenses-by-category?month=2030-12"
```
**Oczekiwany result:** 400 Bad Request

**TC6: Wszystkie wydatki w jednej kategorii**
- Przygotować dane testowe z jedną kategorią
- Sprawdzić, czy `percentage: 100.0`

---

### Krok 6: Weryfikacja cache'owania

**Test:**
1. Wywołać endpoint pierwszy raz → sprawdzić header `Cache-Control`
2. Wywołać ponownie w ciągu 5 minut → sprawdzić, czy browser cache działa
3. Użyć DevTools Network tab → sprawdzić status (200 vs 304)

**Oczekiwany header:**
```
Cache-Control: private, max-age=300, stale-while-revalidate=60
```

---

### Krok 7: Code review i cleanup

**Checklist:**
- [ ] Kod używa podwójnych cudzysłowów (`"`) zamiast pojedynczych (`'`)
- [ ] Wszystkie instrukcje kończą się średnikami
- [ ] Nazwy zmiennych są opisowe (nie `x`, `y`, `temp`)
- [ ] Funkcje mają JSDoc komentarze
- [ ] Obsługa błędów przez try-catch
- [ ] Console.error dla wszystkich błędów
- [ ] Brak wrażliwych danych w logach
- [ ] Typy TypeScript są poprawne (brak `any`)
- [ ] Import paths używają `@/` alias

**Linter:**
```bash
npm run lint
```

**Poprawić wszystkie błędy ESLint/TypeScript**

---

### Krok 8: (Przyszłość) Integracja z autentykacją

**Gdy middleware auth będzie gotowe:**

1. **Zamienić `DEFAULT_USER_ID` na:**
   ```typescript
   const { data: { user }, error } = await context.locals.supabase.auth.getUser();
   
   if (error || !user) {
     const errorResponse: ErrorResponseDTO = {
       error: "Unauthorized",
       message: "Authentication required",
     };
     
     return new Response(JSON.stringify(errorResponse), {
       status: 401,
       headers: { "Content-Type": "application/json" },
     });
   }
   
   const userId = user.id;
   ```

2. **Dodać test case:** Request bez tokena → 401

---

### Krok 9: Dokumentacja

**Zadania:**

1. **Dodać endpoint do API Plan** (jeśli nie ma)
   - Plik: `.ai/api-plan.md`
   - Sekcja: "2.7 Monthly Metrics (Dashboard)"

2. **Aktualizować README.md** (jeśli potrzeba)
   - Dodać informację o nowym endpoincie
   - Przykłady użycia

3. **Stworzyć przykłady dla frontend developers**
   - Przykładowe zapytania
   - Przykładowe odpowiedzi
   - Error handling patterns

---

### Krok 10: Deployment checklist

**Przed wdrożeniem na produkcję:**

- [ ] Wszystkie testy manualne przeszły pomyślnie
- [ ] Linter nie zgłasza błędów
- [ ] TypeScript kompiluje się bez błędów (`npm run build`)
- [ ] Cache headers są prawidłowe
- [ ] Error handling jest kompletny
- [ ] Logowanie nie zawiera wrażliwych danych
- [ ] RLS policies w Supabase są aktywne
- [ ] Indeksy w bazie danych są utworzone (`idx_tx_user_type_month`)
- [ ] Middleware auth jest gotowe (lub świadome użycie DEFAULT_USER_ID)

**Deployment:**
```bash
npm run build
# Deploy według instrukcji hostingu (DigitalOcean / Cloudflare Pages)
```

**Po deployment:**
- [ ] Smoke test na produkcji
- [ ] Sprawdzić logi serwera (brak błędów)
- [ ] Monitoring: response time, error rate

---

## 10. Dodatkowe uwagi

### 1. Optymalizacja przez RPC function (alternatywa)

Jeśli performance jest problemem (mało prawdopodobne), można stworzyć funkcję PostgreSQL:

```sql
CREATE OR REPLACE FUNCTION get_expenses_by_category(
  p_user_id uuid,
  p_month date
)
RETURNS TABLE (
  category_code text,
  category_label text,
  total_cents bigint,
  transaction_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.category_code,
    tc.label_pl,
    SUM(t.amount_cents)::bigint,
    COUNT(*)::bigint
  FROM transactions t
  INNER JOIN transaction_categories tc ON t.category_code = tc.code
  WHERE 
    t.user_id = p_user_id
    AND t.type = 'EXPENSE'
    AND t.month = p_month
    AND t.deleted_at IS NULL
  GROUP BY t.category_code, tc.label_pl
  ORDER BY SUM(t.amount_cents) DESC;
END;
$$;
```

**Wywołanie:**
```typescript
const { data, error } = await supabase.rpc("get_expenses_by_category", {
  p_user_id: userId,
  p_month: normalizedMonth,
});
```

**Zalety:**
- Agregacja w bazie (szybsza)
- Mniej transferu danych

**Wady:**
- Dodatkowa migracja SQL
- Trudniejszy debugging

### 2. Frontendowe integracje

**React component (przykład):**
```typescript
const { data, error, isLoading } = useQuery({
  queryKey: ["expenses-by-category", month],
  queryFn: async () => {
    const response = await fetch(
      `/api/v1/metrics/expenses-by-category?month=${month}`
    );
    if (!response.ok) throw new Error("Failed to fetch expenses");
    return response.json();
  },
  staleTime: 5 * 60 * 1000, // 5 minutes (match Cache-Control)
});
```

**Wizualizacja (Chart.js / Recharts):**
```typescript
<BarChart data={data?.data ?? []}>
  <XAxis dataKey="category_label" />
  <YAxis />
  <Bar dataKey="total_cents" fill="#8884d8" />
  <Tooltip formatter={(value) => `${value / 100} PLN`} />
</BarChart>
```

### 3. Przyszłe rozszerzenia

**Możliwe dodatkowe features:**
- Filtr po zakresie dat (multi-month)
- Porównanie rok-do-roku
- Export do CSV/PDF
- Trend analysis (wzrost/spadek kategorii)

---

## Podsumowanie

Ten plan wdrożenia obejmuje wszystkie aspekty implementacji endpointu `GET /api/v1/metrics/expenses-by-category`:

✅ **Walidacja** - Zod schema dla query params  
✅ **Service layer** - Oddzielona logika biznesowa  
✅ **Bezpieczeństwo** - RLS, walidacja, error handling  
✅ **Wydajność** - Indeksy, cache, agregacja w bazie  
✅ **Spójność** - Zgodność z istniejącym kodem i stylami  
✅ **Testowalność** - Jasne test cases i weryfikacja  

Implementacja powinna zająć **2-4 godziny** dla doświadczonego developera, uwzględniając testy i dokumentację.

