# API Endpoint Implementation Plan: GET /api/v1/transactions

## 1. Przegląd punktu końcowego

Endpoint **GET /api/v1/transactions** służy do pobierania listy transakcji użytkownika z możliwością filtrowania i paginacji. Implementuje cursor-based pagination (keyset) dla wydajnego przeglądania dużych zbiorów danych.

**Główne funkcjonalności:**

- Filtrowanie po miesiącu, typie transakcji i kategorii
- Wyszukiwanie pełnotekstowe w notatkach (pg_trgm)
- Cursor-based pagination z limitem rekordów
- Agregacja metadanych (suma kwot, liczba transakcji na stronie)
- Zgodność z RLS (Row Level Security) - użytkownik widzi tylko swoje dane

**Kontekst implementacji:**

- Obecnie w trybie development z wyłączonymi politykami RLS
- Używa DEFAULT_USER_ID do testów
- Przygotowany na przyszłą pełną implementację auth z JWT

---

## 2. Szczegóły żądania

### Metoda HTTP

`GET`

### Struktura URL

```
/api/v1/transactions
```

### Query Parameters

| Parametr   | Typ    | Wymagany | Domyślnie | Opis                                                   |
| ---------- | ------ | -------- | --------- | ------------------------------------------------------ |
| `month`    | string | Nie      | -         | Filtr po miesiącu w formacie YYYY-MM (np. "2025-01")   |
| `type`     | string | Nie      | "ALL"     | Typ transakcji: "INCOME", "EXPENSE", "ALL"             |
| `category` | string | Nie      | -         | Kod kategorii do filtrowania                           |
| `search`   | string | Nie      | -         | Wyszukiwanie pełnotekstowe w notatkach                 |
| `cursor`   | string | Nie      | -         | Kursor paginacji (base64-encoded "{occurred*on}*{id}") |
| `limit`    | number | Nie      | 50        | Liczba rekordów na stronę (min: 1, max: 100)           |

### Przykładowe żądania

```http
# Pobierz 50 ostatnich transakcji
GET /api/v1/transactions

# Filtruj wydatki z stycznia 2025
GET /api/v1/transactions?month=2025-01&type=EXPENSE

# Wyszukaj transakcje z notką zawierającą "Biedronka"
GET /api/v1/transactions?search=Biedronka

# Pobierz następną stronę (20 rekordów)
GET /api/v1/transactions?cursor=MjAyNS0wMS0xNV9hYmNkZWYxMjM=&limit=20

# Filtruj po kategorii "GROCERIES" w styczniu
GET /api/v1/transactions?month=2025-01&category=GROCERIES
```

---

## 3. Wykorzystywane typy

### Istniejące typy (src/types.ts)

**TransactionListResponseDTO** - główna struktura odpowiedzi:

```typescript
interface TransactionListResponseDTO {
  data: TransactionDTO[];
  pagination: PaginationDTO;
  meta: {
    total_amount_cents: number;
    count: number;
  };
}
```

**TransactionDTO** - pojedyncza transakcja:

```typescript
interface TransactionDTO {
  id: string;
  type: "INCOME" | "EXPENSE";
  category_code: string;
  category_label: string;
  amount_cents: number;
  occurred_on: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  backdate_warning?: boolean;
}
```

**PaginationDTO** - informacje o paginacji:

```typescript
interface PaginationDTO {
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
}
```

**ErrorResponseDTO** - struktura błędów:

```typescript
interface ErrorResponseDTO {
  error: string;
  message: string;
  details?: Record<string, string>;
}
```

### Nowe typy do utworzenia

**GetTransactionsQuerySchema** (Zod schema w `src/lib/schemas/transaction.schema.ts`):

```typescript
export const GetTransactionsQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format")
    .optional(),

  type: z.enum(["INCOME", "EXPENSE", "ALL"]).default("ALL"),

  category: z.string().min(1).optional(),

  search: z.string().optional(),

  cursor: z.string().optional(),

  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type GetTransactionsQuery = z.infer<typeof GetTransactionsQuerySchema>;
```

**ListTransactionsFilters** (interface w `src/lib/services/transaction.service.ts`):

