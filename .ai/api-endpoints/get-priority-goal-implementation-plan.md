# API Endpoint Implementation Plan: GET /api/v1/metrics/priority-goal

## 1. Przegląd punktu końcowego

**Cel**: Pobranie celu priorytetowego użytkownika wraz z jego postępem i zmianą miesięczną (suma wpłat i wypłat w danym miesiącu).

**Funkcjonalność**:

- Zwraca szczegóły celu oznaczonego jako priorytetowy (`is_priority=true`)
- Oblicza procent realizacji celu (`progress_percentage`)
- Agreguje zdarzenia celu (DEPOSIT/WITHDRAW) dla podanego miesiąca
- Jeśli użytkownik nie ma celu priorytetowego, zwraca 404

**Przypadki użycia**:

- Dashboard: wyświetlenie głównego celu użytkownika z podsumowaniem miesięcznym
- Tracking: monitorowanie postępu najważniejszego celu finansowego

---

## 2. Szczegóły żądania

### Metoda HTTP

`GET`

### Struktura URL

```
/api/v1/metrics/priority-goal
```

### Query Parameters

#### Opcjonalne:

- **`month`** (string, format: YYYY-MM)
  - **Opis**: Miesiąc, dla którego obliczana jest zmiana miesięczna (suma DEPOSIT - WITHDRAW)
  - **Format**: YYYY-MM (np. "2025-01")
  - **Walidacja**:
    - Regex: `/^\d{4}-\d{2}$/`
    - Rok: 4 cyfry
    - Miesiąc: 01-12
  - **Domyślnie**: Bieżący miesiąc (obliczany jako `new Date().toISOString().slice(0, 7)`)
  - **Przykład**: `?month=2025-01`

### Request Headers

- **Authorization**: Bearer token z Supabase Auth (automatycznie obsługiwany przez middleware)

### Request Body

Brak (GET request)

---

## 3. Wykorzystywane typy

### DTO (Data Transfer Object)

Z `src/types.ts` (linie 278-289):

```typescript
export interface PriorityGoalMetricsDTO {
  goal_id: string; // UUID celu
  name: string; // Nazwa celu
  type_code: string; // Kod typu celu (np. "VACATION")
  type_label: string; // Etykieta typu w języku polskim (np. "Wakacje")
  target_amount_cents: number; // Docelowa kwota w groszach
  current_balance_cents: number; // Aktualne saldo w groszach
  progress_percentage: number; // Procent realizacji (0-100+)
  monthly_change_cents: number; // Zmiana w podanym miesiącu (DEPOSIT - WITHDRAW)
  month: string; // Miesiąc w formacie YYYY-MM
}
```

### Validation Schema

Nowy plik: `src/lib/schemas/priority-goal-metrics.schema.ts`

```typescript
import { z } from "zod";

/**
 * Validation schema for priority goal metrics query parameters
 */
export const PriorityGoalMetricsQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Invalid month format. Expected YYYY-MM")
    .optional(),
});

export type PriorityGoalMetricsQuery = z.infer<typeof PriorityGoalMetricsQuerySchema>;
```

---

## 4. Szczegóły odpowiedzi

### Success Response: `200 OK`

**Content-Type**: `application/json`

**Body**:

```json
{
  "goal_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Wakacje w Grecji",
  "type_code": "VACATION",
  "type_label": "Wakacje",
  "target_amount_cents": 500000,
  "current_balance_cents": 175000,
  "progress_percentage": 35.0,
  "monthly_change_cents": 50000,
  "month": "2025-01"
}
```

**Opis pól**:

- `progress_percentage`: Obliczane jako `(current_balance_cents / target_amount_cents) * 100`
- `monthly_change_cents`: Suma `DEPOSIT` minus suma `WITHDRAW` dla goal_events w podanym miesiącu
- `month`: Echo parametru zapytania (lub domyślny bieżący miesiąc)

### Error Responses

#### `400 Bad Request` - Nieprawidłowy format parametru

```json
{
  "error": "Bad Request",
  "message": "Invalid month format. Expected YYYY-MM",
  "details": {
    "month": "Invalid month format. Expected YYYY-MM"
  }
}
```

