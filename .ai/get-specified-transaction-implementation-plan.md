# API Endpoint Implementation Plan: GET /api/v1/transactions/:id

## 1. Przegląd punktu końcowego

Endpoint `GET /api/v1/transactions/:id` umożliwia pobranie szczegółów pojedynczej transakcji użytkownika na podstawie jej unikalnego identyfikatora UUID.

**Główne funkcje:**

- Pobieranie pełnych danych transakcji (przychód lub wydatek)
- Zwracanie danych z dołączoną etykietą kategorii (join z `transaction_categories`)
- Filtrowanie soft-deleted transakcji (tylko aktywne rekordy)
- Weryfikacja właściciela przez RLS i explicit check

**Przypadki użycia:**

- Wyświetlenie szczegółów transakcji w interfejsie użytkownika
- Pobranie danych przed edycją transakcji
- Weryfikacja istnienia transakcji przed operacją (np. przed DELETE)

## 2. Szczegóły żądania

### Metoda HTTP

`GET`

### Struktura URL

```
/api/v1/transactions/:id
```

### Parametry

**Path Parameters (wymagane):**

- `id` (string, UUID): Unikalny identyfikator transakcji
  - Format: UUID v4 lub v7 (np. `"550e8400-e29b-41d4-a716-446655440000"`)
  - Walidacja: musi być prawidłowym UUID zgodnym z RFC 4122

**Query Parameters:**

- Brak

**Request Headers:**

- `Content-Type`: nie dotyczy (GET bez body)
- `Authorization`: (przyszła implementacja) - obecnie używany DEFAULT_USER_ID

**Request Body:**

- Brak (metoda GET nie przyjmuje body)

### Przykład żądania

```bash
GET /api/v1/transactions/550e8400-e29b-41d4-a716-446655440000
```

## 3. Wykorzystywane typy

### DTOs (Data Transfer Objects)

**TransactionDTO** - typ zwracany przez endpoint (zdefiniowany w `src/types.ts`, linie 50-57):

```typescript
export interface TransactionDTO
  extends Pick<
    TransactionEntity,
    "id" | "type" | "category_code" | "amount_cents" | "occurred_on" | "note" | "created_at" | "updated_at"
  > {
  category_label: string; // Joined from transaction_categories.label_pl
  backdate_warning?: boolean; // Optional flag (nie używane w GET :id)
}
```

**Pola TransactionDTO:**

- `id`: string (UUID) - unikalny identyfikator transakcji
- `type`: `"INCOME" | "EXPENSE"` - typ transakcji
- `category_code`: string - kod kategorii (np. "GROCERIES", "SALARY")
- `category_label`: string - etykieta kategorii po polsku (z tabeli `transaction_categories`)
- `amount_cents`: number - kwota w groszach (integer, zawsze > 0)
- `occurred_on`: string - data wystąpienia w formacie YYYY-MM-DD
- `note`: string | null - opcjonalna notatka (max 500 znaków)
- `created_at`: string (ISO 8601 timestamp) - data utworzenia rekordu
- `updated_at`: string (ISO 8601 timestamp) - data ostatniej aktualizacji

### Error Response

**ErrorResponseDTO** - typ używany dla odpowiedzi błędów (zdefiniowany w `src/types.ts`, linie 35-40):

```typescript
export interface ErrorResponseDTO {
  error: string; // Krótki opis błędu (np. "Not Found")
  message: string; // Szczegółowy komunikat dla użytkownika
  details?: Record<string, string>; // Opcjonalne szczegóły (np. walidacja)
  retry_after_seconds?: number; // Nie używane w tym endpoincie
}
```

### Validation Schema

Należy stworzyć nową Zod schema w `src/lib/schemas/transaction.schema.ts`:

```typescript
export const GetTransactionByIdParamsSchema = z.object({
  id: z.string().uuid("Transaction ID must be a valid UUID"),
});

export type GetTransactionByIdParams = z.infer<typeof GetTransactionByIdParamsSchema>;
```

## 4. Szczegóły odpowiedzi

### Success Response: 200 OK

**Status:** `200 OK`

**Content-Type:** `application/json`

**Body:** TransactionDTO