```typescript
interface ListTransactionsFilters {
  month?: string;
  type: "INCOME" | "EXPENSE" | "ALL";
  category?: string;
  search?: string;
  cursor?: string;
  limit: number;
}
```

**DecodedCursor** (internal type dla parsowania):

```typescript
interface DecodedCursor {
  occurred_on: string;
  id: string;
}
```

---

## 4. Szczegóły odpowiedzi

### Success Response: 200 OK

**Content-Type:** `application/json`

**Body:**

```json
{
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "type": "EXPENSE",
      "category_code": "GROCERIES",
      "category_label": "Zakupy spożywcze",
      "amount_cents": 15750,
      "occurred_on": "2025-01-15",
      "note": "Zakupy w Biedronce",
      "created_at": "2025-01-15T18:30:00Z",
      "updated_at": "2025-01-15T18:30:00Z"
    }
  ],
  "pagination": {
    "next_cursor": "MjAyNS0wMS0xNV8xMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDA=",
    "has_more": true,
    "limit": 50
  },
  "meta": {
    "total_amount_cents": 15750,
    "count": 1
  }
}
```

**Uwagi:**

- `data`: Tablica transakcji posortowana malejąco po (occurred_on, id)
- `pagination.next_cursor`: Base64-encoded string "{occurred*on}*{id}" ostatniego rekordu, lub null jeśli brak kolejnych stron
- `pagination.has_more`: Boolean wskazujący czy są kolejne strony
- `meta.total_amount_cents`: Suma amount_cents wszystkich transakcji na bieżącej stronie
- `meta.count`: Liczba transakcji na bieżącej stronie

### Error Responses

#### 400 Bad Request

Nieprawidłowe parametry query (walidacja Zod).

```json
{
  "error": "Bad Request",
  "message": "Invalid query parameters",
  "details": {
    "month": "Month must be in YYYY-MM format",
    "limit": "Number must be less than or equal to 100"
  }
}
```

#### 401 Unauthorized

Brak lub nieprawidłowy token JWT (obecnie wyłączone w development).

```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

#### 500 Internal Server Error

Nieoczekiwany błąd serwera lub bazy danych.

```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred. Please try again later."
}
```

---

## 5. Przepływ danych

### 1. Walidacja query parameters

```
Request → Parse URL params → Validate with Zod schema → GetTransactionsQuery
```

**Transformacje:**

- `limit`: coerce string → number, default 50
- `type`: default "ALL"
- `month`: validate format YYYY-MM
- `cursor`: decode base64 → {occurred_on, id}

### 2. Service layer - budowa zapytania

```
listTransactions(supabase, userId, filters) →
  1. Base query: SELECT from transactions + JOIN transaction_categories
  2. WHERE user_id = userId AND deleted_at IS NULL
  3. Apply filters:
     - month → WHERE month = date_trunc('month', 'YYYY-MM-01')
     - type (if not ALL) → WHERE type = 'INCOME'/'EXPENSE'
     - category → WHERE category_code = code
     - search → WHERE note ILIKE '%search%' (uses idx_tx_note_trgm)
     - cursor → WHERE (occurred_on, id) < (cursor_date, cursor_id)
  4. ORDER BY occurred_on DESC, id DESC
  5. LIMIT filters.limit + 1 (dla has_more)
  6. Execute query
```

**Wykorzystane indeksy (z db-plan.md):**

- `idx_tx_keyset(user_id, occurred_on desc, id desc)` - główny indeks paginacji
- `idx_tx_user_month(user_id, month)` - filtr miesiąca
- `idx_tx_user_type_month(user_id, type, month)` - filtr typu
- `idx_tx_user_cat_month(user_id, category_code, month)` - filtr kategorii
- `idx_tx_note_trgm` (GIN) - wyszukiwanie pełnotekstowe

### 3. Mapowanie wyników

```
Raw DB results →
  1. Detect has_more (results.length > limit)
  2. Slice to limit if needed
  3. Map to TransactionDTO[] (extract category_label from join)
  4. Calculate meta.total_amount_cents (sum of amount_cents)
  5. Calculate meta.count (data.length)
  6. Generate next_cursor (last item: base64("{occurred_on}_{id}"))
  7. Build TransactionListResponseDTO