**Przykłady nieprawidłowych wartości**:

- `month=2025-13` (nieprawidłowy miesiąc)
- `month=2025/01` (niewłaściwy separator)
- `month=25-01` (niepełny rok)

#### `401 Unauthorized` - Brak lub nieprawidłowa autentykacja

```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

**Przyczyny**:

- Brak tokena Bearer w nagłówku Authorization
- Token wygasły
- Token nieprawidłowy

#### `404 Not Found` - Brak celu priorytetowego

```json
{
  "error": "Not Found",
  "message": "No priority goal set"
}
```

**Przyczyny**:

- Użytkownik nie ma żadnego celu z `is_priority=true`
- Wszystkie cele priorytetowe są zarchiwizowane (`archived_at IS NOT NULL`)
- Wszystkie cele priorytetowe są soft-deleted (`deleted_at IS NOT NULL`)

#### `500 Internal Server Error` - Błąd serwera/bazy danych

```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred"
}
```

**Przyczyny**:

- Błąd połączenia z bazą danych
- Timeout zapytania
- Błąd wewnętrzny Supabase

---

## 5. Przepływ danych

### Diagram przepływu

```
1. Client Request (GET /api/v1/metrics/priority-goal?month=2025-01)
   ↓
2. Astro API Route Handler (src/pages/api/v1/metrics/priority-goal/index.ts)
   ↓
3. Middleware (Supabase Auth) → context.locals.user, context.locals.supabase
   ↓
4. Validation Layer (Zod Schema)
   ├─ Parse query parameter: month
   ├─ Validate format: YYYY-MM
   └─ Set default: current month if not provided
   ↓
5. Service Layer (goal.service.ts → getPriorityGoalMetrics)
   ├─ Query 1: SELECT goal with is_priority=true
   │   ├─ JOIN goal_types for type_label
   │   ├─ WHERE user_id = auth.uid()
   │   ├─ WHERE is_priority = true
   │   ├─ WHERE archived_at IS NULL
   │   └─ WHERE deleted_at IS NULL
   │   ↓
   │   └─ Result: goal | null
   │
   ├─ If goal is null → return null
   │
   ├─ Query 2: SELECT SUM(amount_cents) from goal_events
   │   ├─ WHERE goal_id = goal.id
   │   ├─ WHERE user_id = auth.uid()
   │   ├─ WHERE month = ${month}-01 (converted to date)
   │   ├─ GROUP BY type
   │   └─ Calculate: SUM(DEPOSIT) - SUM(WITHDRAW)
   │   ↓
   │   └─ Result: monthly_change_cents
   │
   └─ Transform to PriorityGoalMetricsDTO
       ├─ Compute progress_percentage
       ├─ Extract type_label from JOIN
       └─ Format month as YYYY-MM
   ↓
6. Response Mapping
   ├─ If service returns null → 404 Not Found
   ├─ If service throws ValidationError → 422 Unprocessable Entity
   ├─ If service throws Error → 500 Internal Server Error
   └─ If success → 200 OK with PriorityGoalMetricsDTO
   ↓
7. Client receives JSON response
```

### Interakcje z bazą danych

#### Query 1: Pobranie priority goal

```sql
SELECT
  g.id,
  g.name,
  g.type_code,
  g.target_amount_cents,
  g.current_balance_cents,
  g.is_priority,
  gt.label_pl as type_label
FROM goals g
INNER JOIN goal_types gt ON g.type_code = gt.code
WHERE g.user_id = auth.uid()
  AND g.is_priority = true
  AND g.archived_at IS NULL
  AND g.deleted_at IS NULL
LIMIT 1;
```

**Wykorzystane indeksy**:

- `uniq_goals_priority(user_id) WHERE is_priority AND archived_at IS NULL`
- `idx_goals_active(user_id) WHERE deleted_at IS NULL AND archived_at IS NULL`

**RLS Policy**: Goals SELECT policy (wymaga email_confirmed=true)

#### Query 2: Obliczenie miesięcznej zmiany

```sql
SELECT
  type,
  SUM(amount_cents) as total