**Przykład:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "EXPENSE",
  "category_code": "GROCERIES",
  "category_label": "Zakupy spożywcze",
  "amount_cents": 15750,
  "occurred_on": "2025-01-15",
  "note": "Zakupy w Biedronce",
  "created_at": "2025-01-15T18:30:00Z",
  "updated_at": "2025-01-15T18:30:00Z"
}
```

### Error Responses

#### 400 Bad Request - Nieprawidłowy UUID

**Warunek:** Parametr `id` nie jest prawidłowym UUID

**Body:**

```json
{
  "error": "Bad Request",
  "message": "Invalid transaction ID format",
  "details": {
    "id": "Transaction ID must be a valid UUID"
  }
}
```

#### 404 Not Found - Transakcja nie istnieje

**Warunki:**

- Transakcja o podanym ID nie istnieje w bazie
- Transakcja jest soft-deleted (`deleted_at IS NOT NULL`)
- Transakcja należy do innego użytkownika (zwracamy 404 zamiast 403 dla bezpieczeństwa)

**Body:**

```json
{
  "error": "Not Found",
  "message": "Transaction not found or has been deleted"
}
```

**Uwaga bezpieczeństwa:** Używamy tego samego komunikatu dla wszystkich przypadków 404, aby nie ujawniać informacji o istnieniu transakcji należących do innych użytkowników.

#### 500 Internal Server Error - Błąd serwera

**Warunek:** Nieoczekiwany błąd bazy danych lub serwera

**Body:**

```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred. Please try again later."
}
```

## 5. Przepływ danych

### Diagram przepływu

```
1. Client Request
   GET /api/v1/transactions/:id
   ↓
2. Astro API Route Handler
   /src/pages/api/v1/transactions/[id].ts
   ↓
3. Extract & Validate Path Parameter
   - Parse :id from context.params
   - Validate with Zod (GetTransactionByIdParamsSchema)
   ↓
4. Service Layer Call
   transaction.service.ts → getTransactionById(supabase, userId, id)
   ↓
5. Database Query (Supabase)
   - SELECT with JOIN on transaction_categories
   - WHERE user_id = :userId AND id = :id AND deleted_at IS NULL
   - RLS policy enforcement (double-check ownership)
   ↓
6. Result Mapping
   - If found: Map to TransactionDTO
   - If not found: Return null
   ↓
7. API Response
   - Success (200): Return TransactionDTO
   - Not Found (404): Return ErrorResponseDTO
   - Error (400/500): Return ErrorResponseDTO
```

### Szczegóły interakcji z bazą danych

**Tabele:**

- `transactions` (główna tabela)
- `transaction_categories` (JOIN dla category_label)

**Query SQL (pseudokod Supabase):**

```typescript
supabase
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
  `
  )
  .eq("user_id", userId)
  .eq("id", transactionId)
  .is("deleted_at", null)
  .single();
```

**Wyjaśnienie:**

- `.select()` z INNER JOIN na `transaction_categories` dla pobrania `label_pl`
- `.eq("user_id", userId)` - explicit check właściciela (oprócz RLS)
- `.eq("id", transactionId)` - filtrowanie po UUID
- `.is("deleted_at", null)` - wykluczenie soft-deleted rekordów
- `.single()` - oczekujemy dokładnie jednego wyniku lub null

**RLS (Row Level Security):**

- Polityka SELECT na tabeli `transactions` (zgodnie z db-plan.md, linie 238-239):
  - `USING (user_id = auth.uid() AND EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=auth.uid() AND p.email_confirmed))`
- W development RLS jest tymczasowo wyłączony (migracja `20251111090000_disable_rls_for_development.sql`)
- Przed produkcją RLS zostanie ponownie włączony

**Indeksy wykorzystywane (zgodnie z db-plan.md, linie 191-199):**

- `transactions_pkey(id)` - PK dla szybkiego lookup po UUID
- `idx_tx_user(user_id)` - FK index dla filtrowania właściciela
- Composite query będzie używać obu indeksów

## 6. Względy bezpieczeństwa

### Uwierzytelnianie

**Stan obecny:**

- Uwierzytelnianie jest tymczasowo wyłączone
- Używany jest `DEFAULT_USER_ID` z `supabase.client.ts`
- Docelowo: integracja z Supabase Auth

**Przyszła implementacja:**

- Middleware Astro będzie weryfikować token JWT
- Wymagane nagłówki: `Authorization: Bearer <token>`
- Brak tokenu → 401 Unauthorized

### Autoryzacja

**Obecna implementacja:**

1. **Explicit user_id check:**
   - Query zawiera `.eq("user_id", userId)`
   - Użytkownik może pobrać tylko własne transakcje

2. **RLS (Row Level Security):**
   - Polityka SELECT na `transactions` wymaga `user_id = auth.uid()`
   - Dodatkowo sprawdza `email_confirmed = true` w tabeli `profiles`
   - Dwupoziomowa ochrona: service layer + database layer