```

### 4. Response

```
TransactionListResponseDTO → JSON.stringify → Response(200)
```

---

## 6. Względy bezpieczeństwa

### 1. Row Level Security (RLS)

- **Obecnie**: RLS wyłączone w development (migracja 20251111090000)
- **Produkcja**: RLS zapewni, że `WHERE user_id = auth.uid()` jest wymuszane na poziomie bazy
- **Polityki**: SELECT policy z warunkiem `user_id = auth.uid() AND email_confirmed = true`

### 2. SQL Injection Prevention

- Używamy Supabase query builder (nie raw SQL)
- Wszystkie parametry są escapowane automatycznie
- Walidacja Zod zapobiega przekazaniu nieprawidłowych typów

### 3. Pagination Cursor Security

- Cursor jest base64-encoded, ale **nie jest szyfrowany**
- Zawiera tylko publiczne dane (occurred_on, id)
- Walidacja struktury cursora przed użyciem
- Nieprawidłowy cursor → 400 Bad Request

### 4. DoS Prevention

- Limit max 100 rekordów na stronę
- Indeksy PostgreSQL zapewniają szybkie zapytania
- Brak możliwości wykonania kosztownych agregacji (count bez limitu)

### 5. XSS Prevention

- API zwraca surowe dane JSON
- Frontend odpowiedzialny za sanityzację przy renderowaniu
- Pole `note` może zawierać dowolny tekst (ale bez znaków kontrolnych - CHECK w DB)

### 6. Authorization

- **Obecnie**: Używany DEFAULT_USER_ID dla development
- **Produkcja**: JWT token w header `Authorization: Bearer <token>`
- Middleware weryfikuje token i ustawia `context.locals.user`

---

## 7. Obsługa błędów

### Kategorie błędów

| Scenariusz                     | Status | Error                 | Message                      | Details                                          |
| ------------------------------ | ------ | --------------------- | ---------------------------- | ------------------------------------------------ |
| Nieprawidłowy format `month`   | 400    | Bad Request           | Invalid query parameters     | { month: "Month must be in YYYY-MM format" }     |
| `limit` poza zakresem (0, 101) | 400    | Bad Request           | Invalid query parameters     | { limit: "Number must be between 1 and 100" }    |
| Nieprawidłowy format `cursor`  | 400    | Bad Request           | Invalid query parameters     | { cursor: "Invalid cursor format" }              |
| Nieprawidłowy `type`           | 400    | Bad Request           | Invalid query parameters     | { type: "Type must be INCOME, EXPENSE, or ALL" } |
| Brak autentykacji              | 401    | Unauthorized          | Authentication required      | -                                                |
| Błąd bazy danych               | 500    | Internal Server Error | An unexpected error occurred | -                                                |
| Nieoczekiwany błąd             | 500    | Internal Server Error | An unexpected error occurred | -                                                |

### Szczegółowe scenariusze

#### 1. Zod Validation Error

```typescript
if (error instanceof z.ZodError) {
  return Response(400, {
    error: "Bad Request",
    message: "Invalid query parameters",
    details: formatZodErrors(error),
  });
}
```

#### 2. Invalid Cursor Format

```typescript
// W service layer przy dekodowaniu cursora
try {
  const decoded = atob(cursor);
  const [occurred_on, id] = decoded.split("_");
  if (!occurred_on || !id || !isValidDate(occurred_on) || !isValidUUID(id)) {
    throw new ValidationError("Invalid cursor format");
  }
} catch {
  throw new ValidationError("Invalid cursor format");
}
```

#### 3. Database Error

```typescript
// Logowanie szczegółów błędu, zwrot generycznej wiadomości
console.error("Database error in GET /api/v1/transactions:", error);
return Response(500, {
  error: "Internal Server Error",
  message: "An unexpected error occurred. Please try again later.",
});
```

---

## 8. Rozważania dotyczące wydajności

### 1. Indeksy

**Wykorzystane indeksy:**

- `idx_tx_keyset(user_id, occurred_on desc, id desc) where deleted_at is null`
  - Główny indeks dla paginacji keyset
  - Częściowy (partial) - ignoruje soft-deleted
- `idx_tx_user_month(user_id, month) where deleted_at is null`
  - Optymalizuje filtr po miesiącu
- `idx_tx_note_trgm using gin (note gin_trgm_ops)`
  - Wyszukiwanie trigram w notatkach

**Koszt zapytania:**

- Bez filtrów: Index Scan na idx_tx_keyset - O(log n + limit)
- Z month: Index Scan na idx_tx_user_month - O(log n + limit)
- Z search: Bitmap Index Scan na idx_tx_note_trgm - O(matches)

### 2. Paginacja keyset (cursor-based)

**Zalety:**

- Stabilna paginacja (nowe rekordy nie przesuwają stron)
- Wydajność O(log n) niezależnie od offset
- Lepsze od OFFSET/LIMIT dla dużych zbiorów

**Implementacja:**

```sql
WHERE (occurred_on, id) < (cursor_occurred_on, cursor_id)
ORDER BY occurred_on DESC, id DESC
LIMIT 51
```

**Uwaga:** Pobieramy limit+1 rekordów, aby określić `has_more`

### 3. JOIN z transaction_categories

```sql
SELECT
  t.id, t.type, t.category_code, t.amount_cents, t.occurred_on,
  t.note, t.created_at, t.updated_at,
  tc.label_pl as category_label