FROM goal_events
WHERE goal_id = $1
  AND user_id = auth.uid()
  AND month = $2  -- YYYY-MM-01 format
GROUP BY type;
```

**Wykorzystane indeksy**:

- `idx_ge_goal_month(goal_id, month)`

**RLS Policy**: Goal_events SELECT policy (wymaga email_confirmed=true)

**Post-processing w aplikacji**:

```typescript
const deposits = results.find((r) => r.type === "DEPOSIT")?.total || 0;
const withdrawals = results.find((r) => r.type === "WITHDRAW")?.total || 0;
const monthlyChangeCents = deposits - withdrawals;
```

---

## 6. Względy bezpieczeństwa

### Autentykacja

- **Mechanizm**: Supabase Auth z Bearer token
- **Middleware**: `src/middleware/index.ts` weryfikuje token i ustawia `context.locals.user`
- **Wymaganie**: Endpoint wymaga zalogowanego użytkownika
- **Obsługa braku auth**:
  ```typescript
  if (!context.locals.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        message: "Authentication required",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  ```

### Autoryzacja

- **Row Level Security (RLS)**: Wszystkie tabele mają włączone RLS
- **Polityki**:
  - `goals` SELECT: `USING (user_id = auth.uid() AND EXISTS(SELECT 1 FROM profiles WHERE user_id=auth.uid() AND email_confirmed))`
  - `goal_events` SELECT: Analogiczna polityka
- **Weryfikacja email**: RLS wymaga `profiles.email_confirmed=true`
- **Izolacja danych**: Użytkownik widzi tylko swoje cele i zdarzenia

### Walidacja danych wejściowych

#### Query parameter: `month`

- **Schema**: Zod z regexem `/^\d{4}-\d{2}$/`
- **Sanitization**: Nie jest potrzebna (parametr używany tylko w parametryzowanych zapytaniach)
- **Edge cases**:
  - Miesiąc > 12: Zod regex nie dopuści
  - Nieprawidłowy format: Zod zwróci błąd walidacji
  - Brak parametru: Użycie domyślnej wartości (current month)

#### Ochrona przed SQL Injection

- **Supabase Client**: Automatyczne parametryzowanie zapytań
- **Brak raw SQL**: Wszystkie zapytania przez query builder

#### Ochrona przed XSS

- **Nie dotyczy**: Endpoint zwraca tylko JSON (Content-Type: application/json)
- **Brak renderowania HTML**: Dane nie są renderowane po stronie serwera

### Rate Limiting

- **Implementacja**: Obecnie brak (opcjonalne do dodania w przyszłości)
- **Rekomendacja**: Ograniczenie do 60 requestów/minutę per użytkownik
- **Mechanizm**: Middleware z wykorzystaniem `rate_limits` table lub Redis

### Logging i Monitoring

- **Błędy**: Logowanie do `console.error` (widoczne w logach Supabase/hosting)
- **Audit**: Endpoint tylko czyta dane (brak zapisów do `audit_log`)
- **Metryki**: Monitorowanie czasu odpowiedzi i błędów 500

---

## 7. Obsługa błędów

### Hierarchia obsługi błędów

```typescript
try {
  // Validation
  const validatedQuery = PriorityGoalMetricsQuerySchema.safeParse(params);
  if (!validatedQuery.success) {
    // → 400 Bad Request
  }

  // Service call
  const result = await getPriorityGoalMetrics(supabase, userId, month);

  if (!result) {
    // → 404 Not Found
  }

  // → 200 OK
} catch (error) {
  if (error instanceof ValidationError) {
    // → 422 Unprocessable Entity (opcjonalnie, jeśli service rzuca ValidationError)
  } else {
    console.error("Unexpected error:", error);
    // → 500 Internal Server Error
  }
}
```

### Scenariusze błędów

| Kod | Sytuacja                     | Message                                  | Details            | Akcja użytkownika                    |
| --- | ---------------------------- | ---------------------------------------- | ------------------ | ------------------------------------ |
| 400 | Nieprawidłowy format `month` | "Invalid month format. Expected YYYY-MM" | `{ month: "..." }` | Poprawić format parametru            |
| 401 | Brak lub nieprawidłowy token | "Authentication required"                | -                  | Zalogować się ponownie               |
| 404 | Brak priority goal           | "No priority goal set"                   | -                  | Ustawić cel jako priorytetowy        |
| 500 | Błąd bazy danych             | "An unexpected error occurred"           | -                  | Spróbować ponownie / zgłosić problem |
| 500 | Timeout                      | "Request timeout"                        | -                  | Spróbować ponownie                   |
| 500 | Błąd Supabase                | "Database error occurred"                | -                  | Spróbować ponownie                   |

### Mapowanie błędów serwisu

```typescript
// Service może zwrócić:
// - PriorityGoalMetricsDTO (success)
// - null (brak priority goal)
// - throw Error (błąd bazy danych)

const result = await getPriorityGoalMetrics(supabase, userId, month);

if (result === null) {
  return new Response(
    JSON.stringify({
      error: "Not Found",
      message: "No priority goal set",
    }),
    { status: 404, headers: { "Content-Type": "application/json" } }
  );
}

return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
```

### Logging strategia

```typescript
// W service layer:
if (error) {
  console.error("Database error in getPriorityGoalMetrics:", {
    userId,
    month,
    error: error.message,
    code: error.code,
  });
  throw new Error(`Failed to fetch priority goal metrics: ${error.message}`);
}
```

---

## 8. Rozważania dotyczące wydajności

### Optymalizacje zapytań

#### 1. Wykorzystanie indeksów

- **`uniq_goals_priority(user_id)`**: WHERE is_priority=true AND archived_at IS NULL
  - Index scan zamiast sequential scan
  - Bardzo szybkie wyszukiwanie (max 1 rekord per user)
- **`idx_ge_goal_month(goal_id, month)`**: Agregacja goal_events
  - Covering index dla group by month
  - Eliminuje potrzebę sortowania

#### 2. Minimalizacja round-trips

- **Query 1 (goal)**: Single query z JOIN do goal_types
  - Zamiast 2 osobnych zapytań (goal + goal_type lookup)
- **Query 2 (events)**: Agregacja na bazie danych
  - Zamiast pobierania wszystkich rekordów i agregacji w aplikacji
- **Łącznie**: 2 round-trips do bazy (nie da się połączyć, bo events zależą od goal_id)

#### 3. Brak paginacji

- **Uzasadnienie**: Zawsze max 1 priority goal per user
- **Brak overhead**: Nie trzeba liczyć total_count ani obsługiwać cursor

#### 4. Projection (SELECT specific columns)

- **Goals**: Tylko potrzebne kolumny (nie SELECT \*)
- **Goal_events**: Tylko type i amount_cents (nie cały wiersz)

### Potencjalne wąskie gardła

#### 1. Agregacja goal_events dla aktywnych użytkowników

- **Problem**: Jeśli cel ma tysiące zdarzeń w miesiącu
- **Mitigacja**: Indeks `idx_ge_goal_month` optymalizuje agregację
- **Realność**: Mało prawdopodobne (max kilkadziesiąt zdarzeń/miesiąc per cel)

#### 2. JOIN z goal_types

- **Problem**: Potencjalnie slow JOIN jeśli goal_types jest duża tabela
- **Mitigacja**: goal_types to mały słownik (10-20 rekordów), JOIN bardzo szybki
- **Realność**: Nie stanowi problemu

#### 3. RLS overhead

- **Problem**: RLS policies dodają warunek do każdego zapytania
- **Mitigacja**: Indeks `idx_goals_active(user_id)` obejmuje warunki RLS
- **Realność**: Minimalny overhead (< 1ms)

### Caching strategia

#### Nie zalecane na MVP

- **Powód 1**: Dane real-time (użytkownicy oczekują aktualnych danych)
- **Powód 2**: Prostota implementacji (brak cache invalidation)
- **Powód 3**: Szybkość zapytań z indeksami (< 50ms)

#### Opcjonalne w przyszłości

- **Redis cache**: Klucz `priority_goal_metrics:{userId}:{month}`
- **TTL**: 5 minut
- **Invalidation**: Po dodaniu goal_event lub zmianie is_priority
- **Trade-off**: Dodatkowa złożoność vs marginalny wzrost wydajności

### Monitoring wydajności

```typescript
// Opcjonalne: Dodać timing w service
const startTime = Date.now();
const result = await getPriorityGoalMetrics(supabase, userId, month);
const duration = Date.now() - startTime;

if (duration > 1000) {
  console.warn(`Slow query: getPriorityGoalMetrics took ${duration}ms`, {
    userId,
    month,
  });
}
```

---

## 9. Etapy wdrożenia

### Krok 1: Utworzenie validation schema

**Plik**: `src/lib/schemas/priority-goal-metrics.schema.ts`

**Kod**:

```typescript
import { z } from "zod";

/**
 * Validation schema for priority goal metrics query parameters
 * Validates optional month parameter in YYYY-MM format
 */
export const PriorityGoalMetricsQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Invalid month format. Expected YYYY-MM")
    .optional(),
});

