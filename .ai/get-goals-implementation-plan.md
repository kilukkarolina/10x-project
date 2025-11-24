# API Endpoint Implementation Plan: GET /api/v1/goals

## 1. Przegląd punktu końcowego

**Cel**: Pobranie listy celów oszczędnościowych użytkownika z możliwością włączenia celów zarchiwizowanych.

**Funkcjonalność**:

- Zwraca listę wszystkich aktywnych celów użytkownika (domyślnie)
- Opcjonalnie może zawierać cele zarchiwizowane (gdy `include_archived=true`)
- Każdy cel zawiera informacje o typie (join z `goal_types`), progresie realizacji oraz statusie priorytetowym
- Soft-deleted cele (`deleted_at IS NOT NULL`) są automatycznie ukrywane przez logikę aplikacji
- RLS (Row Level Security) zapewnia, że użytkownik widzi tylko swoje cele

**Kontekst biznesowy**:

- Endpoint używany głównie w widoku "Moje cele" w aplikacji
- Użytkownicy zazwyczaj mają niewielką liczbę celów (5-20), więc paginacja nie jest wymagana
- Cele priorytetowe powinny być wyróżnione w UI (flagą `is_priority`)

---

## 2. Szczegóły żądania

### Metoda HTTP

`GET`

### Struktura URL

```
/api/v1/goals
```

### Parametry

#### Query Parameters

| Parametr           | Typ     | Wymagany | Domyślna wartość | Opis                                                                |
| ------------------ | ------- | -------- | ---------------- | ------------------------------------------------------------------- |
| `include_archived` | boolean | Nie      | `false`          | Określa czy zwracać cele zarchiwizowane (`archived_at IS NOT NULL`) |

**Uwagi dotyczące parametrów**:

- Query parametry są przekazywane jako stringi ("true"/"false"), wymagana konwersja do boolean
- Akceptowalne wartości: `"true"`, `"false"`, `"1"`, `"0"`, `true`, `false`
- Nieprawidłowe wartości powinny skutkować błędem 400

#### Headers

```http
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Uwaga**: Autoryzacja jest obecnie wyłączona w MVP (używany jest `DEFAULT_USER_ID`). Będzie włączona w przyszłej iteracji.

#### Request Body

Brak (metoda GET nie przyjmuje body).

---

## 3. Wykorzystywane typy

### DTOs (już zdefiniowane w `src/types.ts`)

```typescript
// GoalDTO - pojedynczy cel w odpowiedzi
export interface GoalDTO
  extends Pick<
    GoalEntity,
    | "id"
    | "name"
    | "type_code"
    | "target_amount_cents"
    | "current_balance_cents"
    | "is_priority"
    | "archived_at"
    | "created_at"
    | "updated_at"
  > {
  type_label: string; // Joined from goal_types.label_pl
  progress_percentage: number; // Computed: (current_balance / target_amount) * 100
}

// GoalListResponseDTO - struktura odpowiedzi
export interface GoalListResponseDTO {
  data: GoalDTO[];
}
```

### Query Schema (do utworzenia w `src/lib/schemas/goal.schema.ts`)

```typescript
export const ListGoalsQuerySchema = z.object({
  include_archived: z
    .union([z.boolean(), z.string().transform((val) => val === "true" || val === "1")])
    .optional()
    .default(false),
});

export type ListGoalsQuery = z.infer<typeof ListGoalsQuerySchema>;
```

---

## 4. Szczegóły odpowiedzi

### Sukces: 200 OK

**Headers**:

```http
Content-Type: application/json
```

**Body**:

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Wakacje w Grecji",
      "type_code": "VACATION",
      "type_label": "Wakacje",
      "target_amount_cents": 500000,
      "current_balance_cents": 125000,
      "progress_percentage": 25.0,
      "is_priority": true,
      "archived_at": null,
      "created_at": "2025-01-01T10:00:00Z",
      "updated_at": "2025-01-15T18:30:00Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "Nowy samochód",
      "type_code": "AUTO",
      "type_label": "Samochód",
      "target_amount_cents": 5000000,
      "current_balance_cents": 850000,
      "progress_percentage": 17.0,
      "is_priority": false,
      "archived_at": null,
      "created_at": "2025-01-10T14:20:00Z",
      "updated_at": "2025-01-10T14:20:00Z"
    }
  ]
}
```