3. **Soft-delete filtering:**
   - `.is("deleted_at", null)` - ukrywa usunięte transakcje
   - Konsekwentne z resztą API

**Bezpieczeństwo odpowiedzi:**

- 404 dla nieistniejących, soft-deleted ORAZ cudzych transakcji
- Nie ujawniamy różnicy między "nie istnieje" a "nie masz dostępu"
- Zapobiega UUID enumeration attacks

### Walidacja danych wejściowych

**Walidacja UUID:**

- Zod schema: `z.string().uuid()`
- Sprawdza format RFC 4122
- Odrzuca nieprawidłowe formaty (np. zbyt krótkie, nieprawidłowe znaki)

**Sanityzacja:**

- UUID jest bezpiecznym typem (brak SQL injection przez parametryzację)
- Brak user input w query strings (tylko parametr path)

### Ochrona przed atakami

**SQL Injection:**

- Supabase query builder używa parametryzowanych zapytań
- Brak bezpośredniej konkatenacji SQL
- Ryzyko: **minimalne**

**UUID Enumeration:**

- Teoretycznie możliwe próby odgadnięcia UUID
- Mitigacja: RLS + explicit user_id check blokują dostęp
- UUIDv4/v7 mają wysoką entropię (2^122 możliwości)
- Ryzyko: **niskie**

**Timing Attacks:**

- Czas odpowiedzi może się nieznacznie różnić dla:
  - Nieistniejących transakcji (szybkie)
  - Cudzych transakcji (RLS może być wolniejszy)
- W praktyce różnica jest znikoma i trudna do wykorzystania
- Ryzyko: **bardzo niskie**

**DoS (Denial of Service):**

- Single-record query jest lekkie
- Brak paginacji ani agregacji
- Indeks PK zapewnia O(log n) lookup
- Przyszłe rate limiting w middleware/Edge Functions
- Ryzyko: **niskie**

### Zgodność z OWASP Top 10

- ✅ **A01:2021 – Broken Access Control:** RLS + explicit user_id check
- ✅ **A03:2021 – Injection:** Parametryzowane zapytania
- ✅ **A05:2021 – Security Misconfiguration:** RLS w produkcji (wymaga re-enable)
- ✅ **A07:2021 – Identification and Authentication Failures:** Przyszła integracja z Supabase Auth

## 7. Obsługa błędów

### Macierz błędów

| #   | Warunek                            | Walidacja/Check              | Status Code | Error Type            | Message                                                 | Details                                           |
| --- | ---------------------------------- | ---------------------------- | ----------- | --------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| 1   | Parametr `id` brak                 | Zod parse                    | 400         | Bad Request           | "Invalid transaction ID format"                         | `{ "id": "Transaction ID must be a valid UUID" }` |
| 2   | Parametr `id` nieprawidłowy format | Zod UUID validation          | 400         | Bad Request           | "Invalid transaction ID format"                         | `{ "id": "Transaction ID must be a valid UUID" }` |
| 3   | Transakcja nie istnieje            | Service zwraca null          | 404         | Not Found             | "Transaction not found or has been deleted"             | -                                                 |
| 4   | Transakcja soft-deleted            | Query z `deleted_at IS NULL` | 404         | Not Found             | "Transaction not found or has been deleted"             | -                                                 |
| 5   | Transakcja innego użytkownika      | RLS + `user_id` filter       | 404         | Not Found             | "Transaction not found or has been deleted"             | -                                                 |
| 6   | Błąd połączenia z bazą             | Catch database error         | 500         | Internal Server Error | "An unexpected error occurred. Please try again later." | -                                                 |
| 7   | Nieoczekiwany błąd                 | Catch all handler            | 500         | Internal Server Error | "An unexpected error occurred. Please try again later." | -                                                 |

### Strategia obsługi błędów w kodzie

**API Route Handler (`[id].ts`):**

```typescript
try {
  // 1. Parse and validate path parameter
  const params = GetTransactionByIdParamsSchema.parse(context.params);

  // 2. Call service layer
  const transaction = await getTransactionById(supabaseClient, DEFAULT_USER_ID, params.id);

  // 3. Handle not found
  if (!transaction) {
    return new Response(
      JSON.stringify({
        error: "Not Found",
        message: "Transaction not found or has been deleted",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // 4. Return success
  return new Response(JSON.stringify(transaction), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
} catch (error) {
  // Handle validation errors (400)
  if (error instanceof z.ZodError) {
    /* ... */
  }

  // Handle unexpected errors (500)
  console.error("Unexpected error in GET /api/v1/transactions/:id:", error);
  // Return 500 response
}
```