export type PriorityGoalMetricsQuery = z.infer<typeof PriorityGoalMetricsQuerySchema>;
```

**Testy walidacji**:

- ✅ `undefined` → pass (brak parametru)
- ✅ `"2025-01"` → pass
- ✅ `"2024-12"` → pass
- ❌ `"2025-13"` → fail (nieprawidłowy miesiąc)
- ❌ `"25-01"` → fail (niepełny rok)
- ❌ `"2025/01"` → fail (niewłaściwy separator)
- ❌ `"2025-1"` → fail (niepełny miesiąc)

---

### Krok 2: Rozszerzenie goal.service.ts

**Plik**: `src/lib/services/goal.service.ts`

**Dodać funkcję**:

```typescript
/**
 * Get priority goal metrics with monthly change calculation
 *
 * Business logic flow:
 * 1. Query goals table for is_priority=true goal
 * 2. JOIN with goal_types to get type_label
 * 3. Filter: archived_at IS NULL, deleted_at IS NULL
 * 4. If no priority goal found, return null
 * 5. Query goal_events for specified month
 * 6. Aggregate: SUM(DEPOSIT) - SUM(WITHDRAW)
 * 7. Compute progress_percentage
 * 8. Transform to PriorityGoalMetricsDTO
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param month - Month in YYYY-MM format for monthly change calculation
 * @returns Promise<PriorityGoalMetricsDTO | null> - Priority goal metrics or null if no priority goal set
 * @throws Error - Database error (will be caught as 500)
 */