**Przypadki specjalne**:

- Pusta tablica gdy użytkownik nie ma celów: `{ "data": [] }`
- `progress_percentage` może przekroczyć 100% (gdy użytkownik odłożył więcej niż cel)
- `archived_at` jest `null` dla aktywnych celów, ma wartość timestamp dla zarchiwizowanych

### Błąd: 400 Bad Request

Nieprawidłowe parametry query.

**Body**:

```json
{
  "error": "Bad Request",
  "message": "Invalid query parameters",
  "details": {
    "include_archived": "Expected boolean, received string 'maybe'"
  }
}
```

**Przykłady sytuacji**:

- `include_archived=maybe` (nieprawidłowa wartość)
- `include_archived=yes` (nieakceptowana wartość)
- Dodatkowe nieznane parametry (opcjonalnie można ignorować)

### Błąd: 401 Unauthorized

Użytkownik nie jest zalogowany lub token jest nieważny.

**Body**:

```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

**Uwaga**: Obecnie nie implementowane (używamy DEFAULT_USER_ID).

### Błąd: 500 Internal Server Error

Nieoczekiwany błąd po stronie serwera.

**Body**:

```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred. Please try again later."
}
```

**Przykłady sytuacji**:

- Błąd połączenia z bazą danych
- Błąd w query SQL
- Nieoczekiwany format danych z bazy

---

## 5. Przepływ danych

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CLIENT REQUEST                                               │
│    GET /api/v1/goals?include_archived=false                     │
│    Headers: Authorization: Bearer <token>                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. API ROUTE: src/pages/api/v1/goals/index.ts                  │
│    - GET() handler                                              │
│    - Parse URL query parameters                                 │
│    - Validate with ListGoalsQuerySchema (Zod)                   │
│    - Extract includeArchived boolean                            │
└────────────────────────┬────────────────────────────────────────┘
                         │ Valid query
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. SERVICE LAYER: src/lib/services/goal.service.ts             │
│    listGoals(supabase, userId, includeArchived)                 │
│                                                                 │
│    Steps:                                                       │
│    a) Build query with filters                                  │
│       - FROM goals                                              │
│       - JOIN goal_types ON goals.type_code = goal_types.code   │
│       - WHERE user_id = userId (RLS enforces)                   │
│       - WHERE deleted_at IS NULL (soft-delete filter)           │
│       - WHERE archived_at IS NULL (if !includeArchived)         │
│                                                                 │
│    b) Execute query                                             │
│       - SELECT goal fields + goal_types.label_pl                │
│       - ORDER BY created_at DESC (or custom order)              │
│                                                                 │
│    c) Transform results                                         │
│       - Map each row to GoalDTO                                 │
│       - Compute progress_percentage for each goal               │
│       - Handle joined goal_types (array or single object)       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. SUPABASE / POSTGRESQL                                        │
│                                                                 │
│    Query execution:                                             │
│    SELECT                                                       │
│      g.id, g.name, g.type_code,                                 │
│      g.target_amount_cents, g.current_balance_cents,            │
│      g.is_priority, g.archived_at,                              │
│      g.created_at, g.updated_at,                                │
│      gt.label_pl                                                │
│    FROM goals g                                                 │
│    INNER JOIN goal_types gt ON g.type_code = gt.code           │
│    WHERE g.user_id = $userId                                    │
│      AND g.deleted_at IS NULL                                   │
│      AND (g.archived_at IS NULL OR $includeArchived = true)     │
│    ORDER BY g.created_at DESC;                                  │
│                                                                 │
│    RLS Policy Applied:                                          │
│    - user_id = auth.uid() AND                                   │
│    - EXISTS(SELECT 1 FROM profiles WHERE                        │
│        user_id = auth.uid() AND email_confirmed = true)         │
│                                                                 │
│    Index Used:                                                  │
│    - idx_goals_active(user_id) WHERE deleted_at IS NULL         │
│                                                                 │
│    Result: Array of goal records with joined type_label        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. SERVICE LAYER (continued)                                    │
│    Transform DB results → GoalDTO[]                             │
│                                                                 │
│    For each goal:                                               │
│      - Extract type_label from joined goal_types                │
│      - Calculate progress_percentage:                           │
│        (current_balance_cents / target_amount_cents) * 100      │
│      - Handle edge case: target_amount_cents = 0 → progress = 0 │
│                                                                 │
│    Return: GoalDTO[]                                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. API ROUTE (response)                                         │
│    Wrap in GoalListResponseDTO: { data: GoalDTO[] }             │
│    Return Response:                                             │
│      - Status: 200 OK                                           │
│      - Headers: Content-Type: application/json                  │
│      - Body: JSON.stringify({ data: goals })                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. CLIENT                                                       │
│    Receives GoalListResponseDTO                                 │
│    Displays goals in UI:                                        │
│      - Highlight priority goal                                  │
│      - Show progress bars with percentage                       │
│      - Display amounts formatted as PLN                         │
│      - Separate/mark archived goals if included                 │
└─────────────────────────────────────────────────────────────────┘
```