**Service Layer (`transaction.service.ts`):**

```typescript
export async function getTransactionById(
  supabase: SupabaseClient,
  userId: string,
  transactionId: string
): Promise<TransactionDTO | null> {
  const { data, error } = await supabase
    .from("transactions")
    // ... query ...
    .single();

  // Database errors are thrown and caught by API handler
  if (error) {
    // PostgresError with code PGRST116 = not found
    // We return null for consistent 404 handling
    if (error.code === "PGRST116") {
      return null;
    }
    throw error; // Other errors propagate as 500
  }

  // Not found
  if (!data) {
    return null;
  }

  // Map and return DTO
  return {
    /* ... mapped DTO ... */
  };
}
```

### Logging i monitoring

**Console logging:**

- Wszystkie nieoczekiwane błędy są logowane do console.error
- Format: `"Unexpected error in GET /api/v1/transactions/:id:"`, error
- Zawiera stack trace dla debugowania

**Informacje NIE logowane (bezpieczeństwo):**

- UUID transakcji w error logs (może ujawnić dane użytkowników)
- User IDs w public logs

**Przyszłe ulepszenia:**

- Integracja z Sentry lub innym narzędziem do error trackingu
- Structured logging z kontekstem (request ID, user ID, timestamp)
- Alerting dla wysokiej częstości 500 errors

## 8. Rozważania dotyczące wydajności

### Optymalizacje bazy danych

**Wykorzystywane indeksy:**

1. **Primary Key Index (`transactions_pkey`):**
   - Kolumna: `id`
   - Typ: B-tree (domyślny dla PK)
   - Użycie: `.eq("id", transactionId)` → O(log n) lookup
2. **Foreign Key Index (`idx_tx_user`):**
   - Kolumna: `user_id`
   - Użycie: `.eq("user_id", userId)` → filter po właścicielu

**Composite Query:**

- Query używa dwóch warunków: `user_id = X AND id = Y`
- PostgreSQL optimizer wybierze najbardziej selektywny indeks (prawdopodobnie PK)
- Złożoność: O(log n) - bardzo wydajne

**INNER JOIN na transaction_categories:**

- Tabela `transaction_categories` jest małym słownikiem (kilkanaście rekordów)
- JOIN po `category_code` (indexed via FK)
- Cost: minimalny, często cache'owane w pamięci

### Oczekiwany czas odpowiedzi

**Breakdown:**

1. Network latency (client → server): ~10-50ms (zależne od lokalizacji)
2. Astro routing + parsing: ~1-2ms
3. Zod validation: <1ms (single UUID check)
4. Supabase query:
   - Index lookup: ~1-5ms
   - JOIN: ~1ms
   - Network (app → Supabase): ~5-10ms
5. Response serialization: ~1ms
6. Network latency (server → client): ~10-50ms

**Szacowany total:** 30-120ms (p50: ~50ms, p95: ~100ms, p99: ~150ms)

**Benchmark (do weryfikacji po implementacji):**

- Local development: <30ms
- Production (same region): <50ms
- Production (cross-region): <150ms

### Potencjalne wąskie gardła

**1. Database Connection Pool:**

- **Problem:** Zbyt mało połączeń w pool → kolejkowanie
- **Mitigacja:** Supabase Free Tier domyślnie ma 15 połączeń, wystarczające dla MVP
- **Monitoring:** Sprawdzać metryki połączeń w Supabase Dashboard

**2. Cold Start (Supabase):**

- **Problem:** Pierwsze zapytanie po okresie bezczynności może być wolniejsze
- **Częstość:** Rzadka w production (tylko po dłuższej nieaktywności)
- **Czas:** +50-200ms dla pierwszego request
- **Mitigacja:** Keep-alive ping lub zwiększenie aktywności

**3. Network Latency:**

- **Problem:** Cross-region calls (user → Astro → Supabase)
- **Mitigacja:**
  - Deploy Astro app w tym samym regionie co Supabase project
  - Użycie CDN dla statycznych assets (ale API calls zawsze przez origin)

**4. RLS Overhead (w produkcji):**

- **Problem:** RLS policies dodają ~1-5ms do query time
- **Akceptowalne:** W zamian za bezpieczeństwo
- **Optymalizacja:** Upewnić się, że indeksy wspierają RLS WHERE clauses

### Strategie cache'owania

**Obecna implementacja:** Brak cache (świeże dane)

**Przyszłe możliwości:**

**1. Browser Cache:**

