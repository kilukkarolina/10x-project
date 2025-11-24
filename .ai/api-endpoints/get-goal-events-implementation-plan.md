# Plan implementacji API Endpoint: GET /api/v1/goal-events

## 1. Przegląd punktu końcowego

Endpoint `GET /api/v1/goal-events` umożliwia pobranie listy zdarzeń celów (deposits i withdrawals) dla zalogowanego użytkownika z opcjonalnym filtrowaniem i paginacją cursor-based.

**Cel funkcjonalny:**

- Umożliwienie przeglądania historii operacji na celach oszczędnościowych
- Wsparcie filtrowania po: konkretnym celu, miesiącu, typie zdarzenia
- Wydajna paginacja dla dużych zbiorów danych (cursor-based)
- Dostarczenie metadanych paginacji (has_more, next_cursor) dla UI

**Kluczowe cechy:**

- Read-only endpoint (bezpieczny, idempotentny)
- Wykorzystuje RLS Supabase dla izolacji danych użytkowników
- Sortowanie: created_at DESC, id DESC (najnowsze pierwsze)
- Format dat: YYYY-MM-DD (occurred_on), ISO 8601 z timezone (created_at)
- Kwoty w groszach (integer)

---

## 2. Szczegóły żądania

### Metoda HTTP

`GET`

### Struktura URL

```
/api/v1/goal-events?goal_id={uuid}&month={YYYY-MM}&type={DEPOSIT|WITHDRAW}&cursor={base64}&limit={1-100}
```

### Parametry

#### Wymagane

Brak - wszystkie parametry są opcjonalne.

#### Opcjonalne

| Parametr  | Typ           | Ograniczenia                            | Default | Opis                                                              |
| --------- | ------------- | --------------------------------------- | ------- | ----------------------------------------------------------------- |
| `goal_id` | string (UUID) | Musi być valid UUID                     | -       | Filtrowanie po konkretnym celu użytkownika                        |
| `month`   | string        | Format: `YYYY-MM` (np. `2025-01`)       | -       | Filtrowanie po miesiącu wystąpienia zdarzenia (goal_events.month) |
| `type`    | enum          | `DEPOSIT` \| `WITHDRAW`                 | -       | Filtrowanie po typie zdarzenia                                    |
| `cursor`  | string        | Base64-encoded JSON: `{created_at, id}` | -       | Kursor paginacji (ostatni rekord poprzedniej strony)              |
| `limit`   | number        | Min: 1, Max: 100                        | 50      | Liczba rekordów na stronę                                         |

### Request Body

Brak (GET request).

### Headers

```
Authorization: Bearer <jwt_token>  // (Przyszłość - obecnie DEFAULT_USER_ID)
Content-Type: application/json
```

---

## 3. Wykorzystywane typy

### DTOs (z src/types.ts)

#### GoalEventDTO

```typescript
type GoalEventDTO = Pick<GoalEventEntity, "id" | "goal_id" | "type" | "amount_cents" | "occurred_on" | "created_at"> & {
  goal_name: string; // Joined from goals.name
};
```

**Pola:**

- `id` (uuid) - Unikalny identyfikator zdarzenia
- `goal_id` (uuid) - Identyfikator celu
- `goal_name` (string) - Nazwa celu (z JOIN)
- `type` ("DEPOSIT" | "WITHDRAW") - Typ zdarzenia
- `amount_cents` (number) - Kwota w groszach
- `occurred_on` (string YYYY-MM-DD) - Data wystąpienia
- `created_at` (string ISO 8601) - Data utworzenia rekordu

#### GoalEventListResponseDTO

```typescript
interface GoalEventListResponseDTO {
  data: GoalEventDTO[];
  pagination: PaginationDTO;
}
```

#### PaginationDTO

```typescript
interface PaginationDTO {
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
}
```

#### ErrorResponseDTO

```typescript
interface ErrorResponseDTO {
  error: string;
  message: string;
  details?: Record<string, string>;
  retry_after_seconds?: number;
}
```

### Nowe schematy walidacji (do stworzenia)

#### ListGoalEventsQuerySchema (src/lib/schemas/goal-event.schema.ts)

```typescript
export const ListGoalEventsQuerySchema = z.object({
  goal_id: z.string().uuid("Goal ID must be a valid UUID").optional(),

  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format")
    .optional(),

  type: z
    .enum(["DEPOSIT", "WITHDRAW"], {
      invalid_type_error: "Type must be DEPOSIT or WITHDRAW",
    })
    .optional(),

  cursor: z.string().optional(),

  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit cannot exceed 100")
    .default(50),
});
```

### Typy pomocnicze (do stworzenia w service)

#### GoalEventFilters

```typescript
interface GoalEventFilters {
  goalId?: string;
  month?: string;
  type?: "DEPOSIT" | "WITHDRAW";
  cursor?: string;
  limit: number;
}
```

#### DecodedCursor

```typescript
interface DecodedCursor {
  created_at: string; // ISO 8601 timestamp
  id: string; // UUID
}
```

---

## 4. Szczegóły odpowiedzi

### Sukces: 200 OK