FROM transactions t
INNER JOIN transaction_categories tc ON t.category_code = tc.code
```

**Koszt:** Nested Loop Join - bardzo szybki dla małej tabeli słownikowej (transaction_categories)

### 4. Agregacje metadata

**Strategia:**

- Agregujemy tylko bieżącą stronę (count, sum)
- Nie obliczamy total count dla całego zbioru (kosztowne)
- Frontend może oszacować total z pagination.has_more

```typescript
const totalAmount = data.reduce((sum, tx) => sum + tx.amount_cents, 0);
const count = data.length;
```

### 5. N+1 Problem Prevention

**Zabezpieczenie:**

- Używamy INNER JOIN zamiast osobnych zapytań
- Jedna kwerenda zwraca wszystkie dane (transakcje + labels)
- Brak dodatkowych roundtrip do bazy

### 6. Optymalizacje potencjalne

**Jeśli wydajność będzie problemem:**

- Materializowany widok dla często używanych filtrów
- Caching w Redis dla popularnych zapytań
- Partial index dla każdego typu (INCOME/EXPENSE)
- Partycjonowanie tabeli transactions po miesiącach (dla bardzo dużych zbiorów)

---

## 9. Etapy wdrożenia

### Krok 1: Rozszerzenie schematu Zod w `src/lib/schemas/transaction.schema.ts`

**Cel:** Dodać walidację query parameters dla GET endpoint

**Zadania:**

1. Dodać `GetTransactionsQuerySchema` z validacją wszystkich parametrów
2. Dodać helper function `decodeCursor(cursor: string): DecodedCursor` do dekodowania base64
3. Dodać helper function `encodeCursor(occurredOn: string, id: string): string` do enkodowania base64
4. Walidacja formatu cursora po dekodowaniu (data + UUID)

**Kod:**

```typescript
// W src/lib/schemas/transaction.schema.ts

export const GetTransactionsQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format")
    .optional(),

  type: z.enum(["INCOME", "EXPENSE", "ALL"]).default("ALL"),

  category: z.string().min(1).optional(),

  search: z.string().optional(),

  cursor: z.string().optional(),

  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type GetTransactionsQuery = z.infer<typeof GetTransactionsQuerySchema>;

/**
 * Decode base64 pagination cursor
 * Format: base64("{occurred_on}_{id}")
 */
export function decodeCursor(cursor: string): { occurred_on: string; id: string } {
  try {
    const decoded = atob(cursor);
    const parts = decoded.split("_");

    if (parts.length !== 2) {
      throw new Error("Invalid cursor structure");
    }

    const [occurred_on, id] = parts;

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurred_on)) {
      throw new Error("Invalid date in cursor");
    }

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("Invalid UUID in cursor");
    }

    return { occurred_on, id };
  } catch (error) {
    throw new Error("Invalid cursor format");
  }
}

/**
 * Encode pagination cursor to base64
 * Format: base64("{occurred_on}_{id}")
 */