- Nagłówek: `Cache-Control: private, max-age=60`
- Zaleta: Zmniejsza liczbę requestów dla często przeglądanych transakcji
- Wada: Stale data (np. po edycji w innej zakładce)
- **Rekomendacja:** Nie cache'ować (transakcje mogą być edytowane)

**2. CDN Cache:**

- Nie dotyczy (endpoint per-user, nie public)

**3. Application-level Cache (Redis/Memcached):**

- Kompleksowe, overhead dla MVP
- **Rekomendacja:** Odłożyć do fazy skalowania

**4. Optimistic UI Updates:**

- Frontend może cache'ować transakcje lokalnie (localStorage/IndexedDB)
- Po edycji: invalidate cache i refetch
- **Rekomendacja:** Implementować na poziomie frontend, nie backend

### Skalowanie

**Current limits (Supabase Free Tier):**

- 500 MB database size
- 2 GB bandwidth/month
- 50,000 monthly active users

**Skalowanie pionowe (w przyszłości):**

- Upgrade Supabase plan dla więcej połączeń i resources

**Skalowanie poziome:**

- Read replicas dla high-traffic reads (Supabase Pro+)
- Load balancing na Astro instances

**Breaking point estimation:**

- Single UUID lookup: ~1000 requests/second (teoretyczne)
- Ograniczenie: Supabase Free Tier connection pool (15 połączeń)
- Praktyczne: ~100-200 concurrent requests/second

## 9. Etapy wdrożenia

### Krok 1: Rozszerzenie Zod Schema

**Plik:** `src/lib/schemas/transaction.schema.ts`

**Akcje:**

1. Dodać nową schema na końcu pliku:

   ```typescript
   /**
    * Zod schema for GET /api/v1/transactions/:id path parameters
    * Validates transaction UUID in URL path
    */
   export const GetTransactionByIdParamsSchema = z.object({
     id: z.string().uuid("Transaction ID must be a valid UUID"),
   });

   /**
    * Type inference from schema
    */
   export type GetTransactionByIdParams = z.infer<typeof GetTransactionByIdParamsSchema>;
   ```

2. Wyeksportować nową schema w istniejącym pliku (brak zmian w exports - już jest export)

**Kryteria akceptacji:**

- ✅ Schema waliduje prawidłowe UUID
- ✅ Schema odrzuca nieprawidłowe formaty (testy: "123", "", "not-a-uuid", null)
- ✅ TypeScript type inference działa poprawnie

---

### Krok 2: Implementacja funkcji `getTransactionById` w Service Layer

**Plik:** `src/lib/services/transaction.service.ts`

**Akcje:**

1. Dodać nową funkcję na końcu pliku (po `listTransactions`):

```typescript
/**
 * Get a single transaction by ID for the authenticated user
 *
 * Business logic flow:
 * 1. Query transaction with INNER JOIN on transaction_categories
 * 2. Filter by user_id (explicit ownership check)
 * 3. Filter by id (UUID)
 * 4. Filter deleted_at IS NULL (exclude soft-deleted)
 * 5. Return TransactionDTO or null if not found
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param transactionId - UUID of transaction to fetch
 * @returns Promise<TransactionDTO | null> - Transaction with category label, or null if not found
 * @throws Error - Database error (will be caught as 500)
 */
export async function getTransactionById(
  supabase: SupabaseClient,
  userId: string,
  transactionId: string
): Promise<TransactionDTO | null> {
  // Step 1: Query with JOIN on transaction_categories
  const { data, error } = await supabase
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
    `
    )
    .eq("user_id", userId)
    .eq("id", transactionId)
    .is("deleted_at", null)
    .single();

  // Step 2: Handle database errors
  if (error) {
    // Supabase returns PGRST116 for .single() when no rows found
    // We return null for consistent 404 handling in API route
    if (error.code === "PGRST116") {
      return null;
    }

    // Other database errors should propagate as 500
    throw error;
  }

  // Step 3: Handle not found (null data)
  if (!data) {
    return null;
  }

  // Step 4: Map to TransactionDTO
  return {
    id: data.id,
    type: data.type,
    category_code: data.category_code,
    category_label: (data.transaction_categories as { label_pl: string }).label_pl,
    amount_cents: data.amount_cents,
    occurred_on: data.occurred_on,
    note: data.note,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}