```json
{
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "goal_id": "456e4567-e89b-12d3-a456-426614174001",
      "goal_name": "Wakacje w Grecji",
      "type": "DEPOSIT",
      "amount_cents": 50000,
      "occurred_on": "2025-01-15",
      "created_at": "2025-01-15T18:30:00Z"
    },
    {
      "id": "789e4567-e89b-12d3-a456-426614174002",
      "goal_id": "456e4567-e89b-12d3-a456-426614174001",
      "goal_name": "Wakacje w Grecji",
      "type": "WITHDRAW",
      "amount_cents": 10000,
      "occurred_on": "2025-01-10",
      "created_at": "2025-01-10T12:00:00Z"
    }
  ],
  "pagination": {
    "next_cursor": "eyJjcmVhdGVkX2F0IjoiMjAyNS0wMS0xMFQxMjowMDowMFoiLCJpZCI6Ijc4OWU0NTY3LWU4OWItMTJkMy1hNDU2LTQyNjYxNDE3NDAwMiJ9",
    "has_more": true,
    "limit": 50
  }
}
```

**Opis pól:**

- `data` - Tablica obiektów GoalEventDTO (może być pusta)
- `pagination.next_cursor` - Base64-encoded kursor do następnej strony (null jeśli brak więcej danych)
- `pagination.has_more` - Boolean wskazujący czy są jeszcze dane
- `pagination.limit` - Użyty limit (odzwierciedla request param)

### Błąd: 400 Bad Request (Nieprawidłowe query params)

```json
{
  "error": "Bad Request",
  "message": "Invalid query parameters",
  "details": {
    "goal_id": "Goal ID must be a valid UUID",
    "limit": "Limit cannot exceed 100"
  }
}
```

### Błąd: 400 Bad Request (Nieprawidłowy cursor)

```json
{
  "error": "Bad Request",
  "message": "Invalid pagination cursor",
  "details": {
    "cursor": "Cursor must be a valid base64-encoded JSON with created_at and id"
  }
}
```

### Błąd: 401 Unauthorized (Przyszłość - po implementacji auth)

```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

### Błąd: 500 Internal Server Error

```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred. Please try again later."
}
```

---

## 5. Przepływ danych

### Architektura warstw

```
Client Request
    ↓
[Astro API Route: GET /api/v1/goal-events]
    ↓ Parse & validate query params (Zod)
    ↓ Extract userId (DEFAULT_USER_ID → przyszłość: context.locals.user)
    ↓
[Service Layer: listGoalEvents()]
    ↓ Decode cursor (if provided)
    ↓ Build Supabase query with filters
    ↓ Apply RLS (automatic via Supabase)
    ↓
[Supabase PostgreSQL]
    ↓ Query: goal_events JOIN goals
    ↓ Filters: user_id, goal_id?, month?, type?
    ↓ ORDER BY: created_at DESC, id DESC
    ↓ LIMIT: limit + 1 (detect has_more)
    ↓
[Service Layer: listGoalEvents()]
    ↓ Map database rows to GoalEventDTO[]
    ↓ Calculate has_more (length > limit)
    ↓ Encode next_cursor (last record)
    ↓ Construct GoalEventListResponseDTO
    ↓
[Astro API Route]
    ↓ Return 200 OK with JSON response
    ↓
Client receives data + pagination metadata
```

### Szczegóły interakcji z bazą danych

#### Zapytanie SQL (konceptualnie)

```sql
SELECT
  ge.id,
  ge.goal_id,
  ge.type,
  ge.amount_cents,
  ge.occurred_on,
  ge.created_at,
  g.name as goal_name
FROM goal_events ge
INNER JOIN goals g ON ge.goal_id = g.id
WHERE ge.user_id = $user_id
  AND ($goal_id IS NULL OR ge.goal_id = $goal_id)
  AND ($month IS NULL OR ge.month = $month::date)
  AND ($type IS NULL OR ge.type = $type)
  AND ($cursor_created_at IS NULL OR
       (ge.created_at < $cursor_created_at OR
        (ge.created_at = $cursor_created_at AND ge.id < $cursor_id)))
ORDER BY ge.created_at DESC, ge.id DESC
LIMIT $limit + 1;
```

#### Supabase Query Builder

```typescript
let query = supabase
  .from("goal_events")
  .select(
    `
    id,
    goal_id,
    type,
    amount_cents,
    occurred_on,
    created_at,
    goals!inner(name)
  `
  )
  .eq("user_id", userId)
  .order("created_at", { ascending: false })
  .order("id", { ascending: false });

// Apply optional filters
if (filters.goalId) {
  query = query.eq("goal_id", filters.goalId);
}

if (filters.month) {
  query = query.eq("month", filters.month);
}

if (filters.type) {
  query = query.eq("type", filters.type);
}

// Apply cursor pagination
if (decodedCursor) {
  query = query.or(
    `created_at.lt.${decodedCursor.created_at},` +
      `and(created_at.eq.${decodedCursor.created_at},id.lt.${decodedCursor.id})`
  );
}

// Fetch limit + 1 to detect has_more
query = query.limit(filters.limit + 1);

const { data, error } = await query;
```

### Cursor-based Pagination

#### Enkodowanie kursora

```typescript
function encodeCursor(record: { created_at: string; id: string }): string {
  const cursorData = {
    created_at: record.created_at,
    id: record.id,
  };
  return Buffer.from(JSON.stringify(cursorData)).toString("base64");
}
```

#### Dekodowanie kursora

```typescript
function decodeCursor(cursor: string): DecodedCursor {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);

    if (!parsed.created_at || !parsed.id) {
      throw new Error("Invalid cursor structure");
    }

    return parsed as DecodedCursor;
  } catch (error) {
    throw new ValidationError("Invalid pagination cursor", "INVALID_CURSOR");
  }
}
```

---

## 6. Względy bezpieczeństwa

### Uwierzytelnianie i autoryzacja

#### Obecny stan (MVP)

- **Tymczasowe rozwiązanie:** `DEFAULT_USER_ID` hardcoded w `supabase.client.ts`
- **Ryzyko:** Brak rzeczywistej izolacji użytkowników w developmencie
- **Mitigacja:** RLS aktywny, przygotowanie struktury kodu na przyszłą integrację auth

#### Docelowy stan (do implementacji)

```typescript
// Extract authenticated user from context
const user = context.locals.user;