export function encodeCursor(occurredOn: string, id: string): string {
  return btoa(`${occurredOn}_${id}`);
}
```

---

### Krok 2: Dodanie funkcji `listTransactions` w `src/lib/services/transaction.service.ts`

**Cel:** Implementacja logiki biznesowej pobierania i filtrowania transakcji

**Zadania:**

1. Stworzyć interface `ListTransactionsFilters`
2. Zaimplementować funkcję `listTransactions()`
3. Budowa zapytania z filtrami
4. Implementacja cursor-based pagination
5. Mapowanie wyników do DTO
6. Kalkulacja metadata

**Kod:**

```typescript
// W src/lib/services/transaction.service.ts

import { decodeCursor, encodeCursor } from "@/lib/schemas/transaction.schema";
import type { TransactionListResponseDTO, TransactionDTO } from "@/types";

/**
 * Filters for listing transactions
 */
export interface ListTransactionsFilters {
  month?: string; // YYYY-MM format
  type: "INCOME" | "EXPENSE" | "ALL";
  category?: string;
  search?: string;
  cursor?: string; // base64-encoded
  limit: number;
}

/**
 * List user transactions with filtering and pagination
 *
 * Business logic flow:
 * 1. Decode pagination cursor (if provided)
 * 2. Build query with filters (month, type, category, search)
 * 3. Apply cursor-based pagination (keyset)
 * 4. Fetch limit+1 records to detect has_more
 * 5. Map results to TransactionDTO with category_label
 * 6. Calculate metadata (count, total_amount_cents)
 * 7. Generate next_cursor from last record
 * 8. Return TransactionListResponseDTO
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user
 * @param filters - Validated filter parameters
 * @returns Promise<TransactionListResponseDTO>
 * @throws ValidationError - Invalid cursor format
 * @throws Error - Database error
 */
export async function listTransactions(
  supabase: SupabaseClient,
  userId: string,
  filters: ListTransactionsFilters
): Promise<TransactionListResponseDTO> {
  // Step 1: Decode cursor if provided
  let cursorData: { occurred_on: string; id: string } | null = null;
  if (filters.cursor) {
    try {
      cursorData = decodeCursor(filters.cursor);
    } catch (error) {
      throw new ValidationError("Invalid cursor format", {
        cursor: error instanceof Error ? error.message : "Invalid format",
      });
    }
  }

  // Step 2: Build base query with JOIN
  let query = supabase
    .from("transactions")
    .select(
      `
      id,
      type,
      category_code,
      amount_cents,
      occurred_on,
      note,
      created_at,
      updated_at,
      transaction_categories!inner(label_pl)
    `,
      { count: null } // Nie pobieramy total count (wydajność)
    )
    .eq("user_id", userId)
    .is("deleted_at", null);

  // Step 3: Apply filters

  // Month filter (convert YYYY-MM to date)
  if (filters.month) {
    const monthStart = `${filters.month}-01`;
    query = query.eq("month", monthStart);
  }

  // Type filter (INCOME/EXPENSE, skip if ALL)
  if (filters.type !== "ALL") {
    query = query.eq("type", filters.type);
  }

  // Category filter
  if (filters.category) {
    query = query.eq("category_code", filters.category);
  }

  // Search filter (trigram matching in notes)
  if (filters.search) {
    query = query.ilike("note", `%${filters.search}%`);
  }

  // Step 4: Apply cursor-based pagination
  if (cursorData) {
    // Keyset pagination: WHERE (occurred_on, id) < (cursor_date, cursor_id)
    // Supabase doesn't support tuple comparison, so we use OR logic:
    // (occurred_on < cursor_date) OR (occurred_on = cursor_date AND id < cursor_id)
    query = query.or(
      `occurred_on.lt.${cursorData.occurred_on},and(occurred_on.eq.${cursorData.occurred_on},id.lt.${cursorData.id})`
    );
  }

  // Step 5: Order and limit
  query = query
    .order("occurred_on", { ascending: false })
    .order("id", { ascending: false })
    .limit(filters.limit + 1); // +1 to detect has_more

  // Step 6: Execute query
  const { data: rawData, error } = await query;

  if (error) {
    throw error;
  }

  // Step 7: Detect has_more and slice to limit
  const hasMore = rawData.length > filters.limit;
  const transactions = hasMore ? rawData.slice(0, filters.limit) : rawData;

  // Step 8: Map to TransactionDTO[]
  const data: TransactionDTO[] = transactions.map((tx) => ({
    id: tx.id,
    type: tx.type,
    category_code: tx.category_code,
    category_label: (tx.transaction_categories as { label_pl: string }).label_pl,
    amount_cents: tx.amount_cents,
    occurred_on: tx.occurred_on,
    note: tx.note,
    created_at: tx.created_at,
    updated_at: tx.updated_at,
  }));

  // Step 9: Calculate metadata
  const totalAmountCents = data.reduce((sum, tx) => sum + tx.amount_cents, 0);
  const count = data.length;

  // Step 10: Generate next_cursor
  const nextCursor =
    hasMore && data.length > 0 ? encodeCursor(data[data.length - 1].occurred_on, data[data.length - 1].id) : null;

  // Step 11: Build response
  return {
    data,
    pagination: {
      next_cursor: nextCursor,
      has_more: hasMore,
      limit: filters.limit,
    },
    meta: {
      total_amount_cents: totalAmountCents,
      count,
    },
  };
}
```

---

### Krok 3: Implementacja GET handler w `src/pages/api/v1/transactions/index.ts`

**Cel:** Dodać obsługę GET request w istniejącym pliku endpointu

**Zadania:**

1. Dodać funkcję `GET(context: APIContext)`
2. Parsowanie i walidacja query parameters
3. Wywołanie service layer
4. Obsługa błędów (400, 500)
5. Zwrot odpowiedzi 200 OK

**Kod:**

```typescript
// W src/pages/api/v1/transactions/index.ts