```

2. Dodać import typu w istniejących importach:
   ```typescript
   import type { CreateTransactionCommand, TransactionDTO, TransactionListResponseDTO } from "@/types";
   ```
   (Już istnieje, brak zmian)

**Kryteria akceptacji:**

- ✅ Funkcja zwraca `TransactionDTO` dla istniejącej transakcji użytkownika
- ✅ Funkcja zwraca `null` dla nieistniejącej transakcji
- ✅ Funkcja zwraca `null` dla soft-deleted transakcji
- ✅ Funkcja zwraca `null` dla transakcji innego użytkownika (dzięki RLS + explicit check)
- ✅ Funkcja propaguje błędy bazy danych (oprócz PGRST116)
- ✅ JOIN poprawnie pobiera `category_label`

---

### Krok 3: Utworzenie API Route Handler

**Plik:** `src/pages/api/v1/transactions/[id].ts` (nowy plik)

**Akcje:**

1. Utworzyć nowy plik w strukturze Astro dynamic routes
2. Implementować GET handler z pełną obsługą błędów:

```typescript
import type { APIContext } from "astro";
import { z } from "zod";

import { supabaseClient, DEFAULT_USER_ID } from "@/db/supabase.client";
import { GetTransactionByIdParamsSchema } from "@/lib/schemas/transaction.schema";
import { getTransactionById } from "@/lib/services/transaction.service";
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
 * GET /api/v1/transactions/:id
 *
 * Get details of a single transaction by its UUID.
 *
 * Path parameters:
 * - id: Transaction UUID (validated with Zod)
 *
 * Success response: 200 OK with TransactionDTO
 * {
 *   id: "uuid-string",
 *   type: "EXPENSE",
 *   category_code: "GROCERIES",
 *   category_label: "Zakupy spożywcze",
 *   amount_cents: 15750,
 *   occurred_on: "2025-01-15",
 *   note: "Zakupy w Biedronce",
 *   created_at: "2025-01-15T18:30:00Z",
 *   updated_at: "2025-01-15T18:30:00Z"
 * }
 *
 * Error responses:
 * - 400: Invalid transaction ID format (not a valid UUID)
 * - 404: Transaction not found or soft-deleted
 * - 500: Unexpected server error
 *
 * Note: Authentication is temporarily disabled. Using DEFAULT_USER_ID.
 * Auth will be implemented comprehensively in a future iteration.
 */