### Interakcje z zewnętrznymi systemami

1. **Supabase PostgreSQL**:
   - Wykonanie query SELECT z JOIN
   - RLS automatycznie filtruje wyniki po user_id
   - Indeksy optymalizują wyszukiwanie

2. **Brak wywołań zewnętrznych API**:
   - Wszystkie dane pochodzą z lokalnej bazy Supabase

---

## 6. Względy bezpieczeństwa

### 6.1 Uwierzytelnianie (Authentication)

**Obecny stan (MVP)**:

- Uwierzytelnianie jest **wyłączone**
- Wszystkie żądania używają `DEFAULT_USER_ID` (hardcoded w `supabase.client.ts`)
- Brak weryfikacji tokena JWT

**Docelowa implementacja** (przyszła iteracja):

```typescript
// Extract user from Supabase Auth
const {
  data: { user },
  error: authError,
} = await supabase.auth.getUser();

if (authError || !user) {
  return new Response(
    JSON.stringify({
      error: "Unauthorized",
      message: "Authentication required",
    }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
}

const userId = user.id;
```

### 6.2 Autoryzacja (Authorization)

**Row Level Security (RLS)**:

- Polityka na tabeli `goals` zapewnia izolację danych użytkowników
- Automatyczne filtrowanie: `WHERE user_id = auth.uid()`
- Wymóg weryfikacji email: `EXISTS(SELECT 1 FROM profiles WHERE user_id = auth.uid() AND email_confirmed = true)`

**Efekt**:

- Użytkownik może zobaczyć **tylko swoje cele**
- Nawet jeśli query byłby nieprawidłowy, RLS chroni przed dostępem do cudzych danych

### 6.3 Walidacja danych wejściowych

**Query Parameters**:

```typescript
// Zod schema z transformacją i walidacją
const ListGoalsQuerySchema = z.object({
  include_archived: z
    .union([z.boolean(), z.string().transform((val) => val === "true" || val === "1")])
    .optional()
    .default(false),
});
```

**Ochrona przed**:

- Injection attacks: Zod zapewnia type safety, Supabase używa prepared statements
- Invalid types: String "maybe" zostanie odrzucony z błędem 400
- Missing parameters: Domyślne wartości zapewnią poprawne działanie

### 6.4 Soft-Delete

**Filtrowanie usuniętych rekordów**:

```typescript
.is("deleted_at", null) // Exclude soft-deleted goals
```

**Ochrona**:

- Użytkownik **nigdy** nie zobaczy celów oznaczonych jako usunięte
- Nawet jeśli rekord fizycznie istnieje w bazie, jest ukryty
- Zgodne z db-plan.md: soft-delete przez UPDATE deleted_at

### 6.5 Potencjalne zagrożenia i mitigacje

| Zagrożenie                                  | Mitigacja                                                             |
| ------------------------------------------- | --------------------------------------------------------------------- |
| **SQL Injection**                           | Supabase używa prepared statements; Zod waliduje typy przed query     |
| **Unauthorized access**                     | RLS policies + auth.uid() enforcement                                 |
| **Data leakage**                            | RLS filtruje automatycznie; tylko user_id = auth.uid()                |
| **IDOR (Insecure Direct Object Reference)** | Brak parametru ID w URL; lista jest scope'owana do użytkownika        |
| **Mass assignment**                         | GET nie przyjmuje body; query params walidowane przez Zod             |
| **DoS (Denial of Service)**                 | Brak paginacji, ale użytkownicy mają niewiele celów (naturalny limit) |