// Dodaj import
import { GetTransactionsQuerySchema } from "@/lib/schemas/transaction.schema";
import { listTransactions } from "@/lib/services/transaction.service";

/**
 * GET /api/v1/transactions
 *
 * List user transactions with filtering and pagination.
 *
 * Query parameters:
 * - month (optional): Filter by month in YYYY-MM format
 * - type (optional): Filter by type (INCOME, EXPENSE, ALL) - default: ALL
 * - category (optional): Filter by category code
 * - search (optional): Full-text search in notes
 * - cursor (optional): Pagination cursor (base64-encoded)
 * - limit (optional): Records per page (default: 50, max: 100)
 *
 * Success response: 200 OK with TransactionListResponseDTO
 * Error responses:
 * - 400: Invalid query parameters
 * - 500: Unexpected server error
 *
 * Note: Authentication is temporarily disabled. Using DEFAULT_USER_ID.
 */
export async function GET(context: APIContext) {
  try {
    // Parse query parameters from URL
    const url = new URL(context.request.url);
    const queryParams = {
      month: url.searchParams.get("month") || undefined,
      type: url.searchParams.get("type") || undefined,
      category: url.searchParams.get("category") || undefined,
      search: url.searchParams.get("search") || undefined,
      cursor: url.searchParams.get("cursor") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    };

    // Validate with Zod schema
    const filters = GetTransactionsQuerySchema.parse(queryParams);

    // Call service layer to list transactions
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const result = await listTransactions(supabaseClient, DEFAULT_USER_ID, filters);

    // Return 200 OK with TransactionListResponseDTO
    return new Response(JSON.stringify(result), {
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

    // Handle business validation errors (400 Bad Request for cursor)
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
    console.error("Unexpected error in GET /api/v1/transactions:", error);
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

---

### Krok 4: Testowanie lokalne

**Cel:** Weryfikacja poprawności implementacji przed wdrożeniem

**Zadania:**

1. Uruchomić dev server (`npm run dev`)
2. Testować podstawowe scenariusze z curl/Postman
3. Weryfikować poprawność odpowiedzi i błędów
4. Sprawdzić performance z różnymi filtrami

**Scenariusze testowe:**

```bash
# Test 1: Pobierz wszystkie transakcje (domyślne)
curl http://localhost:4321/api/v1/transactions

# Test 2: Filtr po miesiącu
curl "http://localhost:4321/api/v1/transactions?month=2025-01"

# Test 3: Filtr po typie
curl "http://localhost:4321/api/v1/transactions?type=EXPENSE"

# Test 4: Filtr po kategorii
curl "http://localhost:4321/api/v1/transactions?category=GROCERIES"

# Test 5: Wyszukiwanie
curl "http://localhost:4321/api/v1/transactions?search=Biedronka"

# Test 6: Paginacja z limitem
curl "http://localhost:4321/api/v1/transactions?limit=10"

# Test 7: Paginacja z cursorem (użyj next_cursor z poprzedniego response)
curl "http://localhost:4321/api/v1/transactions?cursor=MjAyNS0wMS0xNV9hYmNkZWYxMjM="

# Test 8: Kombinacja filtrów
curl "http://localhost:4321/api/v1/transactions?month=2025-01&type=EXPENSE&limit=20"

# Test 9: Nieprawidłowy format miesiąca (400)
curl "http://localhost:4321/api/v1/transactions?month=2025-1"

# Test 10: Limit poza zakresem (400)
curl "http://localhost:4321/api/v1/transactions?limit=150"

# Test 11: Nieprawidłowy cursor (400)
curl "http://localhost:4321/api/v1/transactions?cursor=invalid"
```

**Oczekiwane rezultaty:**

- Testy 1-8: Status 200, poprawne dane w TransactionListResponseDTO
- Testy 9-11: Status 400, ErrorResponseDTO z details

---

### Krok 5: Weryfikacja wydajności

**Cel:** Upewnić się, że zapytania są wydajne i wykorzystują indeksy

**Zadania:**

1. Sprawdzić plany wykonania zapytań (EXPLAIN ANALYZE)
2. Zweryfikować użycie indeksów
3. Przetestować z większą ilością danych (seed data)
4. Zmierzyć czasy odpowiedzi

**Weryfikacja w Supabase SQL Editor:**

```sql
-- Test 1: Query bez filtrów (powinien użyć idx_tx_keyset)
EXPLAIN ANALYZE
SELECT
  t.id, t.type, t.category_code, t.amount_cents,
  t.occurred_on, t.note, t.created_at, t.updated_at,
  tc.label_pl
FROM transactions t
INNER JOIN transaction_categories tc ON t.category_code = tc.code
WHERE t.user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND t.deleted_at IS NULL
ORDER BY t.occurred_on DESC, t.id DESC
LIMIT 50;

-- Spodziewany plan: Index Scan using idx_tx_keyset

-- Test 2: Query z filtrem miesiąca (powinien użyć idx_tx_user_month)
EXPLAIN ANALYZE
SELECT
  t.id, t.type, t.category_code, t.amount_cents,
  t.occurred_on, t.note, t.created_at, t.updated_at,
  tc.label_pl
FROM transactions t
INNER JOIN transaction_categories tc ON t.category_code = tc.code
WHERE t.user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND t.deleted_at IS NULL
  AND t.month = '2025-01-01'
ORDER BY t.occurred_on DESC, t.id DESC
LIMIT 50;

-- Spodziewany plan: Index Scan using idx_tx_user_month

-- Test 3: Query z wyszukiwaniem (powinien użyć idx_tx_note_trgm)
EXPLAIN ANALYZE
SELECT
  t.id, t.type, t.category_code, t.amount_cents,
  t.occurred_on, t.note, t.created_at, t.updated_at,
  tc.label_pl
FROM transactions t
INNER JOIN transaction_categories tc ON t.category_code = tc.code
WHERE t.user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND t.deleted_at IS NULL
  AND t.note ILIKE '%Biedronka%'
ORDER BY t.occurred_on DESC, t.id DESC
LIMIT 50;

-- Spodziewany plan: Bitmap Heap Scan + Bitmap Index Scan using idx_tx_note_trgm
```

**Metryki akceptowalne:**

- Czas odpowiedzi < 100ms dla typowych zapytań
- Index Scan (nie Seq Scan) dla głównych filtrów
- Nested Loop Join dla transaction_categories

---

### Krok 6: Dokumentacja i cleanup

**Cel:** Finalizacja implementacji z dokumentacją

**Zadania:**

1. Dodać JSDoc comments do wszystkich funkcji
2. Zaktualizować README (jeśli potrzebne)
3. Sprawdzić linting (`npm run lint`)
4. Sformatować kod (`npm run format`)
5. Commit z opisowym message

**Commit message:**

```
feat: implement GET /api/v1/transactions endpoint

- Add GetTransactionsQuerySchema for query parameter validation
- Implement listTransactions service function with filtering and pagination
- Add cursor-based (keyset) pagination support
- Support filters: month, type, category, search
- Include metadata: count and total_amount_cents per page
- Add comprehensive error handling (400, 500)

Related: #[issue-number]
```

---

## 10. Potencjalne rozszerzenia

### Przyszłe ulepszenia (poza MVP):

1. **Sorting options**
   - Dodać parametr `sort_by`: amount, date, category
   - Dodać parametr `sort_order`: asc, desc

2. **Date range filtering**
   - Dodać `date_from` i `date_to` zamiast tylko `month`

3. **Aggregations endpoint**
   - Osobny endpoint `/api/v1/transactions/stats` dla agregacji bez paginacji
   - Total count, sum, average per category/month

4. **Caching**
   - Redis cache dla często używanych filtrów
   - Cache invalidation przy CREATE/UPDATE/DELETE

5. **Export functionality**
   - CSV/Excel export z wszystkimi transakcjami (bez paginacji)
   - Osobny endpoint `/api/v1/transactions/export`

6. **GraphQL alternative**
   - Rozważyć GraphQL dla bardziej elastycznego querying
   - Hasura + Supabase integration

---

## 11. Checklist wdrożenia

- [ ] **Krok 1**: Rozszerzenie `transaction.schema.ts` z `GetTransactionsQuerySchema`
- [ ] **Krok 2**: Dodanie funkcji `listTransactions()` w `transaction.service.ts`
- [ ] **Krok 3**: Implementacja GET handler w `index.ts`
- [ ] **Krok 4**: Testowanie lokalne wszystkich scenariuszy
- [ ] **Krok 5**: Weryfikacja wydajności (EXPLAIN ANALYZE)
- [ ] **Krok 6**: Linting, formatting, dokumentacja
- [ ] **Krok 7**: Code review
- [ ] **Krok 8**: Merge do main branch
- [ ] **Krok 9**: Deploy i smoke test na staging
- [ ] **Krok 10**: Deploy na produkcję

---

## 12. Zależności i wymagania

### Wymagane pakiety (już zainstalowane):

- `@supabase/supabase-js` - klient Supabase
- `zod` - walidacja schematów
- `astro` - framework

### Wymagane migracje bazodanowe (już zastosowane):

- `20251109120000_create_base_schema.sql` - tabela transactions
- `20251109120100_create_business_tables.sql` - tabela transaction_categories
- `20251109120200_create_auxiliary_tables.sql` - indeksy
- `20251111090000_disable_rls_for_development.sql` - RLS disabled (dev only)

### Brak dodatkowych zależności!

---

## 13. Uwagi końcowe

### Zgodność z wymaganiami PRD:

- ✅ Cursor-based pagination (stabilna, wydajna)
- ✅ Filtrowanie po miesiącu, typie, kategorii
- ✅ Wyszukiwanie pełnotekstowe (pg_trgm)
- ✅ Metadata per page (count, total_amount)
- ✅ Zgodność z RLS (gotowe na auth)
- ✅ Walidacja Zod wszystkich parametrów
- ✅ Spójny format błędów (ErrorResponseDTO)
- ✅ Wykorzystanie indeksów dla wydajności

### Rozwój w przyszłości:

- Re-enable RLS po implementacji auth middleware
- Dodać testy jednostkowe i integracyjne
- Monitoring i alerting dla błędów 500
- Rate limiting dla API (3 requests/30s zgodnie z PRD)

### Pytania do rozważenia:

1. Czy potrzebujemy total count dla całego zbioru? (wydajność vs UX)
2. Czy `backdate_warning` powinno być ustawiane w GET? (wymaga porównania month)
3. Czy search powinno używać full-text search czy ILIKE? (obecnie ILIKE)