export async function GET(context: APIContext) {
  try {
    // Step 1: Parse and validate path parameter
    const params = GetTransactionByIdParamsSchema.parse(context.params);

    // Step 2: Call service layer to get transaction
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const transaction = await getTransactionById(supabaseClient, DEFAULT_USER_ID, params.id);

    // Step 3: Handle not found case
    if (!transaction) {
      const errorResponse: ErrorResponseDTO = {
        error: "Not Found",
        message: "Transaction not found or has been deleted",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 4: Return success response
    return new Response(JSON.stringify(transaction), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle Zod validation errors (400 Bad Request)
    if (error instanceof z.ZodError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid transaction ID format",
        details: formatZodErrors(error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle all other unexpected errors (500 Internal Server Error)
    // eslint-disable-next-line no-console
    console.error("Unexpected error in GET /api/v1/transactions/:id:", error);
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

**Kryteria akceptacji:**

- ✅ Handler odpowiada 200 OK z TransactionDTO dla prawidłowego UUID istniejącej transakcji
- ✅ Handler odpowiada 400 Bad Request dla nieprawidłowego UUID
- ✅ Handler odpowiada 404 Not Found dla nieistniejącej transakcji
- ✅ Handler odpowiada 404 Not Found dla soft-deleted transakcji
- ✅ Handler odpowiada 404 Not Found dla transakcji innego użytkownika
- ✅ Handler odpowiada 500 Internal Server Error dla błędów bazy danych
- ✅ Content-Type header ustawiony na `application/json`
- ✅ Błędy są logowane do console.error

---

### Krok 4: Testowanie manualne

**Narzędzie:** cURL, Postman, lub Bruno

**Test Cases:**

**TC1: Sukces - Pobranie istniejącej transakcji**

```bash
# Najpierw stwórz transakcję (POST)
curl -X POST http://localhost:4321/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "GROCERIES",
    "amount_cents": 15750,
    "occurred_on": "2025-01-15",
    "note": "Zakupy w Biedronce",
    "client_request_id": "550e8400-e29b-41d4-a716-446655440000"
  }'

# Zapisz zwrócone ID, następnie:
curl http://localhost:4321/api/v1/transactions/{TRANSACTION_ID}

# Oczekiwany wynik: 200 OK, pełne dane TransactionDTO
```

**TC2: Błąd - Nieprawidłowy UUID**

```bash
curl http://localhost:4321/api/v1/transactions/invalid-uuid-format

# Oczekiwany wynik: 400 Bad Request
# {
#   "error": "Bad Request",
#   "message": "Invalid transaction ID format",
#   "details": { "id": "Transaction ID must be a valid UUID" }
# }
```

**TC3: Błąd - Nieistniejący UUID**

```bash
curl http://localhost:4321/api/v1/transactions/00000000-0000-0000-0000-000000000000

# Oczekiwany wynik: 404 Not Found
# {
#   "error": "Not Found",
#   "message": "Transaction not found or has been deleted"
# }
```

**TC4: Błąd - Soft-deleted transakcja**

```bash
# Najpierw soft-delete transakcję (gdy DELETE będzie zaimplementowane)
# Następnie spróbuj ją pobrać:
curl http://localhost:4321/api/v1/transactions/{DELETED_TRANSACTION_ID}

# Oczekiwany wynik: 404 Not Found
```

**TC5: Weryfikacja JOIN na category_label**

```bash
curl http://localhost:4321/api/v1/transactions/{TRANSACTION_ID}

# Sprawdź, że response zawiera:
# - "category_code": "GROCERIES"
# - "category_label": "Zakupy spożywcze" (z tabeli transaction_categories)
```

**Kryteria akceptacji:**

- ✅ Wszystkie test cases przechodzą pomyślnie
- ✅ Response times < 100ms (local development)
- ✅ Brak błędów w console (oprócz expected 404/400)

---

### Krok 5: Code Review Checklist

**Przed merge do main:**

**Kod:**

- [ ] Wszystkie funkcje mają JSDoc comments
- [ ] Używane double quotes (`"`) zamiast single quotes (`'`)
- [ ] Semicolons na końcu statements
- [ ] Early returns dla error conditions
- [ ] Brak deeply nested if statements
- [ ] TypeScript types są explicit (brak `any`)

**Funkcjonalność:**

- [ ] Endpoint zwraca 200 OK dla prawidłowych requestów
- [ ] Endpoint zwraca 400 Bad Request dla nieprawidłowego UUID
- [ ] Endpoint zwraca 404 Not Found dla nieistniejących/soft-deleted/cudzych transakcji
- [ ] Endpoint zwraca 500 Internal Server Error dla błędów bazy
- [ ] JOIN poprawnie pobiera `category_label`

**Bezpieczeństwo:**

- [ ] RLS jest respektowany (explicit `user_id` check w query)
- [ ] Soft-deleted transakcje są filtrowane
- [ ] Nie ujawniamy różnicy między "nie istnieje" a "nie masz dostępu"
- [ ] Brak SQL injection (query builder z parametryzacją)
- [ ] Error messages nie zawierają wrażliwych danych

**Wydajność:**

- [ ] Query używa indeksów (PK + FK)
- [ ] INNER JOIN jest efektywny (mała tabela słownikowa)
- [ ] Brak N+1 queries
- [ ] Single query zamiast multiple roundtrips

**Testy:**

- [ ] Wszystkie manualne test cases przechodzą
- [ ] Edge cases przetestowane (invalid UUID, not found, soft-deleted)

**Dokumentacja:**

- [ ] JSDoc comments dla wszystkich funkcji
- [ ] Inline comments dla nieoczywistej logiki
- [ ] Plan implementacji zaktualizowany (jeśli były zmiany)

---

### Krok 6: Aktualizacja dokumentacji API

**Plik:** `.ai/api-plan.md`

**Akcje:**

1. Zlokalizować sekcję `GET /api/v1/transactions/:id` (linie 129-150)
2. Zweryfikować, że implementacja jest zgodna ze specyfikacją
3. Dodać uwagę o implementacji, jeśli potrzebne:
   ```markdown
   **Status implementacji:** ✅ Zaimplementowane (2025-11-16)
   ```

**Kryteria akceptacji:**

- ✅ Dokumentacja API jest aktualna
- ✅ Przykłady requestów/responses są zgodne z rzeczywistym API
- ✅ Status implementacji zaktualizowany

---

### Krok 7: Deployment i monitoring

**Pre-deployment:**

1. Uruchomić `npm run lint` - brak błędów
2. Uruchomić `npm run build` - build success
3. Zweryfikować, że RLS jest WŁĄCZONY w produkcji (nie jak w development)
   - Przeczytać `.ai/re-enable-rls-checklist.md` przed production deploy

**Deployment:**

1. Push do GitHub
2. CI/CD (jeśli skonfigurowane) automatycznie deploy
3. Jeśli manual: build i deploy do hostingu

**Post-deployment:**

1. Smoke test production endpoint:
   ```bash
   curl https://PRODUCTION_URL/api/v1/transactions/{TEST_ID}
   ```
2. Sprawdzić logi serwera - brak unexpected errors
3. Monitoring:
   - Response times (target: <150ms p95)
   - Error rates (target: <1% of requests)
   - Database connection pool usage

**Rollback plan:**

- Jeśli endpoint nie działa: revert commit i redeploy previous version
- Jeśli database issue: sprawdzić migration status, RLS policies

**Kryteria akceptacji:**

- ✅ Endpoint działa w production
- ✅ Smoke tests przechodzą
- ✅ Brak critical errors w logach

---

### Krok 8: Przyszłe ulepszenia (post-MVP)

**Do implementacji po MVP:**

1. **Uwierzytelnianie:**
   - Integracja z Supabase Auth
   - Middleware do weryfikacji JWT token
   - Zastąpić `DEFAULT_USER_ID` rzeczywistym `auth.uid()`

2. **Rate Limiting:**
   - Implementacja rate limiter (np. 100 req/min per user)
   - Użycie Edge Functions lub middleware Astro
   - Return `429 Too Many Requests` z `Retry-After` header

3. **Caching:**
   - Cache-Control headers dla optymalizacji (jeśli uzasadnione)
   - Invalidation strategy po UPDATE/DELETE

4. **Enhanced Error Tracking:**
   - Integracja z Sentry
   - Structured logging z request ID
   - Alert na wysoką częstość 500 errors

5. **Performance Monitoring:**
   - APM (Application Performance Monitoring)
   - Database query performance tracking
   - Slow query alerting

6. **Audit Logging:**
   - Logowanie wszystkich accessów do wrażliwych danych (opcjonalne)
   - Compliance z GDPR/regulations

---

## 10. Weryfikacja zgodności ze specyfikacją

### Checklist zgodności z PRD i specyfikacją API

- [x] **Endpoint URL:** GET /api/v1/transactions/:id
- [x] **Success Response:** 200 OK z TransactionDTO
- [x] **Error Response:** 404 Not Found dla nieistniejących/soft-deleted transakcji
- [x] **Walidacja UUID:** Zod schema z clear error messages
- [x] **JOIN na category_label:** INNER JOIN z transaction_categories
- [x] **Soft-delete filtering:** `.is("deleted_at", null)`
- [x] **Ownership check:** RLS + explicit `user_id` filter
- [x] **Error format:** Zgodne z ErrorResponseDTO
- [x] **Logging:** console.error dla unexpected errors
- [x] **Code style:** Double quotes, semicolons, early returns, JSDoc comments
- [x] **Security:** RLS enforcement, parametrized queries, no info leakage

### Checklist zgodności z db-plan.md

- [x] **Tabela `transactions`:** Zgodna struktura (linie 82-105)
- [x] **Indeksy:** Wykorzystanie PK i FK indexes (linie 191-199)
- [x] **RLS policy:** SELECT policy respektowana (linie 238-240)
- [x] **Soft-delete:** Filtrowanie `deleted_at IS NULL`
- [x] **JOIN na słownik:** transaction_categories (linie 18-28)

### Checklist zgodności z tech-stack.md

- [x] **Astro 5:** Dynamic route `[id].ts`
- [x] **TypeScript 5:** Strict typing, no `any`
- [x] **Supabase:** Query builder, RLS, PostgreSQL
- [x] **Zod:** Input validation
- [x] **Code style:** Double quotes, semicolons (zgodnie z workspace rules)

---

## Podsumowanie

Plan implementacji endpointu `GET /api/v1/transactions/:id` jest kompletny i gotowy do realizacji. Implementacja powinna zająć około 1-2 godzin dla doświadczonego programisty, włączając testowanie manualne.

**Kluczowe punkty:**

- ✅ Prosty endpoint do odczytu single record
- ✅ Wykorzystanie istniejącego service pattern
- ✅ Spójna obsługa błędów z resztą API
- ✅ Bezpieczeństwo przez RLS + explicit checks
- ✅ Wydajność dzięki indexed queries
- ✅ Gotowe do implementacji auth w przyszłości

**Następne kroki po implementacji:**

1. Implementacja PATCH /api/v1/transactions/:id (update)
2. Implementacja DELETE /api/v1/transactions/:id (soft-delete)
3. Integracja z frontend (React components)
4. Comprehensive auth implementation

**Pytania lub wątpliwości?**

- Szczegóły implementacji są w sekcji "Etapy wdrożenia"
- Przykłady kodu są gotowe do copy-paste z dostosowaniem
- Test cases są zdefiniowane dla weryfikacji
