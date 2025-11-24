# API Endpoint Implementation Plan: GET /api/v1/metrics/monthly

## 1. Przegląd punktu końcowego

Endpoint służy do pobierania zagregowanych miesięcznych metryk finansowych użytkownika. Zwraca dane z tabeli `monthly_metrics`, która jest utrzymywana inkrementalnie przez triggery i nocny reconcile job. Metryki obejmują:

- Dochody (income_cents)
- Wydatki (expenses_cents)
- Kwotę odłożoną netto (net_saved_cents) - suma DEPOSIT minus WITHDRAW w miesiącu
- Wolne środki (free_cash_flow_cents) - dochód minus wydatki minus odłożone netto
- Formułę tekstową do wyświetlenia w UI

**Kluczowe cechy:**

- Endpoint read-only (GET)
- Wymaga parametru `month` w formacie YYYY-MM
- Jeśli dla danego miesiąca nie ma danych, zwraca strukturę z zerami
- Dane są pre-agregowane w tabeli monthly_metrics (szybki odczyt)

## 2. Szczegóły żądania

### Metoda HTTP

`GET`

### Struktura URL

```
/api/v1/metrics/monthly?month=YYYY-MM
```

### Parametry

**Query Parameters (wymagane):**

- `month` (string) - Miesiąc do pobrania w formacie `YYYY-MM`
  - Format: `YYYY-MM` gdzie YYYY to rok (4 cyfry), MM to miesiąc (01-12)
  - Przykłady: `2025-01`, `2024-12`
  - Walidacja: regex `/^\d{4}-(0[1-9]|1[0-2])$/`
  - Nie może być w przyszłości (opcjonalna walidacja)

**Query Parameters (opcjonalne):**

- Brak

**Request Body:**

- Brak (metoda GET)

**Headers:**

- `Authorization: Bearer <token>` (na przyszłość, obecnie używamy DEFAULT_USER_ID)

### Przykładowe żądanie

```http
GET /api/v1/metrics/monthly?month=2025-01 HTTP/1.1
Host: api.finflow.pl
Authorization: Bearer <token>
```

## 3. Wykorzystywane typy

### DTOs (z src/types.ts)

**MonthlyMetricsDTO** - Response DTO

```typescript
interface MonthlyMetricsDTO {
  month: string; // YYYY-MM format
  income_cents: number; // bigint from DB
  expenses_cents: number; // bigint from DB
  net_saved_cents: number; // bigint from DB
  free_cash_flow_cents: number; // bigint from DB
  free_cash_flow_formula: string; // Computed display string
  refreshed_at: string; // ISO 8601 timestamp
}
```

**ErrorResponseDTO** - Error response

```typescript
interface ErrorResponseDTO {
  error: string;
  message: string;
  details?: Record<string, string>;
  retry_after_seconds?: number;
}
```

### Command Models

Brak (endpoint GET nie przyjmuje Command)

### Schemas (nowy plik: src/lib/schemas/monthly-metrics.schema.ts)

**GetMonthlyMetricsQuerySchema** - Walidacja query params

```typescript
import { z } from "zod";

export const GetMonthlyMetricsQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
      message: "Month must be in YYYY-MM format (e.g., 2025-01)",
    })
    .refine(
      (val) => {
        // Opcjonalnie: sprawdź czy nie w przyszłości
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

export type GetMonthlyMetricsQuery = z.infer<typeof GetMonthlyMetricsQuerySchema>;
```

## 4. Szczegóły odpowiedzi

### Success Response: 200 OK

```json
{
  "month": "2025-01",
  "income_cents": 450000,
  "expenses_cents": 235000,
  "net_saved_cents": 50000,
  "free_cash_flow_cents": 165000,
  "free_cash_flow_formula": "Dochód (4,500.00 PLN) - Wydatki (2,350.00 PLN) - Odłożone netto (500.00 PLN) = 1,650.00 PLN",
  "refreshed_at": "2025-01-16T10:00:00Z"
}
```

**Content-Type:** `application/json`

**Struktura odpowiedzi:**

- Wszystkie wartości w groszach (cents)
- `free_cash_flow_cents` = `income_cents` - `expenses_cents` - `net_saved_cents`
- `free_cash_flow_formula` to sformatowany string do wyświetlenia
- `refreshed_at` wskazuje kiedy metryki były ostatnio przeliczone