export async function getPriorityGoalMetrics(
  supabase: SupabaseClient,
  userId: string,
  month: string
): Promise<PriorityGoalMetricsDTO | null> {
  // Step 1: Query priority goal with joined type_label
  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select(
      `
      id,
      name,
      type_code,
      target_amount_cents,
      current_balance_cents,
      is_priority,
      goal_types!inner(label_pl)
    `
    )
    .eq("user_id", userId)
    .eq("is_priority", true)
    .is("archived_at", null)
    .is("deleted_at", null)
    .maybeSingle();

  if (goalError) {
    console.error("Database error in getPriorityGoalMetrics (goal query):", {
      userId,
      month,
      error: goalError.message,
      code: goalError.code,
    });
    throw new Error(`Failed to fetch priority goal: ${goalError.message}`);
  }

  // Step 2: Return null if no priority goal exists
  if (!goal) {
    return null;
  }

  // Step 3: Extract type_label from joined data
  const goalTypes = goal.goal_types as { label_pl: string } | { label_pl: string }[];
  const typeLabel = Array.isArray(goalTypes) ? goalTypes[0].label_pl : goalTypes.label_pl;

  // Step 4: Compute progress_percentage
  const progressPercentage =
    goal.target_amount_cents > 0 ? (goal.current_balance_cents / goal.target_amount_cents) * 100 : 0;

  // Step 5: Query goal_events for monthly change calculation
  // Convert month from YYYY-MM to YYYY-MM-01 for database query (month column is date type)
  const monthDate = `${month}-01`;

  const { data: events, error: eventsError } = await supabase
    .from("goal_events")
    .select("type, amount_cents")
    .eq("goal_id", goal.id)
    .eq("user_id", userId)
    .eq("month", monthDate);

  if (eventsError) {
    console.error("Database error in getPriorityGoalMetrics (events query):", {
      userId,
      goalId: goal.id,
      month,
      error: eventsError.message,
      code: eventsError.code,
    });
    throw new Error(`Failed to fetch goal events: ${eventsError.message}`);
  }

  // Step 6: Calculate monthly change (DEPOSIT - WITHDRAW)
  let monthlyChangeCents = 0;
  if (events && events.length > 0) {
    monthlyChangeCents = events.reduce((sum, event) => {
      return sum + (event.type === "DEPOSIT" ? event.amount_cents : -event.amount_cents);
    }, 0);
  }

  // Step 7: Build and return PriorityGoalMetricsDTO
  const metricsDTO: PriorityGoalMetricsDTO = {
    goal_id: goal.id,
    name: goal.name,
    type_code: goal.type_code,
    type_label: typeLabel,
    target_amount_cents: goal.target_amount_cents,
    current_balance_cents: goal.current_balance_cents,
    progress_percentage: progressPercentage,
    monthly_change_cents: monthlyChangeCents,
    month: month,
  };

  return metricsDTO;
}
```

**Import PriorityGoalMetricsDTO**:

```typescript
// Dodać do istniejących importów w goal.service.ts
import type {
  CreateGoalCommand,
  GoalDTO,
  GoalDetailDTO,
  UpdateGoalCommand,
  ArchiveGoalResponseDTO,
  PriorityGoalMetricsDTO, // <-- NOWY
} from "@/types";
```

---

### Krok 3: Utworzenie API route

**Plik**: `src/pages/api/v1/metrics/priority-goal/index.ts`

**Kod**:

```typescript
import type { APIRoute } from "astro";
import { PriorityGoalMetricsQuerySchema } from "@/lib/schemas/priority-goal-metrics.schema";
import { getPriorityGoalMetrics } from "@/lib/services/goal.service";