if (!user) {
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

### Row Level Security (RLS)

**Polityki na tabeli goal_events:**

```sql
-- SELECT policy
CREATE POLICY "goal_events_select_policy" ON goal_events
FOR SELECT
USING (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
    AND p.email_confirmed
  )
);
```

**Implikacje:**

- Automatyczna filtracja po `user_id` przez Postgres RLS
- Użytkownik nie może zobaczyć goal_events innych użytkowników
- Wymóg zweryfikowanego email (profiles.email_confirmed)

### Walidacja danych wejściowych

#### Poziom 1: Zod Schema (API Route)

```typescript
const querySchema = ListGoalEventsQuerySchema.safeParse(queryParams);

if (!querySchema.success) {
  return new Response(
    JSON.stringify({
      error: "Bad Request",
      message: "Invalid query parameters",
      details: formatZodErrors(querySchema.error),
    }),
    { status: 400, headers: { "Content-Type": "application/json" } }
  );
}
```

**Chroni przed:**

- Nieprawidłowe UUID (goal_id)
- Nieprawidłowy format miesiąca
- Nieprawidłowe wartości type
- Limit poza zakresem 1-100

#### Poziom 2: Cursor Validation (Service Layer)

```typescript
function decodeCursor(cursor: string): DecodedCursor {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);

    // Validate structure
    if (!parsed.created_at || !parsed.id) {
      throw new Error("Missing required cursor fields");
    }

    // Validate created_at is valid ISO timestamp
    if (isNaN(new Date(parsed.created_at).getTime())) {
      throw new Error("Invalid created_at timestamp");
    }

    // Validate id is UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(parsed.id)) {
      throw new Error("Invalid id format");
    }

    return parsed as DecodedCursor;
  } catch (error) {
    throw new ValidationError("Invalid pagination cursor", "INVALID_CURSOR", {
      cursor: "Must be a valid base64-encoded JSON",
    });
  }
}
```

**Chroni przed:**

- Malformed base64
- Nieprawidłowy JSON
- Brakujące pola
- Nieprawidłowe typy wartości
- Cursor injection attacks

### Ochrona przed atakami

#### 1. SQL Injection

- **Zagrożenie:** Manipulacja parametrów query → wykonanie arbitrary SQL
- **Mitigacja:** Supabase parameterized queries (automatyczne escaping)

#### 2. Enumeration Attacks

- **Zagrożenie:** Odkrywanie goal_id innych użytkowników przez trial-and-error
- **Mitigacja:**
  - RLS wymusza user_id filter
  - Nieistniejący goal_id → pusta lista (200), nie 404
  - Brak różnicy w response time między "nie istnieje" vs "nie masz dostępu"

#### 3. Denial of Service (DoS)

- **Zagrożenie:** Requesty z limit=1000000 → exhaust resources
- **Mitigacja:**
  - Max limit 100 enforced przez Zod
  - Database indices na (user_id, created_at, id)
  - Timeout na Supabase queries (domyślnie 30s)

#### 4. Cursor Manipulation

- **Zagrożenie:** Atakujący modyfikuje cursor → dostęp do innych danych
- **Mitigacja:**
  - Dekodowanie z try-catch
  - Walidacja struktury i typów
  - RLS nadal aktywny (cursor nie może obejść user_id)
  - Graceful degradation: invalid cursor → 400, nie crash

#### 5. Timing Attacks

- **Zagrożenie:** Pomiar czasu odpowiedzi → wnioskowanie o istnieniu zasobów
- **Mitigacja:**
  - Konsystentne zwracanie 200 OK
  - Pusta lista vs error → ten sam status code
  - Database query time similar dla empty vs non-empty results (dzięki indices)

### Sanityzacja outputu

#### XSS Protection

- **Zagrożenie:** goal_name zawiera złośliwy HTML/JS → XSS na frontend
- **Mitigacja:**
  - Backend: zwracamy raw string (brak HTML parsing)
  - Frontend: React automatyczne escaping (używać `{goalName}`, nie `dangerouslySetInnerHTML`)
  - CSP headers na hostingu

#### Data Leakage

- **Zagrożenie:** Eksponowanie wrażliwych pól (np. user_id, internal fields)
- **Mitigacja:**
  - DTO explicitly picks exposed fields
  - Brak `SELECT *` - zawsze lista konkretnych kolumn
  - Type safety: GoalEventDTO nie zawiera user_id

---

## 7. Obsługa błędów

### Katalog błędów z kodami statusu

| Błąd                     | Kod | Scenariusz                                                      | ErrorResponseDTO                                                                                       | Akcja                           |
| ------------------------ | --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------- |
| **Invalid Query Params** | 400 | Zod validation failed (np. goal_id nie jest UUID, limit > 100)  | `{ error: "Bad Request", message: "Invalid query parameters", details: {...} }`                        | Popraw parametry w request      |
| **Invalid Cursor**       | 400 | Cursor nie jest poprawnym base64 lub ma nieprawidłową strukturę | `{ error: "Bad Request", message: "Invalid pagination cursor", details: { cursor: "..." } }`           | Usuń cursor lub użyj poprawnego |
| **Unauthorized**         | 401 | Brak lub nieprawidłowy JWT token (przyszłość)                   | `{ error: "Unauthorized", message: "Authentication required" }`                                        | Zaloguj się ponownie            |
| **Database Error**       | 500 | Supabase query failed (network, timeout, etc.)                  | `{ error: "Internal Server Error", message: "An unexpected error occurred. Please try again later." }` | Retry z exponential backoff     |
| **Unexpected Error**     | 500 | Uncaught exception w API route lub service                      | `{ error: "Internal Server Error", message: "An unexpected error occurred. Please try again later." }` | Log błąd, retry                 |

### Implementacja obsługi błędów

#### API Route Error Handling

```typescript
export async function GET(context: APIContext) {
  try {
    // 1. Parse and validate query params
    const url = new URL(context.request.url);
    const queryParams = {
      goal_id: url.searchParams.get("goal_id") || undefined,
      month: url.searchParams.get("month") || undefined,
      type: url.searchParams.get("type") || undefined,
      cursor: url.searchParams.get("cursor") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    };

    const validated = ListGoalEventsQuerySchema.safeParse(queryParams);

    if (!validated.success) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid query parameters",
        details: formatZodErrors(validated.error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Call service layer
    const result = await listGoalEvents(supabaseClient, DEFAULT_USER_ID, validated.data);

    // 3. Return 200 OK
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle ValidationError (invalid cursor)
    if (error instanceof ValidationError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: error.message,
        details: error.details,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle unexpected errors
    console.error("Unexpected error in GET /api/v1/goal-events:", error);
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

#### Service Layer Error Handling

```typescript
export async function listGoalEvents(
  supabase: SupabaseClient,
  userId: string,
  filters: GoalEventFilters
): Promise<GoalEventListResponseDTO> {
  try {
    // Decode cursor if provided
    let decodedCursor: DecodedCursor | null = null;
    if (filters.cursor) {
      decodedCursor = decodeCursor(filters.cursor); // Throws ValidationError if invalid
    }

    // Build and execute query
    const { data, error } = await buildQuery(supabase, userId, filters, decodedCursor);

    if (error) {
      // Database error → rethrow as generic Error (will become 500)
      throw new Error(`Database query failed: ${error.message}`);
    }

    // Transform and return data
    return transformToListResponse(data || [], filters.limit);
  } catch (error) {
    // ValidationError (from decodeCursor) → re-throw to API route
    if (error instanceof ValidationError) {
      throw error;
    }

    // Any other error → re-throw as generic Error
    throw error;
  }
}
```

### Graceful Degradation

**Scenariusz: Częściowy błąd bazy danych (timeout na JOIN)**

- **Strategia:** Brak fallback - zwróć 500, pozwól klientowi retry
- **Uzasadnienie:** Dane finansowe wymagają spójności, lepiej fail explicitly

**Scenariusz: Invalid cursor ale valid inne params**

- **Strategia:** Zwróć 400, nie próbuj "naprawić" cursora
- **Uzasadnienie:** Client-side bug powinien być wyraźny

**Scenariusz: Empty result (goal_id not found)**

- **Strategia:** Zwróć 200 z pustą tablicą data: []
- **Uzasadnienie:** Nie ujawniaj istnienia/nieistnienia zasobów innych użytkowników

---

## 8. Rozważania dotyczące wydajności

### Potencjalne wąskie gardła

#### 1. Database Query Performance

**Problem:** Skanowanie dużej tabeli goal_events bez indeksów
**Wpływ:** Wysokie query time (>1s) przy tysiącach rekordów
**Mitigacja:**

- **Indeks composite:** `idx_ge_user_month(user_id, month, type)` (db-plan.md linia 188)
- **Indeks keyset:** `idx_ge_user_keyset(user_id, created_at DESC, id DESC)`
- **Partial index:** Jeśli soft-delete w przyszłości: `WHERE deleted_at IS NULL`

#### 2. JOIN Performance

**Problem:** JOIN z tabelą goals dla goal_name
**Wpływ:** Dodatkowe ~50ms latency
**Mitigacja:**

- **Index FK:** `idx_ge_goal(goal_id)` (db-plan.md linia 189)
- **Supabase inner join optimization:** Postgres query planner wykorzysta index
- **Alternatywa (przyszłość):** Denormalizacja goal_name do goal_events (trade-off: storage vs speed)

#### 3. Cursor Encoding/Decoding

**Problem:** Base64 + JSON.parse dla każdego requesta z cursorem
**Wpływ:** Minimalny (~1ms), ale skala z traffic
**Mitigacja:**

- **Brak cache:** Cursor jest ephemeral, nie cachować
- **Optymalizacja przyszłościowa:** Jeśli bottleneck, użyć prostszego formatu (np. `${timestamp}_${id}` zamiast JSON)

#### 4. RLS Overhead

**Problem:** RLS policies dodają warunek WHERE do każdego query
**Wpływ:** ~5-10ms overhead
**Mitigacja:**

- **Index na user_id:** Już istnieje (idx_ge_user)
- **Brak obejścia:** RLS kluczowy dla security, akceptowalny trade-off

#### 5. Large Result Sets

**Problem:** Użytkownik z 10k+ goal events, nawet z limitem 100 query może być wolny
**Wpływ:** Query time >500ms
**Mitigacja:**

- **Keyset pagination:** O(log n) zamiast O(n) - dzięki ORDER BY + indeks
- **Partial response:** Już ograniczamy do limit+1 rekordów
- **Client-side caching:** Frontend cache poprzednich stron

### Strategie optymalizacji

#### Optymalizacja 1: Database Indices

**Implementacja:**

```sql
-- Już istnieje w db-plan.md
CREATE INDEX idx_ge_user_month ON goal_events (user_id, month, type);
CREATE INDEX idx_ge_user_keyset ON goal_events (user_id, created_at DESC, id DESC);
CREATE INDEX idx_ge_goal ON goal_events (goal_id);
```

**Expected improvement:**

- Query time: 500ms → 50ms (10x speedup)
- Scalability: O(n) → O(log n)

#### Optymalizacja 2: Query Optimization

**Best practices:**

```typescript
// ❌ BAD: Select all fields
.select("*")

// ✅ GOOD: Select only needed fields
.select("id, goal_id, type, amount_cents, occurred_on, created_at, goals!inner(name)")
```

**Expected improvement:**

- Network payload: -30% (brak user_id, month, client_request_id)
- Parsing time: -20%

#### Optymalizacja 3: Limit Tuning

**Analiza:**

- Default limit: 50 rekordów
- Max limit: 100 rekordów
- Średni rozmiar rekordu: ~200 bytes
- Payload size: 50 \* 200B = 10KB (akceptowalne dla mobile)

**Recommendation:**

- Zachowaj default 50
- Jeśli analytics pokażą, że większość userów scrolluje dalej → zwiększ default do 75

#### Optymalizacja 4: Response Compression

**Implementacja (hosting level):**

```javascript
// Astro config lub hosting (Cloudflare, Vercel)
{
  "compression": "gzip",  // lub brotli
  "minSize": 1024         // Kompresuj jeśli response > 1KB
}
```

**Expected improvement:**

- Payload size: 10KB → 3KB (70% reduction dla JSON)
- Transfer time: -50ms na 3G

#### Optymalizacja 5: Caching Strategy (Przyszłość)

**Scenariusz:** Read-heavy endpoint, dane historyczne rzadko się zmieniają

**Option A: Client-side cache (React Query)**

```typescript
// Frontend
const { data } = useQuery({
  queryKey: ["goal-events", filters],
  queryFn: () => fetchGoalEvents(filters),
  staleTime: 5 * 60 * 1000, // 5 minut
  cacheTime: 10 * 60 * 1000, // 10 minut
});
```

**Option B: CDN cache (Cloudflare)**

```typescript
// Astro API route
return new Response(JSON.stringify(result), {
  status: 200,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "private, max-age=60", // 1 minuta cache per user
  },
});
```

**Trade-off:** Freshness vs Speed

- **Recommendation:** Client-side cache z invalidation po POST /goal-events

### Monitoring i Metrics

**Kluczowe metryki do trackowania:**

1. **P50/P95/P99 Latency:** Czas od request do response
2. **Query Time:** Czas wykonania Supabase query
3. **Error Rate:** % requestów z 4xx/5xx
4. **Throughput:** Requests per second
5. **Cache Hit Rate:** % requestów obsłużonych z cache (jeśli implementowane)

**Narzędzia:**

- **Development:** `console.time()` / `console.timeEnd()`
- **Production:** Supabase Dashboard → Logs → Query Performance
- **APM (przyszłość):** Sentry Performance Monitoring

**Alert thresholds:**

- P95 latency > 1s → Investigate slow queries
- Error rate > 5% → Check database health
- Query time > 500ms → Review indices

---

## 9. Etapy wdrożenia

### Faza 1: Rozszerzenie schematu walidacji (schema)

**Plik:** `src/lib/schemas/goal-event.schema.ts`

**Zadania:**

1. Dodaj `ListGoalEventsQuerySchema` do istniejącego pliku
2. Zdefiniuj walidacje dla każdego parametru query:
   - `goal_id`: optional UUID
   - `month`: optional YYYY-MM format
   - `type`: optional enum DEPOSIT | WITHDRAW
   - `cursor`: optional string (walidacja struktury w service)
   - `limit`: coerce.number, int, min 1, max 100, default 50
3. Dodaj komentarze JSDoc opisujące schemat
4. Eksportuj schemat: `export const ListGoalEventsQuerySchema = ...`

**Kod:**

```typescript
/**
 * Zod schema for GET /api/v1/goal-events query parameters
 * Validates filtering and pagination params
 */