**Przypadek specjalny - brak danych:**
Jeśli dla danego miesiąca nie ma rekordu w `monthly_metrics`, zwróć strukturę z zerami:

```json
{
  "month": "2025-01",
  "income_cents": 0,
  "expenses_cents": 0,
  "net_saved_cents": 0,
  "free_cash_flow_cents": 0,
  "free_cash_flow_formula": "Dochód (0.00 PLN) - Wydatki (0.00 PLN) - Odłożone netto (0.00 PLN) = 0.00 PLN",
  "refreshed_at": null
}
```

### Error Responses

#### 400 Bad Request - Invalid query parameter

```json
{
  "error": "Validation Error",
  "message": "Invalid query parameters",
  "details": {
    "month": "Month must be in YYYY-MM format (e.g., 2025-01)"
  }
}
```

**Przypadki:**

- Brak parametru `month`
- Nieprawidłowy format (np. `2025-1`, `25-01`, `2025/01`)
- Nieprawidłowy miesiąc (np. `2025-13`, `2025-00`)
- Miesiąc w przyszłości

#### 401 Unauthorized - Missing or invalid authentication

```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

**Uwaga:** Obecnie endpoint używa `DEFAULT_USER_ID`, więc ten błąd nie wystąpi do czasu implementacji pełnej autoryzacji.

#### 500 Internal Server Error - Unexpected server error

```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred. Please try again later."
}
```

## 5. Przepływ danych

### Architektura warstw

```
Client Request
    ↓
[API Route: /api/v1/metrics/monthly/index.ts]
    ↓ (1) Parse & validate query params
    ↓
[Zod Schema: GetMonthlyMetricsQuerySchema]
    ↓ (2) Call service layer
    ↓
[Service: monthly-metrics.service.ts]
    ↓ (3) Query database
    ↓
[Supabase Client → PostgreSQL]
    ↓ (4) RLS filters by user_id
    ↓
[Table: monthly_metrics]
    ↓ (5) Return raw data or null
    ↓
[Service Layer]
    ↓ (6) Transform to DTO + compute formula
    ↓
[API Route]
    ↓ (7) Return JSON response
    ↓
Client (200 OK with MonthlyMetricsDTO)
```

### Szczegółowy przepływ

#### Krok 1: Walidacja query params

- Parse `URLSearchParams` z request
- Waliduj za pomocą `GetMonthlyMetricsQuerySchema`
- Jeśli błąd → zwróć 400 z formatZodErrors()

#### Krok 2: Wywołanie service layer

```typescript
const metrics = await getMonthlyMetrics(userId, validatedQuery.month);
```

#### Krok 3: Query do bazy danych

Service `getMonthlyMetrics()` wykonuje:

```sql
SELECT
  month,
  income_cents,
  expenses_cents,
  net_saved_cents,
  free_cash_flow_cents,
  refreshed_at
FROM monthly_metrics
WHERE user_id = $1
  AND month = date_trunc('month', $2::date)
LIMIT 1
```

**Uwaga:** RLS policy automatycznie filtruje po `user_id = auth.uid()` i `email_confirmed = true`

#### Krok 4: Transformacja wyniku

- Jeśli brak rekordu → utwórz strukturę z zerami
- Jeśli rekord istnieje → oblicz `free_cash_flow_formula`
- Konwertuj bigint z DB na number w JS (bezpieczne do 2^53)

#### Krok 5: Generowanie formula string

Format:

```
"Dochód (X PLN) - Wydatki (Y PLN) - Odłożone netto (Z PLN) = W PLN"
```

Funkcja pomocnicza:

```typescript
function formatCentsToPLN(cents: number): string {
  return (cents / 100).toFixed(2);
}