/**
 * GET /api/v1/metrics/priority-goal
 *
 * Returns priority goal progress with monthly change calculation.
 *
 * Query Parameters:
 * - month (optional): Month in YYYY-MM format (default: current month)
 *
 * Success Response: 200 OK
 * {
 *   "goal_id": "uuid",
 *   "name": "Wakacje w Grecji",
 *   "type_code": "VACATION",
 *   "type_label": "Wakacje",
 *   "target_amount_cents": 500000,
 *   "current_balance_cents": 175000,
 *   "progress_percentage": 35.0,
 *   "monthly_change_cents": 50000,
 *   "month": "2025-01"
 * }
 *
 * Error Responses:
 * - 400 Bad Request: Invalid month format
 * - 401 Unauthorized: Authentication required
 * - 404 Not Found: No priority goal set
 * - 500 Internal Server Error: Database error
 */

export const GET: APIRoute = async (context) => {
  // Step 1: Check authentication
  if (!context.locals.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        message: "Authentication required",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const userId = context.locals.user.id;
  const supabase = context.locals.supabase;

  try {
    // Step 2: Extract and validate query parameters
    const url = new URL(context.request.url);
    const monthParam = url.searchParams.get("month");

    // Build query object for validation
    const queryParams = monthParam ? { month: monthParam } : {};

    const validatedQuery = PriorityGoalMetricsQuerySchema.safeParse(queryParams);

    if (!validatedQuery.success) {
      const errors = validatedQuery.error.flatten();
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "Invalid query parameters",
          details: errors.fieldErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Step 3: Determine month (use current if not provided)
    const month = validatedQuery.data.month || new Date().toISOString().slice(0, 7);

    // Step 4: Call service layer
    const result = await getPriorityGoalMetrics(supabase, userId, month);

    // Step 5: Handle not found case
    if (!result) {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "No priority goal set",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Step 6: Return success response
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Step 7: Handle unexpected errors
    console.error("Error in GET /api/v1/metrics/priority-goal:", error);

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "An unexpected error occurred",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const prerender = false;
```

---

### Krok 4: Testowanie endpointu

#### Test 1: Success case (priority goal istnieje)

```bash
curl -X GET "http://localhost:4321/api/v1/metrics/priority-goal?month=2025-01" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Oczekiwany wynik**: `200 OK` z PriorityGoalMetricsDTO

#### Test 2: Default month (brak parametru)

```bash
curl -X GET "http://localhost:4321/api/v1/metrics/priority-goal" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Oczekiwany wynik**: `200 OK` z `month` = bieżący miesiąc

#### Test 3: Invalid month format

```bash
curl -X GET "http://localhost:4321/api/v1/metrics/priority-goal?month=2025-13" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Oczekiwany wynik**: `400 Bad Request` z validation error

#### Test 4: No priority goal

```bash
# Najpierw unset is_priority na wszystkich celach
curl -X GET "http://localhost:4321/api/v1/metrics/priority-goal" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Oczekiwany wynik**: `404 Not Found` z message "No priority goal set"

#### Test 5: Unauthorized

```bash
curl -X GET "http://localhost:4321/api/v1/metrics/priority-goal" \
  -H "Content-Type: application/json"
```

**Oczekiwany wynik**: `401 Unauthorized`

---

### Krok 5: Weryfikacja integracji

#### Checklist:

- [ ] Schema validation działa poprawnie (Zod)
- [ ] Service layer zwraca poprawne dane (getPriorityGoalMetrics)
- [ ] API route obsługuje wszystkie kody błędów (400, 401, 404, 500)
- [ ] RLS policies są respektowane (tylko własne cele)
- [ ] Indeksy są wykorzystywane (sprawdzić EXPLAIN ANALYZE)
- [ ] Progress percentage jest poprawnie obliczane
- [ ] Monthly change jest poprawnie agregowane (DEPOSIT - WITHDRAW)
- [ ] Default month działa poprawnie (current month)
- [ ] Logging błędów działa (console.error)
- [ ] Type safety jest zachowane (TypeScript kompiluje się bez błędów)

---

### Krok 6: Opcjonalne usprawnienia (post-MVP)

#### 1. Cache z TTL

```typescript
// W getPriorityGoalMetrics
const cacheKey = `priority_goal_metrics:${userId}:${month}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

// ... fetch from DB ...

await redis.setex(cacheKey, 300, JSON.stringify(result)); // 5 min TTL
```

#### 2. Rate limiting

```typescript
// W API route
const rateLimitKey = `rate_limit:priority_goal:${userId}`;
const count = await redis.incr(rateLimitKey);
if (count === 1) await redis.expire(rateLimitKey, 60);
if (count > 60) {
  return new Response(
    JSON.stringify({
      error: "Too Many Requests",
      message: "Rate limit exceeded",
      retry_after_seconds: await redis.ttl(rateLimitKey),
    }),
    { status: 429, headers: { "Content-Type": "application/json" } }
  );
}
```

#### 3. Response caching headers

```typescript
return new Response(JSON.stringify(result), {
  status: 200,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "private, max-age=300", // 5 min browser cache
  },
});
```

---

## 10. Podsumowanie

### Co zostanie zaimplementowane:

1. ✅ Validation schema dla query parameters
2. ✅ Service function w goal.service.ts
3. ✅ API route handler
4. ✅ Obsługa błędów (400, 401, 404, 500)
5. ✅ RLS integration
6. ✅ Indeksy DB są wykorzystywane

### Zależności:

- Istniejąca tabela `goals` z kolumną `is_priority`
- Istniejąca tabela `goal_events` z kolumną `month` (generated)
- Istniejący middleware Supabase Auth
- Indeksy: `uniq_goals_priority`, `idx_ge_goal_month`

### Estimated effort:

- **Schema**: 10 minut
- **Service**: 30 minut
- **Route**: 20 minut
- **Testing**: 30 minut
- **Łącznie**: ~90 minut (1.5h)

### Kolejność implementacji:

1. Schema (niezależne)
2. Service (wymaga schema dla type-safety)
3. Route (wymaga schema + service)
4. Testing (wymaga wszystkiego powyżej)