export const ListGoalEventsQuerySchema = z.object({
  goal_id: z.string().uuid("Goal ID must be a valid UUID").optional(),

  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format")
    .optional(),

  type: z
    .enum(["DEPOSIT", "WITHDRAW"], {
      invalid_type_error: "Type must be DEPOSIT or WITHDRAW",
    })
    .optional(),

  cursor: z.string().optional(),

  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit cannot exceed 100")
    .default(50),
});
```

**Output:** Plik `goal-event.schema.ts` z nowym schematem

**Czas:** 15 minut

---

### Faza 2: Implementacja service layer (business logic)

**Plik:** `src/lib/services/goal-event.service.ts`

**Zadania:**

#### 2.1 Definicje typów pomocniczych

```typescript
interface GoalEventFilters {
  goalId?: string;
  month?: string;
  type?: "DEPOSIT" | "WITHDRAW";
  cursor?: string;
  limit: number;
}

interface DecodedCursor {
  created_at: string;
  id: string;
}
```

#### 2.2 Funkcje pomocnicze dla cursora

**Funkcja: decodeCursor()**

```typescript
/**
 * Decodes and validates base64-encoded pagination cursor
 *
 * @param cursor - Base64-encoded JSON string
 * @returns DecodedCursor with created_at and id
 * @throws ValidationError if cursor is invalid
 */