function buildFreeFlowFormula(metrics: MonthlyMetricsEntity): string {
  return `Dochód (${formatCentsToPLN(metrics.income_cents)} PLN) - Wydatki (${formatCentsToPLN(metrics.expenses_cents)} PLN) - Odłożone netto (${formatCentsToPLN(metrics.net_saved_cents)} PLN) = ${formatCentsToPLN(metrics.free_cash_flow_cents)} PLN`;
}
```

#### Krok 6: Zwrócenie odpowiedzi

- Status: 200 OK
- Body: MonthlyMetricsDTO jako JSON
- Headers: `Content-Type: application/json`

### Interakcje z bazą danych

**Tabela:** `monthly_metrics`

**Schema (z db-plan.md):**

```sql
CREATE TABLE monthly_metrics (
  user_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  month date NOT NULL,
  income_cents bigint NOT NULL DEFAULT 0,
  expenses_cents bigint NOT NULL DEFAULT 0,
  net_saved_cents bigint NOT NULL DEFAULT 0,
  free_cash_flow_cents bigint NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month),
  CHECK (month = date_trunc('month', month))
);
```

**Indeksy:**

- PK: `monthly_metrics_pkey(user_id, month)` - bardzo szybkie wyszukiwanie
- Dodatkowy: `idx_mm_user_month(user_id, month)`

**RLS Policy:**

```sql
-- SELECT policy
CREATE POLICY select_own_metrics ON monthly_metrics
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
      AND p.email_confirmed = true
    )
  );
```

## 6. Względy bezpieczeństwa

### Autoryzacja i uwierzytelnianie

1. **RLS (Row Level Security)**
   - Włączone dla tabeli `monthly_metrics`
   - Policy automatycznie filtruje wyniki po `user_id = auth.uid()`
   - Wymóg: `profiles.email_confirmed = true`
   - Użytkownik widzi tylko swoje metryki

2. **Tymczasowa implementacja**
   - Obecnie: `DEFAULT_USER_ID` (test user)
   - W przyszłości: `context.locals.supabase.auth.getUser()`
   - Token w headerze `Authorization: Bearer <token>`

3. **Walidacja email_confirmed**
   - RLS policy egzekwuje `email_confirmed = true`
   - Niezweryfikowani użytkownicy nie otrzymają danych

### Walidacja danych wejściowych

1. **Strict validation z Zod**
   - Format `YYYY-MM` enforced przez regex
   - Miesiąc musi być 01-12
   - Opcjonalnie: blokada przyszłych miesięcy

2. **SQL Injection protection**
   - Supabase client używa prepared statements
   - Parametry są escapowane automatycznie
   - Brak raw SQL w service layer

3. **Parameter pollution**
   - Zod parsuje tylko zdefiniowane pola
   - Dodatkowe parametry są ignorowane

### Rate limiting

- **Obecnie:** Brak rate limiting dla read endpoints
- **Przyszłość:** Opcjonalnie rate limit per user (np. 100 req/min)
- **Uwaga:** `rate_limits` w DB jest tylko dla verify_email/reset_password

### XSS i Data sanitization

- **Output:** JSON, nie HTML - automatyczna ochrona przed XSS
- **Formula string:** Generowany server-side, nie zawiera user input
- **Brak sanityzacji:** Nie ma user-provided strings w tym endpointcie

### HTTPS i Transport Security

- **Wymóg:** HTTPS na produkcji (hosting config)
- **Headers:**
  - `Strict-Transport-Security`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`

## 7. Obsługa błędów

### Hierarchia błędów

```typescript
try {
  // (1) Walidacja query params
  const query = GetMonthlyMetricsQuerySchema.parse(params);
} catch (error) {
  if (error instanceof z.ZodError) {
    return new Response(
      JSON.stringify({
        error: "Validation Error",
        message: "Invalid query parameters",
        details: formatZodErrors(error),
      } satisfies ErrorResponseDTO),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}

try {
  // (2) Service layer call
  const metrics = await getMonthlyMetrics(userId, query.month);

  return new Response(JSON.stringify(metrics), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
} catch (error) {
  // (3) Database errors
  console.error("Error fetching monthly metrics:", error);

  return new Response(
    JSON.stringify({
      error: "Internal Server Error",
      message: "An unexpected error occurred. Please try again later.",
    } satisfies ErrorResponseDTO),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}
```

### Mapa kodów błędów

| Kod | Scenariusz                 | Message                           | Retry |
| --- | -------------------------- | --------------------------------- | ----- |
| 400 | Brak parametru `month`     | "Invalid query parameters"        | Nie   |
| 400 | Nieprawidłowy format month | "Month must be in YYYY-MM format" | Nie   |
| 400 | Miesiąc > 12 lub < 01      | "Month must be between 01 and 12" | Nie   |
| 400 | Przyszły miesiąc           | "Month cannot be in the future"   | Nie   |
| 401 | Brak tokenu auth           | "Authentication required"         | Nie   |
| 401 | Nieprawidłowy token        | "Invalid or expired token"        | Nie   |
| 500 | Błąd połączenia z DB       | "An unexpected error occurred"    | Tak   |
| 500 | Nieoczekiwany błąd         | "An unexpected error occurred"    | Tak   |