---

## 7. Obsługa błędów

### 7.1 Mapa błędów

| Kod | Error Code              | Scenariusz                                | Response Message                                        | Details                                                   |
| --- | ----------------------- | ----------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| 400 | `Bad Request`           | Nieprawidłowy parametr `include_archived` | "Invalid query parameters"                              | `{ "include_archived": "Expected boolean, received..." }` |
| 400 | `Bad Request`           | Nieparsowalne query params                | "Invalid query parameters"                              | Zod validation errors                                     |
| 401 | `Unauthorized`          | Brak tokena JWT (future)                  | "Authentication required"                               | -                                                         |
| 401 | `Unauthorized`          | Nieważny/wygasły token (future)           | "Invalid or expired token"                              | -                                                         |
| 500 | `Internal Server Error` | Błąd bazy danych                          | "An unexpected error occurred. Please try again later." | -                                                         |
| 500 | `Internal Server Error` | Nieoczekiwany błąd w service              | "An unexpected error occurred. Please try again later." | -                                                         |

### 7.2 Implementacja obsługi błędów

```typescript
export async function GET(context: APIContext) {
  try {
    // 1. Parse and validate query parameters
    const url = new URL(context.request.url);
    const queryParams = {
      include_archived: url.searchParams.get("include_archived"),
    };

    const validatedQuery = ListGoalsQuerySchema.parse(queryParams);

    // 2. Call service
    const goals = await listGoals(supabaseClient, DEFAULT_USER_ID, validatedQuery.include_archived);

    // 3. Return success response
    const response: GoalListResponseDTO = { data: goals };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle Zod validation errors (400)
    if (error instanceof z.ZodError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid query parameters",
        details: formatZodErrors(error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle unexpected errors (500)
    console.error("Unexpected error in GET /api/v1/goals:", error);
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

### 7.3 Logowanie błędów

**Console logging**:

- Błędy 500 są logowane do console z pełnym stack trace
- Błędy walidacji (400) nie są logowane (expected behavior)

**Production considerations**:

- W przyszłości: integracja z Sentry lub podobnym narzędziem
- Nie logować wrażliwych danych (tokens, PII)
- Logować request ID dla trace'owania

---

## 8. Rozważania dotyczące wydajności

### 8.1 Optymalizacje bazy danych

**Indeksy wykorzystywane**:

```sql
-- Główny indeks dla aktywnych celów (bez archiwum)
CREATE INDEX idx_goals_active ON goals(user_id)
  WHERE deleted_at IS NULL AND archived_at IS NULL;