function decodeCursor(cursor: string): DecodedCursor {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);

    if (!parsed.created_at || !parsed.id) {
      throw new Error("Missing required cursor fields");
    }

    if (isNaN(new Date(parsed.created_at).getTime())) {
      throw new Error("Invalid created_at timestamp");
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(parsed.id)) {
      throw new Error("Invalid id format");
    }

    return parsed as DecodedCursor;
  } catch (error) {
    throw new ValidationError("Invalid pagination cursor", "INVALID_CURSOR", {
      cursor: "Must be a valid base64-encoded JSON with created_at and id",
    });
  }
}
```

**Funkcja: encodeCursor()**

```typescript
/**
 * Encodes pagination cursor from goal event record
 *
 * @param record - Record with created_at and id
 * @returns Base64-encoded cursor string
 */
function encodeCursor(record: { created_at: string; id: string }): string {
  const cursorData = {
    created_at: record.created_at,
    id: record.id,
  };
  return Buffer.from(JSON.stringify(cursorData)).toString("base64");
}
```

#### 2.3 Funkcja główna: listGoalEvents()

```typescript
/**
 * Lists goal events for authenticated user with filtering and pagination
 *
 * Business logic:
 * 1. Decode cursor if provided (validates structure)
 * 2. Build Supabase query with filters
 * 3. Apply RLS (automatic via Supabase)
 * 4. Fetch limit+1 records (to detect has_more)
 * 5. Map database rows to GoalEventDTO
 * 6. Calculate pagination metadata
 * 7. Encode next_cursor from last record
 *
 * @param supabase - Supabase client with user context
 * @param userId - ID of authenticated user
 * @param filters - Filtering and pagination parameters
 * @returns Promise<GoalEventListResponseDTO> with data and pagination
 * @throws ValidationError if cursor is invalid (400)
 * @throws Error if database query fails (500)
 */