### Logging błędów

**Console log (development):**

```typescript
console.error("Error fetching monthly metrics:", {
  userId,
  month: query.month,
  error: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack : undefined,
});
```

**Production logging:**

- W przyszłości: Sentry, LogRocket, lub Supabase Edge Functions logs
- Strukturyzowane logi z kontekstem (userId, month, error type)

### Graceful degradation

**Brak danych dla miesiąca:**

```typescript
if (!metricsRow) {
  // Zwróć strukturę z zerami zamiast 404
  return {
    month: normalizedMonth,
    income_cents: 0,
    expenses_cents: 0,
    net_saved_cents: 0,
    free_cash_flow_cents: 0,
    free_cash_flow_formula: buildFreeFlowFormula({
      income_cents: 0,
      expenses_cents: 0,
      net_saved_cents: 0,
      free_cash_flow_cents: 0,
    }),
    refreshed_at: null,
  };
}
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje bazodanowe

1. **Pre-agregowane dane**
   - Tabela `monthly_metrics` jest utrzymywana przez triggery
   - Brak agregacji w czasie rzeczywistym (bardzo szybkie)
   - Single row lookup po PK: O(1) złożoność

2. **Indeksy**
   - Primary Key: `(user_id, month)` - optymalny dla tego query
   - Dodatkowy index: `idx_mm_user_month` (redundantny do PK, ale jasny intent)

3. **RLS overhead**
   - RLS policy sprawdza `profiles.email_confirmed`
   - Wymaga JOIN/subquery, ale to pojedyncze dodatkowe sprawdzenie
   - Koszt minimalny (< 1ms)

### Optymalizacje aplikacyjne

1. **Brak N+1 queries**
   - Pojedyncze zapytanie do DB
   - Brak relations do joinowania

2. **Minimalna transformacja**
   - Tylko obliczenie `free_cash_flow_formula` string
   - Konwersja bigint → number (natywna operacja)

3. **Response size**
   - Mały payload (< 500 bytes JSON)
   - Brak potrzeby kompresji dla pojedynczego rekordu

### Caching strategy

**Client-side caching:**

```http
Cache-Control: private, max-age=300, stale-while-revalidate=60
```

- `private` - cache tylko w przeglądarce użytkownika
- `max-age=300` - fresh przez 5 minut
- `stale-while-revalidate=60` - może zwrócić stare przez 1 min podczas revalidacji

**Server-side caching:**

- Nie potrzebne dla MVP (dane już pre-agregowane)
- W przyszłości: Redis cache z TTL 5 min

**Invalidation:**

- Cache invaliduje się automatycznie po 5 min
- Przy aktualizacji transakcji/goal-events trigger uaktualnia `monthly_metrics.refreshed_at`

### Monitoring wydajności

**Metryki do monitorowania:**

- Response time (target: p95 < 100ms)
- Database query time (target: < 10ms)
- Error rate (target: < 0.1%)
- Cache hit rate (jeśli implementujemy cache)

**Potential bottlenecks:**

1. RLS policy z subquery do `profiles` - rozważyć materialized view
2. Formatowanie formula string - cache rezultat w DB (kolumna generated)
3. Wiele równoczesnych requestów - connection pooling w Supabase

## 9. Etapy wdrożenia

### Faza 1: Przygotowanie infrastruktury

**1.1. Utworzenie schematu walidacji**

Plik: `src/lib/schemas/monthly-metrics.schema.ts`

```typescript
import { z } from "zod";

/**
 * Query parameters schema for GET /api/v1/metrics/monthly
 * Validates month parameter in YYYY-MM format
 */