-- Indeks dla wszystkich nie-usuniętych celów
CREATE INDEX idx_goals_user ON goals(user_id);
```

**Query plan**:

- Index scan na `idx_goals_active` dla queries z `include_archived=false`
- Index scan na `idx_goals_user` + filter dla queries z `include_archived=true`
- Nested loop join z `goal_types` (mała tabela, likely cached)

**Estimated query time**: < 10ms dla typowego użytkownika (5-20 celów)

### 8.2 Brak paginacji - uzasadnienie

**Dlaczego nie paginujemy?**:

1. Użytkownicy mają **niewielką liczbę celów** (typowo 5-20, max ~50)
2. Payload jest mały: każdy GoalDTO to ~200-300 bytes → 20 celów ≈ 5KB
3. UI wymaga całej listy do wyświetlenia (brak scrollowania/lazy loading)
4. Prostszy kod i mniej błędów związanych z cursor pagination

**Monitorowanie**:

- Jeśli w przyszłości średnia liczba celów przekroczy 50, rozważyć dodanie paginacji
- Śledzić metryki: p95/p99 response time dla tego endpointu

### 8.3 Caching considerations

**Bieżąca implementacja**: Brak cachingu (fresh data on every request)

**Przyszłe optymalizacje** (jeśli potrzebne):

1. **HTTP caching**:
   ```typescript
   headers: {
     "Content-Type": "application/json",
     "Cache-Control": "private, max-age=30" // 30 seconds
   }
   ```
2. **ETag support**: Zwracać hash listy celów, obsłużyć `If-None-Match`
3. **Server-side caching**: Redis cache z invalidacją przy POST/PATCH/DELETE

**Uwaga**: Na start nie implementujemy cachingu (KISS principle).

### 8.4 N+1 Query Problem

**Potencjalny problem**: Fetching type_label dla każdego celu osobno

**Rozwiązanie**: **Single query z JOIN**

```typescript
.select(`
  id,
  name,
  type_code,
  target_amount_cents,
  current_balance_cents,
  is_priority,
  archived_at,
  created_at,
  updated_at,
  goal_types!inner(label_pl)
`)
```

**Efekt**: Tylko **1 query** do bazy, nie N+1 (gdzie N = liczba celów).

### 8.5 Payload size

**Szacunkowy rozmiar odpowiedzi**:

- 1 GoalDTO: ~250 bytes (JSON)
- 20 celów: ~5 KB
- 50 celów: ~12.5 KB

**Optymalizacja**: Brak kompresji na poziomie aplikacji (Astro/hosting może dodać gzip).

### 8.6 Bottlenecks i monitoring

**Potencjalne wąskie gardła**:

1. **Database connection pool**: Supabase Free tier ma limity połączeń
   - Mitigacja: Używanie connection pooling (supavisor)
2. **RLS overhead**: Każdy query wykonuje RLS policy check
   - Mitigacja: Indeksy na `user_id` minimalizują overhead
3. **JOIN cost**: goal_types join dodaje koszt
   - Mitigacja: goal_types to mała tabela (< 20 rows), likely in memory

**Metryki do monitorowania**:

- Response time p50, p95, p99
- Query execution time (Supabase dashboard)
- Error rate 5xx
- Request rate (QPM - queries per minute)

**SLA Target** (z prd.md):

- p50 response time: ≤ 200ms
- p95 response time: ≤ 500ms
- Availability: ≥ 99% (stabilność aplikacji)

---

## 9. Etapy wdrożenia

### Krok 1: Dodanie schematu walidacji query parameters

**Plik**: `src/lib/schemas/goal.schema.ts`

**Akcja**: Dodaj nowy schemat Zod dla query parametrów

```typescript
/**
 * Zod schema for GET /api/v1/goals query parameters
 * Validates and transforms the include_archived parameter
 */
export const ListGoalsQuerySchema = z.object({
  include_archived: z
    .union([
      z.boolean(),
      z.string().transform((val) => {
        if (val === "true" || val === "1") return true;
        if (val === "false" || val === "0") return false;
        throw new Error(`Invalid boolean value: ${val}`);
      }),
    ])
    .optional()
    .default(false),
});

export type ListGoalsQuery = z.infer<typeof ListGoalsQuerySchema>;
```

**Weryfikacja**:

- Schema akceptuje `true`, `false`, `"true"`, `"false"`, `"1"`, `"0"`, `null`, `undefined`
- Domyślna wartość to `false`
- Inne wartości rzucają ZodError

---

### Krok 2: Implementacja service layer - funkcja listGoals

**Plik**: `src/lib/services/goal.service.ts`

**Akcja**: Dodaj nową funkcję do istniejącego pliku

```typescript
/**
 * Lists all goals for the authenticated user
 *
 * Business logic flow:
 * 1. Query goals table with user_id filter
 * 2. Join with goal_types to get type_label
 * 3. Filter out soft-deleted goals (deleted_at IS NULL)
 * 4. Optionally filter archived goals
 * 5. Transform results to GoalDTO with computed progress_percentage
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param includeArchived - Whether to include archived goals (default: false)
 * @returns Promise<GoalDTO[]> - Array of goals with type labels and progress
 * @throws Error - Database error (will be caught as 500)
 */