export async function listGoalEvents(
  supabase: SupabaseClient,
  userId: string,
  filters: GoalEventFilters
): Promise<GoalEventListResponseDTO> {
  // STEP 1: Decode cursor if provided
  let decodedCursor: DecodedCursor | null = null;
  if (filters.cursor) {
    decodedCursor = decodeCursor(filters.cursor); // Throws ValidationError if invalid
  }

  // STEP 2: Build base query
  let query = supabase
    .from("goal_events")
    .select(
      `
      id,
      goal_id,
      type,
      amount_cents,
      occurred_on,
      created_at,
      goals!inner(name)
    `
    )
    .eq("user_id", userId);

  // STEP 3: Apply optional filters
  if (filters.goalId) {
    query = query.eq("goal_id", filters.goalId);
  }

  if (filters.month) {
    // month is a generated column: date_trunc('month', occurred_on)
    // We need to pass a date value (first day of month)
    query = query.eq("month", `${filters.month}-01`);
  }

  if (filters.type) {
    query = query.eq("type", filters.type);
  }

  // STEP 4: Apply cursor pagination
  if (decodedCursor) {
    // Filter: created_at < cursor OR (created_at = cursor AND id < cursor.id)
    query = query.or(
      `created_at.lt.${decodedCursor.created_at},` +
        `and(created_at.eq.${decodedCursor.created_at},id.lt.${decodedCursor.id})`
    );
  }

  // STEP 5: Apply ordering and limit
  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(filters.limit + 1); // Fetch one extra to detect has_more

  // STEP 6: Execute query
  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch goal events: ${error.message}`);
  }

  // STEP 7: Process results
  const hasMore = (data?.length || 0) > filters.limit;
  const records = hasMore ? data!.slice(0, filters.limit) : data || [];

  // STEP 8: Map to DTOs
  const goalEvents: GoalEventDTO[] = records.map((record) => {
    // Parse joined goals data
    const goals = record.goals as { name: string } | { name: string }[];
    const goalName = Array.isArray(goals) ? goals[0].name : goals.name;

    return {
      id: record.id,
      goal_id: record.goal_id,
      goal_name: goalName,
      type: record.type as "DEPOSIT" | "WITHDRAW",
      amount_cents: record.amount_cents,
      occurred_on: record.occurred_on,
      created_at: record.created_at,
    };
  });

  // STEP 9: Calculate pagination metadata
  const nextCursor =
    hasMore && records.length > 0
      ? encodeCursor({
          created_at: records[records.length - 1].created_at,
          id: records[records.length - 1].id,
        })
      : null;

  // STEP 10: Construct response
  const response: GoalEventListResponseDTO = {
    data: goalEvents,
    pagination: {
      next_cursor: nextCursor,
      has_more: hasMore,
      limit: filters.limit,
    },
  };

  return response;
}
```

**Output:** Plik `goal-event.service.ts` z nową funkcją i helperami

**Czas:** 45 minut

---

### Faza 3: Implementacja API route (GET handler)

**Plik:** `src/pages/api/v1/goal-events/index.ts`

**Zadania:**

1. Dodaj import `ListGoalEventsQuerySchema` i `listGoalEvents`
2. Dodaj import `GoalEventListResponseDTO` z types
3. Zaimplementuj funkcję `GET()`
4. Obsłuż walidację query params
5. Obsłuż wywołanie service layer
6. Obsłuż błędy (ValidationError, generic Error)
7. Zwróć odpowiednie status codes i JSON

**Kod:**

```typescript
/**
 * GET /api/v1/goal-events
 *
 * Lists goal events for authenticated user with filtering and pagination.
 *
 * Query parameters:
 * - goal_id (optional): Filter by specific goal (UUID)
 * - month (optional): Filter by month (YYYY-MM format)
 * - type (optional): Filter by type (DEPOSIT | WITHDRAW)
 * - cursor (optional): Pagination cursor (base64-encoded)
 * - limit (optional): Records per page (default: 50, max: 100)
 *
 * Success response: 200 OK with GoalEventListResponseDTO
 * {
 *   data: GoalEventDTO[],
 *   pagination: {
 *     next_cursor: string | null,
 *     has_more: boolean,
 *     limit: number
 *   }
 * }
 *
 * Error responses:
 * - 400: Invalid query parameters (Zod validation or invalid cursor)
 * - 401: Unauthorized (future - authentication required)
 * - 500: Unexpected server error
 *
 * Note: Authentication is temporarily disabled. Using DEFAULT_USER_ID.
 * Auth will be implemented comprehensively in a future iteration.
 */
export async function GET(context: APIContext) {
  try {
    // 1. Extract query parameters from URL
    const url = new URL(context.request.url);
    const queryParams = {
      goal_id: url.searchParams.get("goal_id") || undefined,
      month: url.searchParams.get("month") || undefined,
      type: url.searchParams.get("type") || undefined,
      cursor: url.searchParams.get("cursor") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    };

    // 2. Validate with Zod schema
    const validated = ListGoalEventsQuerySchema.safeParse(queryParams);

    if (!validated.success) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid query parameters",
        details: formatZodErrors(validated.error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Call service layer to list goal events
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const result = await listGoalEvents(supabaseClient, DEFAULT_USER_ID, {
      goalId: validated.data.goal_id,
      month: validated.data.month,
      type: validated.data.type,
      cursor: validated.data.cursor,
      limit: validated.data.limit,
    });

    // 4. Return 200 OK with GoalEventListResponseDTO
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle ValidationError (invalid cursor)
    if (error instanceof ValidationError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: error.message,
        details: error.details,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle all other unexpected errors (500 Internal Server Error)
    // eslint-disable-next-line no-console
    console.error("Unexpected error in GET /api/v1/goal-events:", error);
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

**Output:** Plik `index.ts` z nowym handlerem GET

**Czas:** 30 minut

---

### Faza 4: Testowanie manualne

**Narzędzia:** cURL, Postman, lub browser devtools

**Test Cases:**

#### Test 1: Podstawowe zapytanie (bez filtrów)

```bash
curl -X GET "http://localhost:4321/api/v1/goal-events?limit=10"
```

**Expected:** 200 OK z max 10 rekordami

#### Test 2: Filtrowanie po goal_id

```bash
curl -X GET "http://localhost:4321/api/v1/goal-events?goal_id=<valid-uuid>&limit=5"
```

**Expected:** 200 OK z events dla tego celu

#### Test 3: Filtrowanie po miesiącu

```bash
curl -X GET "http://localhost:4321/api/v1/goal-events?month=2025-01&limit=10"
```

**Expected:** 200 OK z events ze stycznia 2025

#### Test 4: Filtrowanie po typie

```bash
curl -X GET "http://localhost:4321/api/v1/goal-events?type=DEPOSIT&limit=10"
```

**Expected:** 200 OK tylko z DEPOSIT events

#### Test 5: Kombinacja filtrów

```bash
curl -X GET "http://localhost:4321/api/v1/goal-events?goal_id=<uuid>&type=WITHDRAW&month=2025-01"
```

**Expected:** 200 OK z filtered events

#### Test 6: Paginacja (bez cursora)

```bash
curl -X GET "http://localhost:4321/api/v1/goal-events?limit=2"
```

**Expected:** 200 OK z 2 rekordami + next_cursor (jeśli has_more=true)

#### Test 7: Paginacja (z cursorem)

```bash
# Użyj next_cursor z poprzedniego requesta
curl -X GET "http://localhost:4321/api/v1/goal-events?limit=2&cursor=<base64-cursor>"
```

**Expected:** 200 OK z kolejnymi 2 rekordami

#### Test 8: Nieprawidłowy goal_id

```bash
curl -X GET "http://localhost:4321/api/v1/goal-events?goal_id=invalid-uuid"
```

**Expected:** 400 Bad Request z Zod error

#### Test 9: Nieprawidłowy month format

```bash
curl -X GET "http://localhost:4321/api/v1/goal-events?month=2025/01"
```

**Expected:** 400 Bad Request

#### Test 10: Nieprawidłowy type

```bash
curl -X GET "http://localhost:4321/api/v1/goal-events?type=TRANSFER"
```

**Expected:** 400 Bad Request

#### Test 11: Limit poza zakresem

```bash
curl -X GET "http://localhost:4321/api/v1/goal-events?limit=200"
```

**Expected:** 400 Bad Request (max 100)

#### Test 12: Nieprawidłowy cursor

```bash
curl -X GET "http://localhost:4321/api/v1/goal-events?cursor=invalid-base64"
```

**Expected:** 400 Bad Request

#### Test 13: Pusta lista (brak events)

```bash
curl -X GET "http://localhost:4321/api/v1/goal-events?goal_id=<uuid-without-events>"
```

**Expected:** 200 OK z pustą tablicą data: []

**Output:** Lista wyników testów z pass/fail

**Czas:** 30 minut

---

### Faza 5: Code review i refactoring

**Zadania:**

1. **Review type safety:** Sprawdź czy wszystkie typy są poprawne (brak `any`)
2. **Review error handling:** Upewnij się że wszystkie błędy są obsłużone
3. **Review security:** Potwierdź że RLS jest aktywny i user_id jest używany
4. **Review performance:** Sprawdź czy query używa odpowiednich indeksów
5. **Review code style:** Zgodność z regułami (double quotes, semicolons)
6. **Dodaj ESLint comments:** Jeśli potrzebne (np. dla console.error)
7. **Update documentation:** Upewnij się że komentarze JSDoc są aktualne

**Checklist:**

- [ ] Brak linter errors
- [ ] Wszystkie funkcje mają JSDoc comments
- [ ] Error messages są user-friendly
- [ ] Kod używa double quotes i semicolons
- [ ] ValidationError i NotFoundError są używane konsystentnie
- [ ] Supabase query używa inner join (goals!inner)
- [ ] Pagination metadata jest poprawnie obliczana

**Output:** Refactored code ready for merge

**Czas:** 20 minut

---

### Faza 6: Dokumentacja aktualizacji (opcjonalna)

**Zadania:**

1. Zaktualizuj `api-plan.md` jeśli coś się zmieniło
2. Dodaj przykłady użycia w komentarzach
3. Dodaj przykładowe response payloads do dokumentacji
4. Zaktualizuj README jeśli endpoint jest publicznie dokumentowany

**Output:** Updated documentation

**Czas:** 15 minut

---

### Faza 7: Deployment checklist (przed merging do main)

**Pre-deployment verification:**

- [ ] Wszystkie testy manualne przechodzą
- [ ] Linter errors resolved
- [ ] TypeScript compiles bez błędów
- [ ] Supabase migrations są applied (indices istnieją)
- [ ] RLS policies są aktywne na goal_events table
- [ ] ENV variables są ustawione (SUPABASE_URL, SUPABASE_ANON_KEY)
- [ ] Build succeeds (`npm run build`)

**Post-deployment monitoring:**

- [ ] Sprawdź Supabase logs po pierwszych requestach
- [ ] Monitor error rate w dashboard
- [ ] Sprawdź query performance metrics
- [ ] Verify że RLS działa (użytkownicy nie widzą cudzych events)

**Output:** Deployed endpoint ready for production use

**Czas:** 10 minut

---

## 10. Podsumowanie implementacji

### Pliki do modyfikacji/utworzenia:

1. **src/lib/schemas/goal-event.schema.ts** (modyfikacja)
   - Dodaj `ListGoalEventsQuerySchema`

2. **src/lib/services/goal-event.service.ts** (modyfikacja)
   - Dodaj `GoalEventFilters`, `DecodedCursor` interfaces
   - Dodaj `decodeCursor()`, `encodeCursor()` helpers
   - Dodaj `listGoalEvents()` main function

3. **src/pages/api/v1/goal-events/index.ts** (modyfikacja)
   - Dodaj `GET()` handler
   - Update imports (ListGoalEventsQuerySchema, listGoalEvents, types)

### Szacowany czas implementacji:

- Faza 1 (Schema): 15 min
- Faza 2 (Service): 45 min
- Faza 3 (API Route): 30 min
- Faza 4 (Testing): 30 min
- Faza 5 (Review): 20 min
- Faza 6 (Docs): 15 min
- Faza 7 (Deployment): 10 min

**Łączny czas: ~2.5 godziny**

### Kluczowe decyzje projektowe:

1. **Cursor-based pagination** zamiast offset-based dla lepszej wydajności
2. **Fetch limit+1** do detekcji has_more zamiast osobnego COUNT query
3. **Graceful degradation** - invalid cursor → 400, nie próbujemy naprawiać
4. **Empty result → 200** zamiast 404 dla lepszego security (no enumeration)
5. **RLS enforcement** - user_id zawsze w query + RLS policy double-checks
6. **Type safety** - wykorzystanie istniejących DTOs z types.ts, brak `any`

### Potencjalne przyszłe usprawnienia:

1. **Autentykacja:** Zamień DEFAULT_USER_ID na context.locals.user.id
2. **Caching:** Dodaj client-side cache (React Query) lub CDN cache
3. **Monitoring:** Integracja z Sentry dla performance tracking
4. **Partial response:** Dodaj query param `fields` dla custom field selection
5. **Aggregations:** Dodaj endpoint dla sum/count bez pełnej listy
6. **Export:** Endpoint do eksportu pełnej historii do CSV/PDF
7. **Real-time:** WebSocket subscription dla live updates (Supabase Realtime)

---

**Końcowe uwagi:**

- Plan zakłada istniejące database schema z db-plan.md (indeksy, RLS policies)
- Endpoint jest backward compatible z przyszłą implementacją auth
- Kod jest production-ready po przejściu wszystkich faz testowania
- Security jest priorytetem - RLS + walidacja inputu na każdym poziomie