export const GetMonthlyMetricsQuerySchema = z.object({
  month: z
    .string({ required_error: "Month parameter is required" })
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
      message: "Month must be in YYYY-MM format (e.g., 2025-01)",
    })
    .refine(
      (val) => {
        // Check if month is not in the future
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

export type GetMonthlyMetricsQuery = z.infer<typeof GetMonthlyMetricsQuerySchema>;
```

**1.2. Utworzenie service layer**

Plik: `src/lib/services/monthly-metrics.service.ts`

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { MonthlyMetricsDTO } from "@/types";

type Tables = Database["public"]["Tables"];
type MonthlyMetricsRow = Tables["monthly_metrics"]["Row"];

/**
 * Format cents to PLN string with 2 decimal places
 * Example: 123456 -> "1,234.56"
 */
function formatCentsToPLN(cents: number): string {
  const pln = (cents / 100).toFixed(2);
  // Add thousand separators
  return pln.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Build free cash flow formula string for display
 * Format: "Dochód (X PLN) - Wydatki (Y PLN) - Odłożone netto (Z PLN) = W PLN"
 */
function buildFreeFlowFormula(
  incomeCents: number,
  expensesCents: number,
  netSavedCents: number,
  freeFlowCents: number
): string {
  return `Dochód (${formatCentsToPLN(incomeCents)} PLN) - Wydatki (${formatCentsToPLN(expensesCents)} PLN) - Odłożone netto (${formatCentsToPLN(netSavedCents)} PLN) = ${formatCentsToPLN(freeFlowCents)} PLN`;
}

/**
 * Normalize month string to first day of month in YYYY-MM-DD format
 * Input: "2025-01"
 * Output: "2025-01-01"
 */
function normalizeMonth(month: string): string {
  return `${month}-01`;
}

/**
 * Get monthly financial metrics for a user
 * Returns metrics from monthly_metrics table or zeros if no data exists
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID to fetch metrics for
 * @param month - Month in YYYY-MM format
 * @returns Monthly metrics DTO with computed formula
 * @throws Error if database query fails
 */
export async function getMonthlyMetrics(
  supabase: SupabaseClient<Database>,
  userId: string,
  month: string
): Promise<MonthlyMetricsDTO> {
  const normalizedMonth = normalizeMonth(month);

  // Query monthly_metrics table
  // RLS will automatically filter by user_id and email_confirmed
  const { data, error } = await supabase
    .from("monthly_metrics")
    .select(
      `
      month,
      income_cents,
      expenses_cents,
      net_saved_cents,
      free_cash_flow_cents,
      refreshed_at
    `
    )
    .eq("user_id", userId)
    .eq("month", normalizedMonth)
    .maybeSingle();

  if (error) {
    console.error("Database error in getMonthlyMetrics:", error);
    throw new Error(`Failed to fetch monthly metrics: ${error.message}`);
  }

  // If no data exists for this month, return zeros
  if (!data) {
    return {
      month,
      income_cents: 0,
      expenses_cents: 0,
      net_saved_cents: 0,
      free_cash_flow_cents: 0,
      free_cash_flow_formula: buildFreeFlowFormula(0, 0, 0, 0),
      refreshed_at: null,
    };
  }

  // Transform database row to DTO
  // Convert bigint to number (safe for amounts up to 2^53)
  const incomeCents = Number(data.income_cents);
  const expensesCents = Number(data.expenses_cents);
  const netSavedCents = Number(data.net_saved_cents);
  const freeFlowCents = Number(data.free_cash_flow_cents);

  return {
    month,
    income_cents: incomeCents,
    expenses_cents: expensesCents,
    net_saved_cents: netSavedCents,
    free_cash_flow_cents: freeFlowCents,
    free_cash_flow_formula: buildFreeFlowFormula(incomeCents, expensesCents, netSavedCents, freeFlowCents),
    refreshed_at: data.refreshed_at,
  };
}
```

### Faza 2: Implementacja API endpoint

**2.1. Utworzenie struktury katalogów**

```bash
mkdir -p src/pages/api/v1/metrics
```

**2.2. Implementacja endpoint handler**

Plik: `src/pages/api/v1/metrics/monthly/index.ts`

```typescript
import type { APIContext } from "astro";
import { z } from "zod";

import { supabaseClient, DEFAULT_USER_ID } from "@/db/supabase.client";
import { GetMonthlyMetricsQuerySchema } from "@/lib/schemas/monthly-metrics.schema";
import { getMonthlyMetrics } from "@/lib/services/monthly-metrics.service";
import type { ErrorResponseDTO } from "@/types";

// Disable static rendering for API endpoint
export const prerender = false;

/**
 * Formats Zod validation errors into a flat object
 * Converts error.errors array into key-value pairs for API response
 *
 * @param error - ZodError instance from failed validation
 * @returns Record<string, string> - Flat object with field paths as keys
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
 * GET /api/v1/metrics/monthly
 *
 * Retrieves aggregated monthly financial metrics for the authenticated user.
 *
 * Query parameters:
 * - month (required): Month to retrieve in YYYY-MM format (e.g., "2025-01")
 *
 * Success response: 200 OK with MonthlyMetricsDTO
 * {
 *   month: "2025-01",
 *   income_cents: 450000,
 *   expenses_cents: 235000,
 *   net_saved_cents: 50000,
 *   free_cash_flow_cents: 165000,
 *   free_cash_flow_formula: "Dochód (4,500.00 PLN) - ...",
 *   refreshed_at: "2025-01-16T10:00:00Z"
 * }
 *
 * If no data exists for the specified month, returns zeros:
 * {
 *   month: "2025-01",
 *   income_cents: 0,
 *   expenses_cents: 0,
 *   net_saved_cents: 0,
 *   free_cash_flow_cents: 0,
 *   free_cash_flow_formula: "Dochód (0.00 PLN) - ...",
 *   refreshed_at: null
 * }
 *
 * Error responses:
 * - 400: Invalid query parameters (missing month, wrong format, future month)
 * - 401: Authentication required (currently disabled, using DEFAULT_USER_ID)
 * - 500: Unexpected server error
 *
 * @param context - Astro API context
 * @returns Response with metrics data or error
 */
export async function GET(context: APIContext): Promise<Response> {
  try {
    // Step 1: Extract and validate query parameters
    const url = new URL(context.request.url);
    const queryParams = {
      month: url.searchParams.get("month"),
    };

    // Validate with Zod schema
    let validatedQuery;
    try {
      validatedQuery = GetMonthlyMetricsQuerySchema.parse(queryParams);
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

    // Step 3: Fetch monthly metrics from service layer
    const metrics = await getMonthlyMetrics(supabaseClient, userId, validatedQuery.month);

    // Step 4: Return success response
    return new Response(JSON.stringify(metrics), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Cache for 5 minutes (metrics are pre-aggregated and rarely change)
        "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    // Step 5: Handle unexpected errors
    console.error("Error in GET /api/v1/metrics/monthly:", {
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

### Faza 3: Testowanie

**3.1. Unit testy (opcjonalne dla MVP)**

Testy dla:

- `formatCentsToPLN()` - konwersja centów na PLN
- `buildFreeFlowFormula()` - generowanie formuły
- `normalizeMonth()` - normalizacja miesiąca
- Walidacja Zod schema

**3.2. Integration testy**

Test scenarios:

1. **Happy path - dane istnieją**

```bash
curl "http://localhost:4321/api/v1/metrics/monthly?month=2025-01"
# Expected: 200 OK z metrykami
```

2. **Happy path - brak danych (zera)**

```bash
curl "http://localhost:4321/api/v1/metrics/monthly?month=2024-01"
# Expected: 200 OK z zerami
```

3. **Validation error - brak parametru**

```bash
curl "http://localhost:4321/api/v1/metrics/monthly"
# Expected: 400 Bad Request
```

4. **Validation error - zły format**

```bash
curl "http://localhost:4321/api/v1/metrics/monthly?month=2025-1"
# Expected: 400 Bad Request
```

5. **Validation error - nieprawidłowy miesiąc**

```bash
curl "http://localhost:4321/api/v1/metrics/monthly?month=2025-13"
# Expected: 400 Bad Request
```

6. **Validation error - przyszły miesiąc**

```bash
curl "http://localhost:4321/api/v1/metrics/monthly?month=2099-12"
# Expected: 400 Bad Request
```

**3.3. Manual testing checklist**

- [ ] Endpoint zwraca 200 dla poprawnego miesiąca z danymi
- [ ] Endpoint zwraca 200 z zerami dla miesiąca bez danych
- [ ] Endpoint zwraca 400 dla braku parametru month
- [ ] Endpoint zwraca 400 dla złego formatu month
- [ ] Endpoint zwraca 400 dla przyszłego miesiąca
- [ ] Formula string jest poprawnie sformatowana
- [ ] Wartości w centach są prawidłowo konwertowane
- [ ] Cache headers są ustawione
- [ ] RLS blokuje dostęp do cudzych danych (test z różnymi userId)
- [ ] Logi błędów są zapisywane dla 500 errors

### Faza 4: Dokumentacja i deployment

**4.1. Aktualizacja dokumentacji API**

- Dodaj przykłady requestów/responses do `.ai/api-plan.md`
- Zaktualizuj README z informacją o nowym endpoincie
- Dodaj JSDoc comments do wszystkich funkcji

**4.2. Code review checklist**

- [ ] Kod zgodny z zasadami w `.ai/shared.md`, `.ai/backend.md`, `.ai/astro.md`
- [ ] Wszystkie stringi używają double quotes (`"`)
- [ ] Wszystkie statements kończą się średnikami
- [ ] Error handling z early returns
- [ ] Proper typing (brak `any`)
- [ ] Zod schemas są stricte
- [ ] Service layer oddzielony od API layer
- [ ] Logi błędów zawierają kontekst
- [ ] Comments są w języku angielskim
- [ ] Response headers zawierają Cache-Control

**4.3. Pre-deployment checklist**

- [ ] Build passes: `npm run build`
- [ ] Linter passes: `npm run lint`
- [ ] Type check passes: `npm run type-check` (jeśli istnieje)
- [ ] Manual tests executed
- [ ] Smoke test na staging environment
- [ ] Monitoring dashboards skonfigurowane
- [ ] Error tracking (Sentry) skonfigurowane

**4.4. Deployment steps**

1. Merge PR do `master`
2. Trigger automatic deployment (jeśli skonfigurowane)
3. Verify endpoint w production:
   ```bash
   curl "https://api.finflow.pl/api/v1/metrics/monthly?month=2025-01"
   ```
4. Monitor error rates przez pierwsze 24h
5. Check performance metrics (response time < 100ms)

### Faza 5: Post-deployment monitoring

**5.1. Metryki do obserwacji**

- Response time (p50, p95, p99)
- Error rate (target < 0.1%)
- Cache hit rate (jeśli cache implementowany)
- Database query time
- Request volume per hour

**5.2. Alerts do skonfigurowania**

- Error rate > 1% w ciągu 5 min
- p95 response time > 500ms
- Database connection failures
- RLS policy failures (403 errors)

## 10. Notatki końcowe

### Założenia techniczne

1. **Dane pre-agregowane**: Tabela `monthly_metrics` jest utrzymywana przez triggery, więc nie ma potrzeby real-time agregacji. To gwarantuje szybkie odpowiedzi (< 10ms query time).

2. **RLS enforcement**: Row Level Security automatycznie filtruje wyniki po `user_id` i wymaga `email_confirmed = true`. Nie trzeba tego sprawdzać ręcznie w kodzie.

3. **Brak paginacji**: Endpoint zwraca pojedynczy miesiąc, nie listę, więc paginacja nie jest potrzebna.

4. **Graceful handling pustych danych**: Zwracamy strukturę z zerami zamiast 404, bo brak danych dla miesiąca to normalny stan (np. nowy użytkownik).

### Przyszłe usprawnienia

1. **Batch endpoint**: `GET /api/v1/metrics/monthly/range?from=2024-01&to=2024-12` - dla wykresów
2. **Server-side caching**: Redis z TTL 5 min dla często odpytywanych miesięcy
3. **Computed column**: `free_cash_flow_formula` jako generated column w DB (mniej compute w service)
4. **Compression**: Gzip dla większych payloads (jeśli batch endpoint)
5. **GraphQL**: Rozważyć GraphQL dla elastycznych queries (np. wybór pól)

### Zależności

- `monthly_metrics` tabela musi istnieć w DB (migration)
- Triggery muszą aktualizować `monthly_metrics` przy zmianach transakcji/goal_events
- RLS policies muszą być skonfigurowane
- `profiles.email_confirmed` musi być poprawnie zarządzane przez Auth flow

### Linki do dokumentacji

- [Supabase RLS](https://supabase.com/docs/guides/auth/row-level-security)
- [Zod validation](https://zod.dev/)
- [Astro API routes](https://docs.astro.build/en/core-concepts/endpoints/)
- [Cache-Control headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)