export async function listGoals(
  supabase: SupabaseClient,
  userId: string,
  includeArchived: boolean = false
): Promise<GoalDTO[]> {
  // Build query with filters
  let query = supabase
    .from("goals")
    .select(
      `
      id,
      name,
      type_code,
      target_amount_cents,
      current_balance_cents,
      is_priority,
      archived_at,
      created_at,
      updated_at,
      goal_types!inner(label_pl)
    `
    )
    .eq("user_id", userId)
    .is("deleted_at", null); // Exclude soft-deleted goals

  // Conditionally filter archived goals
  if (!includeArchived) {
    query = query.is("archived_at", null);
  }

  // Order by created_at descending (newest first)
  query = query.order("created_at", { ascending: false });

  // Execute query
  const { data: goals, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch goals: ${error.message}`);
  }

  if (!goals) {
    return [];
  }

  // Transform to GoalDTO with computed progress_percentage
  return goals.map((goal) => {
    // Handle joined goal_types (can be array or single object)
    const goalTypes = goal.goal_types as { label_pl: string } | { label_pl: string }[];
    const typeLabel = Array.isArray(goalTypes) ? goalTypes[0].label_pl : goalTypes.label_pl;

    // Compute progress percentage
    const progressPercentage =
      goal.target_amount_cents > 0 ? (goal.current_balance_cents / goal.target_amount_cents) * 100 : 0;

    const goalDTO: GoalDTO = {
      id: goal.id,
      name: goal.name,
      type_code: goal.type_code,
      type_label: typeLabel,
      target_amount_cents: goal.target_amount_cents,
      current_balance_cents: goal.current_balance_cents,
      progress_percentage: progressPercentage,
      is_priority: goal.is_priority,
      archived_at: goal.archived_at,
      created_at: goal.created_at,
      updated_at: goal.updated_at,
    };

    return goalDTO;
  });
}
```

**Weryfikacja**:

- Funkcja zwraca pustą tablicę jeśli użytkownik nie ma celów
- Soft-deleted cele są zawsze filtrowane
- Zarchiwizowane cele są filtrowane tylko gdy `includeArchived = false`
- Progress percentage jest poprawnie obliczany (0 dla target_amount_cents = 0)

---

### Krok 3: Implementacja API route - GET handler

**Plik**: `src/pages/api/v1/goals/index.ts`

**Akcja**: Dodaj handler GET do istniejącego pliku (który ma już POST)

```typescript
import { ListGoalsQuerySchema } from "@/lib/schemas/goal.schema";
import { listGoals } from "@/lib/services/goal.service";
import type { GoalListResponseDTO } from "@/types";

/**
 * GET /api/v1/goals
 *
 * Lists all goals for the authenticated user.
 *
 * Query parameters:
 * - include_archived (optional, boolean): Include archived goals (default: false)
 *
 * Success response: 200 OK with GoalListResponseDTO
 * {
 *   data: GoalDTO[]
 * }
 *
 * Error responses:
 * - 400: Invalid query parameters (Zod validation failed)
 * - 500: Unexpected server error
 *
 * Note: Authentication is temporarily disabled. Using DEFAULT_USER_ID.
 * Auth will be implemented comprehensively in a future iteration.
 */
export async function GET(context: APIContext) {
  try {
    // Parse query parameters from URL
    const url = new URL(context.request.url);
    const queryParams = {
      include_archived: url.searchParams.get("include_archived"),
    };

    // Validate with Zod schema
    const validatedQuery = ListGoalsQuerySchema.parse(queryParams);

    // Call service layer to list goals
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const goals = await listGoals(supabaseClient, DEFAULT_USER_ID, validatedQuery.include_archived);

    // Return 200 OK with GoalListResponseDTO
    const response: GoalListResponseDTO = { data: goals };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle Zod validation errors (400 Bad Request)
    if (error instanceof z.ZodError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid query parameters",
        details: formatZodErrors(error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle all other unexpected errors (500 Internal Server Error)
    console.error("Unexpected error in GET /api/v1/goals:", error);
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

**Weryfikacja**:

- Handler poprawnie parsuje query params z URL
- Zod validation działa dla różnych wartości `include_archived`
- Błędy są obsługiwane zgodnie z mapą błędów
- Response format zgodny z GoalListResponseDTO

---

### Krok 4: Testy manualne (curl/Postman)

**Narzędzia**: curl, Postman, lub Thunder Client (VS Code)

**Test 1: Lista aktywnych celów (domyślnie)**

```bash
curl -X GET "http://localhost:4321/api/v1/goals"
```

**Oczekiwany rezultat**: 200 OK, `{ "data": [...] }` (tylko aktywne cele)

**Test 2: Lista wszystkich celów (włącznie z archiwum)**

```bash
curl -X GET "http://localhost:4321/api/v1/goals?include_archived=true"
```

**Oczekiwany rezultat**: 200 OK, `{ "data": [...] }` (aktywne + zarchiwizowane)

**Test 3: Nieprawidłowy parametr query**

```bash
curl -X GET "http://localhost:4321/api/v1/goals?include_archived=maybe"
```

**Oczekiwany rezultat**: 400 Bad Request z details

**Test 4: Pusta lista celów**

```bash
# Usuń wszystkie cele dla DEFAULT_USER_ID w bazie
curl -X GET "http://localhost:4321/api/v1/goals"
```

**Oczekiwany rezultat**: 200 OK, `{ "data": [] }`

**Test 5: Cel z progress > 100%**

```bash
# Utwórz cel z target=1000, current=1500
curl -X GET "http://localhost:4321/api/v1/goals"
```

**Oczekiwany rezultat**: `progress_percentage: 150.0`

---

### Krok 5: Weryfikacja zgodności z API spec

**Checklist**:

- [ ] Endpoint URL: `/api/v1/goals` ✅
- [ ] Metoda: `GET` ✅
- [ ] Query param: `include_archived` (optional, boolean, default false) ✅
- [ ] Success response: 200 OK ✅
- [ ] Response structure: `{ data: GoalDTO[] }` ✅
- [ ] GoalDTO fields:
  - [ ] `id`, `name`, `type_code`, `type_label` ✅
  - [ ] `target_amount_cents`, `current_balance_cents` ✅
  - [ ] `progress_percentage` (computed) ✅
  - [ ] `is_priority`, `archived_at` ✅
  - [ ] `created_at`, `updated_at` ✅
- [ ] Error responses:
  - [ ] 400 for invalid query params ✅
  - [ ] 401 for unauthorized (future) ✅
  - [ ] 500 for internal errors ✅
- [ ] Error format: `{ error, message, details? }` ✅
- [ ] Soft-deleted goals excluded ✅
- [ ] RLS enforced (user sees only their goals) ✅

---

### Krok 6: Dokumentacja i clean-up

**Akcje**:

1. **Sprawdź linter errors**:

   ```bash
   npm run lint
   ```

   Fix any issues (unused imports, missing semicolons, etc.)

2. **Update .ai/api-plan.md** (jeśli potrzebne):
   - Endpoint jest już udokumentowany, ale sprawdź czy wszystko się zgadza

3. **Commit changes**:

   ```bash
   git add .
   git commit -m "feat: implement GET /api/v1/goals endpoint

   - Add ListGoalsQuerySchema for query validation
   - Implement listGoals service function
   - Add GET handler to /api/v1/goals route
   - Include tests for various scenarios"
   ```

---

## 10. Dodatkowe uwagi

### 10.1 Różnice między POST a GET w tym endpointcie

| Aspekt         | POST /api/v1/goals                 | GET /api/v1/goals             |
| -------------- | ---------------------------------- | ----------------------------- |
| Request body   | Tak (CreateGoalCommand)            | Nie                           |
| Query params   | Nie                                | Tak (include_archived)        |
| Response code  | 201 Created                        | 200 OK                        |
| Response data  | Single GoalDTO                     | GoalListResponseDTO (array)   |
| Business logic | Validation, priority check, insert | Query with filters, transform |
| Error codes    | 400, 409, 422, 500                 | 400, 500 (401 future)         |

### 10.2 Sortowanie wyników

**Obecna implementacja**: `ORDER BY created_at DESC` (newest first)

**Alternatywne strategie** (do rozważenia w przyszłości):

1. **Priority first, then created_at**:
   ```typescript
   .order("is_priority", { ascending: false })
   .order("created_at", { ascending: false })
   ```
2. **By progress percentage** (requires sorting in application):
   ```typescript
   goals.sort((a, b) => b.progress_percentage - a.progress_percentage);
   ```
3. **Alphabetically by name**:
   ```typescript
   .order("name", { ascending: true })
   ```

**Rekomendacja**: Start z `created_at DESC`, zbierz feedback od użytkowników.

### 10.3 Future enhancements (out of scope for MVP)

1. **Search/filtering**:
   - Query param `search` do filtrowania po nazwie celu
   - Query param `type` do filtrowania po type_code

2. **Sorting control**:
   - Query param `sort_by` (created_at, name, progress, target_amount)
   - Query param `order` (asc, desc)

3. **Pagination** (jeśli liczba celów wzrośnie):
   - Cursor-based pagination jak w transactions
   - Limit + offset (prostsze, ale mniej efektywne)

4. **Field selection** (sparse fieldsets):
   - Query param `fields` do wyboru tylko potrzebnych pól
   - Redukcja payload size

5. **Response caching**:
   - HTTP caching headers (Cache-Control, ETag)
   - Server-side caching (Redis)

### 10.4 Testowanie integracyjne (przyszły krok)

**Framework**: Vitest lub Playwright

**Test cases**:

```typescript
describe("GET /api/v1/goals", () => {
  it("should return empty array when user has no goals", async () => {
    const response = await fetch("/api/v1/goals");
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.data).toEqual([]);
  });

  it("should return only active goals by default", async () => {
    // Setup: Create 2 active goals and 1 archived goal
    // ...
    const response = await fetch("/api/v1/goals");
    const data = await response.json();
    expect(data.data).toHaveLength(2);
    expect(data.data.every((g) => g.archived_at === null)).toBe(true);
  });

  it("should include archived goals when include_archived=true", async () => {
    // Setup: Create 2 active goals and 1 archived goal
    // ...
    const response = await fetch("/api/v1/goals?include_archived=true");
    const data = await response.json();
    expect(data.data).toHaveLength(3);
  });

  it("should return 400 for invalid include_archived value", async () => {
    const response = await fetch("/api/v1/goals?include_archived=maybe");
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Bad Request");
  });

  it("should compute progress_percentage correctly", async () => {
    // Setup: Create goal with target=1000, current=250
    // ...
    const response = await fetch("/api/v1/goals");
    const data = await response.json();
    expect(data.data[0].progress_percentage).toBe(25.0);
  });
});
```

---

## 11. Checklist implementacji

Przed oznaczeniem endpointu jako "gotowy", sprawdź:

### Kod

- [ ] Schema walidacji dodany do `goal.schema.ts`
- [ ] Funkcja `listGoals` dodana do `goal.service.ts`
- [ ] Handler GET dodany do `pages/api/v1/goals/index.ts`
- [ ] Import statements poprawne (double quotes, semicolons)
- [ ] Brak linter errors
- [ ] Brak unused variables/imports
- [ ] Consistent code style (zgodny z existing code)

### Funkcjonalność

- [ ] Endpoint zwraca 200 OK dla valid requests
- [ ] Pusta tablica dla użytkownika bez celów
- [ ] `include_archived=false` filtruje zarchiwizowane cele
- [ ] `include_archived=true` pokazuje wszystkie cele
- [ ] Soft-deleted cele są zawsze ukryte
- [ ] Progress percentage poprawnie obliczany
- [ ] Type label poprawnie joinowany z goal_types

### Obsługa błędów

- [ ] 400 dla nieprawidłowych query params
- [ ] 500 dla błędów bazy danych
- [ ] Error format zgodny z ErrorResponseDTO
- [ ] Console logging dla 500 errors

### Dokumentacja

- [ ] JSDoc comments na funkcji service
- [ ] JSDoc comments na handlerze route
- [ ] Komentarze wyjaśniające złożoną logikę
- [ ] Plan implementacji zapisany w `.ai/get-goals-implementation-plan.md`

### Testy manualne

- [ ] Test: GET /api/v1/goals (default, active only)
- [ ] Test: GET /api/v1/goals?include_archived=true
- [ ] Test: GET /api/v1/goals?include_archived=false
- [ ] Test: Invalid query param (400)
- [ ] Test: Pusta lista celów (200 with empty array)
- [ ] Test: Progress > 100%

---

## 12. Kontakt i pytania

W razie pytań lub wątpliwości podczas implementacji, skontaktuj się z:

- **Tech Lead**: [Imię]
- **Backend Team**: #backend-questions (Slack)
- **Dokumentacja**: `.ai/api-plan.md`, `.ai/db-plan.md`

---

**Dokument wygenerowany**: 2025-11-23  
**Wersja**: 1.0  
**Status**: Gotowy do implementacji
