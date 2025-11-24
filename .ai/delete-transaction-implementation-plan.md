# API Endpoint Implementation Plan: DELETE /api/v1/transactions/:id

## 1. Przegląd punktu końcowego

Endpoint DELETE /api/v1/transactions/:id wykonuje **soft-delete** transakcji należącej do uwierzytelnionego użytkownika. Operacja nie usuwa fizycznie rekordu z bazy danych, a jedynie ustawia pola `deleted_at` i `deleted_by`, co pozwala na późniejsze odzyskanie danych lub audyt. Po pomyślnym usunięciu endpoint zwraca kod statusu `204 No Content` bez zawartości w body odpowiedzi.

**Kluczowe cechy:**

- Soft-delete (nie hard-delete) - rekord pozostaje w bazie
- Idempotentność - wielokrotne wywołanie na tej samej transakcji zwraca 404
- Ownership validation - użytkownik może usunąć tylko swoje transakcje
- Audit trail - operacja jest rejestrowana w `audit_log` przez trigger bazy danych
- Wpływ na agregaty - usunięcie transakcji wpływa na `monthly_metrics` (poprzez triggery)

---

## 2. Szczegóły żądania

### Metoda HTTP

`DELETE`

### Struktura URL

```
DELETE /api/v1/transactions/:id
```

### Path Parameters

| Parametr | Typ           | Wymagany | Opis                                  | Walidacja                    |
| -------- | ------------- | -------- | ------------------------------------- | ---------------------------- |
| `id`     | string (UUID) | ✅ Tak   | Identyfikator transakcji do usunięcia | Musi być prawidłowym UUID v4 |

### Request Headers

```
Authorization: Bearer <jwt-token>  // Będzie używane po implementacji auth
Content-Type: application/json     // Opcjonalnie (DELETE nie ma body)
```

### Request Body

**Brak** - endpoint DELETE nie przyjmuje żadnego body.

### Przykład żądania

```bash
DELETE /api/v1/transactions/a1b2c3d4-e5f6-7890-abcd-ef1234567890
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 3. Wykorzystywane typy

### Typy DTO (z `src/types.ts`)

#### ErrorResponseDTO

```typescript
export interface ErrorResponseDTO {
  error: string; // Krótki identyfikator błędu (np. "Not Found")
  message: string; // Czytelny opis błędu dla użytkownika
  details?: Record<string, string>; // Opcjonalne szczegóły błędu walidacji
}
```

### Schema walidacji (do stworzenia w `src/lib/schemas/transaction.schema.ts`)

#### DeleteTransactionParamsSchema

```typescript
/**
 * Zod schema for DELETE /api/v1/transactions/:id path parameters
 * Validates transaction UUID in URL path
 */
export const DeleteTransactionParamsSchema = z.object({
  id: z.string().uuid("Transaction ID must be a valid UUID"),
});

/**
 * Type inference from schema
 */
export type DeleteTransactionParams = z.infer<typeof DeleteTransactionParamsSchema>;
```

**Uwaga:** Ta schema jest identyczna jak `GetTransactionByIdParamsSchema` - można wykorzystać istniejącą lub stworzyć osobną dla większej jasności kodu.

### Service function signature (do stworzenia w `src/lib/services/transaction.service.ts`)

```typescript
/**
 * Soft-deletes a transaction for the authenticated user
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user or DEFAULT_USER_ID)
 * @param transactionId - UUID of transaction to soft-delete
 * @returns Promise<boolean> - true if deleted, false if not found or already deleted
 * @throws Error - Database error (will be caught as 500)
 */
export async function deleteTransaction(
  supabase: SupabaseClient,
  userId: string,
  transactionId: string
): Promise<boolean>;
```

---

## 4. Szczegóły odpowiedzi

### Success Response

#### 204 No Content

Transakcja została pomyślnie usunięta (soft-delete).

**Headers:**

```
HTTP/1.1 204 No Content
Content-Length: 0
```

**Body:** Brak (pusta odpowiedź)

**Uwaga:** Kod 204 jest standardem dla DELETE operations które nie zwracają żadnej zawartości. Klient powinien sprawdzić tylko kod statusu.

---

### Error Responses

#### 400 Bad Request

Nieprawidłowy format UUID w path parameter.

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

**Przykładowe przyczyny:**

- `id` nie jest prawidłowym UUID (np. `"123"`, `"abc-def-ghi"`)
- `id` jest pusty lub null

---

#### 404 Not Found

Transakcja nie istnieje, jest już usunięta lub należy do innego użytkownika.

**Body:**

```json
{
  "error": "Not Found",
  "message": "Transaction not found or has been deleted"
}
```

**Przykładowe przyczyny:**

- Transakcja o podanym UUID nie istnieje w bazie
- Transakcja została już wcześniej usunięta (`deleted_at IS NOT NULL`)
- Transakcja należy do innego użytkownika (ownership check failed)

**Uwaga bezpieczeństwa:** Komunikat jest celowo ogólny aby nie ujawniać czy transakcja faktycznie istnieje w systemie (zapobiega information disclosure).

---

#### 401 Unauthorized (future - gdy auth będzie włączony)

Brak lub nieprawidłowy token JWT.

**Body:**

```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

---

#### 500 Internal Server Error

Nieoczekiwany błąd serwera (np. błąd połączenia z bazą danych).

**Body:**

```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred. Please try again later."
}
```

**Logi serwera:** Szczegóły błędu powinny być zalogowane w konsoli (`console.error`) dla celów debugowania.

---

## 5. Przepływ danych

### Diagram przepływu

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Client Request                                            │
│    DELETE /api/v1/transactions/:id                           │
│    Authorization: Bearer <token>                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Astro API Route Handler (src/pages/api/v1/transactions/  │
│    [id].ts - DELETE function)                                │
│                                                              │
│    a) Parse & validate path parameter with Zod              │
│       - DeleteTransactionParamsSchema.parse(context.params) │
│       - Throws ZodError jeśli invalid UUID                  │
│                                                              │
│    b) Extract user context                                   │
│       - userId = DEFAULT_USER_ID (temporary)                 │
│       - supabase = supabaseClient                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Service Layer (src/lib/services/transaction.service.ts)  │
│    deleteTransaction(supabase, userId, transactionId)        │
│                                                              │
│    a) Execute soft-delete UPDATE query:                      │
│       UPDATE transactions                                     │
│       SET deleted_at = now(),                                │
│           deleted_by = userId,                               │
│           updated_at = now(),                                │
│           updated_by = userId                                │
│       WHERE id = transactionId                               │
│         AND user_id = userId                                 │
│         AND deleted_at IS NULL                               │
│                                                              │
│    b) Check affected rows:                                   │
│       - If count > 0: return true                            │
│       - If count = 0: return false (not found/already deleted)│
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. PostgreSQL Database (Supabase)                           │
│                                                              │
│    a) RLS Policies - sprawdzają ownership (user_id = auth.uid())│
│                                                              │
│    b) UPDATE transaction:                                    │
│       - Ustawia deleted_at, deleted_by, updated_at, updated_by│
│       - Zwraca liczbę zaktualizowanych wierszy              │
│                                                              │
│    c) Triggers (automatyczne):                               │
│       - Audit Log Trigger: zapisuje do audit_log            │
│         * entity_type: "transaction"                         │
│         * action: "DELETE"                                   │
│         * before: { deleted_at: null, ... }                  │
│         * after: { deleted_at: timestamp, ... }              │
│                                                              │
│       - Monthly Metrics Trigger: aktualizuje monthly_metrics │
│         * Odejmuje amount_cents od income_cents/expenses_cents│
│         * Przelicza net_saved_cents, free_cash_flow_cents    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. API Response Handler                                      │
│                                                              │
│    If deleteTransaction returned true:                       │
│      → Return 204 No Content (empty body)                    │
│                                                              │
│    If deleteTransaction returned false:                      │
│      → Return 404 Not Found with ErrorResponseDTO           │
│                                                              │
│    If ZodError caught:                                       │
│      → Return 400 Bad Request with ErrorResponseDTO         │
│                                                              │
│    If unexpected Error caught:                               │
│      → Log error to console                                  │
│      → Return 500 Internal Server Error with ErrorResponseDTO│
└─────────────────────────────────────────────────────────────┘
```

### Interakcje z bazą danych

#### Query soft-delete (w service layer)

```sql
UPDATE transactions
SET
  deleted_at = now(),
  deleted_by = $1,     -- userId
  updated_at = now(),
  updated_by = $1      -- userId
WHERE
  id = $2              -- transactionId
  AND user_id = $1     -- userId (ownership check)
  AND deleted_at IS NULL  -- nie usuwaj już usuniętych
RETURNING id;
```

**Uwaga:** Użycie `RETURNING id` pozwala sprawdzić czy UPDATE faktycznie zaktualizował wiersz.

#### Wpływ na monthly_metrics (przez trigger)

Po wykonaniu soft-delete, trigger automatycznie aktualizuje `monthly_metrics`:

```sql
-- Przykładowy trigger logic (uproszczony)
UPDATE monthly_metrics
SET
  expenses_cents = expenses_cents - [deleted_transaction.amount_cents],  -- jeśli EXPENSE
  income_cents = income_cents - [deleted_transaction.amount_cents],      -- jeśli INCOME
  free_cash_flow_cents = income_cents - expenses_cents - net_saved_cents,
  refreshed_at = now()
WHERE
  user_id = [deleted_transaction.user_id]
  AND month = date_trunc('month', [deleted_transaction.occurred_on]);
```

---

## 6. Względy bezpieczeństwa

### 6.1 Autentykacja i autoryzacja

#### Obecnie (MVP)

- **Temporary workaround:** Używamy `DEFAULT_USER_ID` zdefiniowanego w `supabase.client.ts`
- **Uwaga:** To rozwiązanie tymczasowe tylko dla fazy rozwoju, **NIE DEPLOYOWAĆ NA PRODUKCJĘ**

#### Docelowo (po implementacji auth)

- **Autentykacja:** JWT token z Supabase Auth w header `Authorization: Bearer <token>`
- **Middleware:** `src/middleware/index.ts` waliduje token i ustawia `context.locals.user`
- **Service layer:** Pobiera `userId` z `context.locals.user.id` zamiast `DEFAULT_USER_ID`

```typescript
// Docelowy kod w DELETE handler
const userId = context.locals.user?.id;
if (!userId) {
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
```

### 6.2 Row Level Security (RLS)

#### Polityka RLS dla transactions (już skonfigurowana w db-plan.md)

**UPDATE Policy:**

```sql
CREATE POLICY transactions_update_policy
ON transactions
FOR UPDATE
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
    AND p.email_confirmed = true
  )
)
WITH CHECK (
  user_id = auth.uid()
);
```

**Efekt:**

- Użytkownik może modyfikować (w tym soft-delete) tylko swoje transakcje
- Wymaga potwierdzonego emaila (`email_confirmed = true`)
- Blokuje zmianę `user_id` na innego użytkownika

### 6.3 Ownership validation

#### W service layer (explicit check)

```typescript
// Fragment deleteTransaction function
const { data, error } = await supabase
  .from("transactions")
  .update({
    deleted_at: new Date().toISOString(),
    deleted_by: userId,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  })
  .eq("id", transactionId)
  .eq("user_id", userId) // ✅ Explicit ownership check
  .is("deleted_at", null) // ✅ Zapobiega double-delete
  .select("id")
  .single();
```

**Dlaczego explicit check mimo RLS?**

- **Defense in depth:** Podwójna warstwa bezpieczeństwa
- **Lepsze error messages:** Możemy rozróżnić 404 (not found) od 403 (forbidden)
- **Testowanie:** Łatwiejsze unit testy bez pełnej konfiguracji RLS

### 6.4 Information disclosure prevention

#### Ogólny komunikat błędu

```json
{
  "error": "Not Found",
  "message": "Transaction not found or has been deleted"
}
```

**Dlaczego nie szczegółowy komunikat?**

- ❌ NIE: "Transaction exists but belongs to another user" → ujawnia istnienie transakcji
- ❌ NIE: "Transaction was already deleted" → ujawnia historię operacji
- ✅ TAK: Ogólny komunikat dla wszystkich przypadków 404

### 6.5 Idempotency

#### Wielokrotne wywołanie DELETE

```
DELETE /api/v1/transactions/:id  (1st time) → 204 No Content ✅
DELETE /api/v1/transactions/:id  (2nd time) → 404 Not Found  ✅
```

**Implementacja:**

- Query zawiera `WHERE deleted_at IS NULL`
- Jeśli transakcja jest już usunięta, query nie zaktualizuje żadnego wiersza
- Service zwraca `false` → API zwraca 404

**Zaleta:** Klient może bezpiecznie ponowić żądanie w przypadku timeoutu.

### 6.6 SQL Injection prevention

#### Parametryzowane zapytania

```typescript
// ✅ Bezpieczne - Supabase automatycznie parametryzuje
.eq("id", transactionId)
.eq("user_id", userId)

// ❌ NIGDY tak nie rób (raw SQL)
.select(`* WHERE id = '${transactionId}'`)
```

**Ochrona:**

- Supabase automatycznie używa prepared statements
- Zod waliduje format UUID przed wysłaniem do bazy
- Baza danych ma typ `uuid` - dodatkowa walidacja na poziomie DB

---

## 7. Obsługa błędów

### Tabela scenariuszy błędów

| Scenariusz                  | Kod | Error                   | Message                                                 | Details                                         | Logi serwera            |
| --------------------------- | --- | ----------------------- | ------------------------------------------------------- | ----------------------------------------------- | ----------------------- |
| **Nieprawidłowy UUID**      | 400 | "Bad Request"           | "Invalid transaction ID format"                         | `{ id: "Transaction ID must be a valid UUID" }` | ❌ Nie (expected error) |
| **Transakcja nie istnieje** | 404 | "Not Found"             | "Transaction not found or has been deleted"             | -                                               | ❌ Nie (expected error) |
| **Już usunięta**            | 404 | "Not Found"             | "Transaction not found or has been deleted"             | -                                               | ❌ Nie (expected error) |
| **Nie należy do usera**     | 404 | "Not Found"             | "Transaction not found or has been deleted"             | -                                               | ❌ Nie (expected error) |
| **Błąd połączenia DB**      | 500 | "Internal Server Error" | "An unexpected error occurred. Please try again later." | -                                               | ✅ Tak (console.error)  |
| **Timeout DB**              | 500 | "Internal Server Error" | "An unexpected error occurred. Please try again later." | -                                               | ✅ Tak (console.error)  |
| **RLS violation**           | 500 | "Internal Server Error" | "An unexpected error occurred. Please try again later." | -                                               | ✅ Tak (console.error)  |

### Implementacja error handling w API route

```typescript
export async function DELETE(context: APIContext) {
  try {
    // Step 1: Validate path parameter
    const params = DeleteTransactionParamsSchema.parse(context.params);

    // Step 2: Get user context
    const userId = DEFAULT_USER_ID; // TODO: Replace with context.locals.user.id

    // Step 3: Call service layer
    const deleted = await deleteTransaction(supabaseClient, userId, params.id);

    // Step 4: Handle not found
    if (!deleted) {
      const errorResponse: ErrorResponseDTO = {
        error: "Not Found",
        message: "Transaction not found or has been deleted",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 5: Return success (204 No Content)
    return new Response(null, {
      status: 204,
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
    console.error("Unexpected error in DELETE /api/v1/transactions/:id:", error);
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

### Helper function formatZodErrors (już istnieje w [id].ts)

```typescript
function formatZodErrors(error: z.ZodError): Record<string, string> {
  const formatted: Record<string, string> = {};
  error.errors.forEach((err) => {
    const path = err.path.join(".");
    formatted[path] = err.message;
  });
  return formatted;
}
```

---

## 8. Rozważania dotyczące wydajności

### 8.1 Optymalizacja zapytań

#### Single UPDATE query

```typescript
// ✅ Efektywne - jedna operacja UPDATE
const { data } = await supabase
  .from("transactions")
  .update({
    /* ... */
  })
  .eq("id", transactionId)
  .eq("user_id", userId)
  .is("deleted_at", null)
  .select("id")
  .single();

// ❌ NIE ROBIMY - dwa roundtripy do bazy
// const existing = await supabase.from("transactions").select("*").eq("id", id).single();
// await supabase.from("transactions").update({ deleted_at: now() }).eq("id", id);
```

**Zalety:**

- Jeden roundtrip do bazy danych
- Atomiczność - operacja albo się uda całkowicie, albo nie
- Mniej obciążenia sieci i bazy

#### Użycie indeksów

**Indeksy z db-plan.md wykorzystywane w query:**

- `transactions_pkey(id)` - PRIMARY KEY lookup (bardzo szybki)
- `idx_tx_user(user_id)` - FK index (używany w WHERE user_id = ...)
- `idx_tx_keyset(user_id, occurred_on desc, id desc) WHERE deleted_at IS NULL` - composite index dla filtrowania

**Query plan (uproszczony):**

```
Index Scan using transactions_pkey on transactions
  Filter: (user_id = $1 AND deleted_at IS NULL)
  Estimated cost: 0.29..8.31 (bardzo niski - single-row lookup)
```

### 8.2 Triggery i ich wpływ

#### Audit Log Trigger

```sql
-- Trigger wykonuje INSERT do audit_log
-- Koszt: ~5-10ms dodatkowego czasu
INSERT INTO audit_log (owner_user_id, actor_user_id, entity_type, ...)
VALUES (...);
```

**Optymalizacja:**

- Trigger używa `AFTER UPDATE` - nie blokuje głównej operacji
- Insert do audit_log jest prosty (brak JOIN-ów)
- Indeks `idx_al_owner_time` przyspiesza późniejsze odczyty logu

#### Monthly Metrics Trigger

```sql
-- Trigger aktualizuje agregaty w monthly_metrics
-- Koszt: ~10-20ms (UPDATE z WHERE user_id + month)
UPDATE monthly_metrics
SET expenses_cents = expenses_cents - OLD.amount_cents, ...
WHERE user_id = OLD.user_id AND month = date_trunc('month', OLD.occurred_on);
```

**Optymalizacja:**

- Composite primary key `(user_id, month)` daje szybki lookup
- Agregaty są już precomputed - brak konieczności SUM() po całej tabeli
- W przypadku braku rekordu w monthly_metrics, trigger może go stworzyć (upsert)

**Całkowity czas DELETE operation:**

- UPDATE transaction: ~5ms
- Audit log trigger: ~5-10ms
- Monthly metrics trigger: ~10-20ms
- **Łącznie: ~20-35ms** (akceptowalne dla operacji write)

### 8.3 Soft-delete vs Hard-delete

#### Dlaczego soft-delete?

**Zalety:**

- ✅ Możliwość odzyskania danych (customer support)
- ✅ Audit trail - widzimy historię zmian
- ✅ Zgodność z GDPR "right to be forgotten" (możemy później hard-delete po 30 dniach)
- ✅ Bezpieczne dla relacji (nie psuje FK constraints)

**Wady i mitigacje:**

- ❌ Wolniejsze query przez `WHERE deleted_at IS NULL`
  - ✅ Mitigacja: Partial index `WHERE deleted_at IS NULL`
- ❌ Większe zużycie storage
  - ✅ Mitigacja: Okresowy job czyszczący stare soft-deleted records (np. po 90 dniach)
- ❌ Trzeba pamiętać o filtrowaniu w każdym query
  - ✅ Mitigacja: Polityki RLS automatycznie filtrują

#### Partial index dla soft-deleted records

```sql
-- Index tylko dla aktywnych transakcji (db-plan.md)
CREATE INDEX idx_tx_keyset
ON transactions (user_id, occurred_on DESC, id DESC)
WHERE deleted_at IS NULL;
```

**Efekt:**

- Index jest mniejszy (nie zawiera usuniętych transakcji)
- Query na aktywnych transakcjach są szybsze
- Soft-deleted records nie spowalniają głównych operacji

### 8.4 Rate limiting (future consideration)

#### Ochrona przed abuse

**Scenariusz ataku:**

```
DELETE /api/v1/transactions/:id1  (repeat 1000x/sec)
DELETE /api/v1/transactions/:id2
...
```

**Mitigacje:**

1. **Edge Function rate limiter** (Supabase Edge Functions mają built-in rate limiting)
2. **Tabela `rate_limits`** w bazie (db-plan.md) - do limitu 3/30min dla verify/reset (nie dla DELETE)
3. **Application-level throttling** - middleware w Astro może ograniczać requests per user
4. **Monitoring** - alert gdy user wykonuje >100 DELETE/min

**Dla MVP:** Bazowy rate limiting Supabase (60 req/min per IP) powinien wystarczyć.

### 8.5 Monitoring i metryki

#### Kluczowe metryki do śledzenia:

| Metryka                     | Cel     | Alert threshold                  |
| --------------------------- | ------- | -------------------------------- |
| Response time (p95)         | < 100ms | > 200ms                          |
| Error rate 5xx              | < 0.1%  | > 1%                             |
| Error rate 4xx              | < 5%    | > 20%                            |
| Delete operations/user/day  | ~5-10   | > 50 (possible abuse)            |
| Soft-deleted records growth | Linear  | Exponential (cleanup job failed) |

#### Implementacja (future):

- **Logging:** `console.error` dla 500 errors
- **APM:** Supabase ma built-in monitoring dashboard
- **Custom metrics:** Edge Function może wysyłać metryki do zewnętrznego service (np. PostHog)

---

## 9. Etapy wdrożenia

### Krok 1: Dodanie schema walidacji

**Plik:** `src/lib/schemas/transaction.schema.ts`

**Zadanie:** Dodaj Zod schema do walidacji path parameter `id` w DELETE request.

```typescript
/**
 * Zod schema for DELETE /api/v1/transactions/:id path parameters
 * Validates transaction UUID in URL path
 */
export const DeleteTransactionParamsSchema = z.object({
  id: z.string().uuid("Transaction ID must be a valid UUID"),
});

/**
 * Type inference from schema
 */
export type DeleteTransactionParams = z.infer<typeof DeleteTransactionParamsSchema>;
```

**Uwagi:**

- Schema jest identyczna jak `GetTransactionByIdParamsSchema` - można rozważyć alias lub reuse
- Export zarówno schema jak i type dla TypeScript type safety

**Test:**

```typescript
// Valid UUID
DeleteTransactionParamsSchema.parse({ id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }); // ✅

// Invalid UUID
DeleteTransactionParamsSchema.parse({ id: "123" }); // ❌ ZodError

// Empty
DeleteTransactionParamsSchema.parse({ id: "" }); // ❌ ZodError
```

---

### Krok 2: Implementacja funkcji deleteTransaction w service layer

**Plik:** `src/lib/services/transaction.service.ts`

**Zadanie:** Dodaj funkcję wykonującą soft-delete transakcji z validacją ownership i deleted_at.

```typescript
/**
 * Soft-deletes a transaction for the authenticated user
 *
 * Business logic flow:
 * 1. Execute UPDATE with WHERE filters:
 *    - id = transactionId (find specific transaction)
 *    - user_id = userId (ownership check)
 *    - deleted_at IS NULL (prevent double-delete)
 * 2. Set fields:
 *    - deleted_at = now()
 *    - deleted_by = userId
 *    - updated_at = now()
 *    - updated_by = userId
 * 3. Use RETURNING to check if row was updated
 * 4. Return true if deleted, false if not found/already deleted
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param transactionId - UUID of transaction to soft-delete
 * @returns Promise<boolean> - true if deleted, false if not found or already deleted
 * @throws Error - Database error (will be caught as 500)
 */
export async function deleteTransaction(
  supabase: SupabaseClient,
  userId: string,
  transactionId: string
): Promise<boolean> {
  // Step 1: Execute soft-delete UPDATE
  const { data, error } = await supabase
    .from("transactions")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", transactionId)
    .eq("user_id", userId) // Ownership check
    .is("deleted_at", null) // Prevent double-delete
    .select("id") // Return only id to check if row was updated
    .single();

  // Step 2: Handle database errors
  if (error) {
    // Supabase returns PGRST116 for .single() when no rows found/updated
    // We return false for consistent 404 handling in API route
    if (error.code === "PGRST116") {
      return false;
    }

    // Other database errors should propagate as 500
    throw error;
  }

  // Step 3: Check if row was updated
  // If data is null (no row matched), transaction not found or already deleted
  if (!data) {
    return false;
  }

  // Step 4: Success - transaction was soft-deleted
  return true;
}
```

**Uwagi implementacyjne:**

- Używamy `.single()` aby otrzymać tylko jeden rekord (lub null jeśli nie znaleziono)
- `.select("id")` - zwracamy tylko id aby zminimalizować transfer danych
- `.is("deleted_at", null)` - kluczowe dla idempotencji (zapobiega double-delete)
- Error code `PGRST116` oznacza "no rows found" - zwracamy `false` zamiast rzucać błąd

**Testy jednostkowe (opcjonalnie):**

```typescript
// Test 1: Successful delete
const result1 = await deleteTransaction(supabase, "user-123", "tx-456");
expect(result1).toBe(true);

// Test 2: Transaction not found
const result2 = await deleteTransaction(supabase, "user-123", "nonexistent-uuid");
expect(result2).toBe(false);

// Test 3: Transaction already deleted (idempotency)
await deleteTransaction(supabase, "user-123", "tx-456"); // First delete
const result3 = await deleteTransaction(supabase, "user-123", "tx-456"); // Second delete
expect(result3).toBe(false);

// Test 4: Transaction belongs to different user
const result4 = await deleteTransaction(supabase, "user-999", "tx-456");
expect(result4).toBe(false);
```

---

### Krok 3: Implementacja DELETE endpoint w API route

**Plik:** `src/pages/api/v1/transactions/[id].ts`

**Zadanie:** Dodaj funkcję `DELETE` do istniejącego pliku (obok GET i PATCH).

```typescript
// Add to imports at top of file
import {
  GetTransactionByIdParamsSchema,
  UpdateTransactionParamsSchema,
  UpdateTransactionSchema,
  DeleteTransactionParamsSchema, // ← NEW
} from "@/lib/schemas/transaction.schema";

import {
  getTransactionById,
  updateTransaction,
  ValidationError,
  deleteTransaction, // ← NEW
} from "@/lib/services/transaction.service";

// ... existing GET and PATCH functions ...

/**
 * DELETE /api/v1/transactions/:id
 *
 * Soft-delete an existing transaction.
 * Sets deleted_at and deleted_by fields instead of physically removing the record.
 * This allows for data recovery and audit trail.
 *
 * Path parameters:
 * - id: Transaction UUID (validated with Zod)
 *
 * Success response: 204 No Content (empty body)
 *
 * Error responses:
 * - 400: Invalid transaction ID format (not a valid UUID)
 * - 404: Transaction not found, already deleted, or belongs to different user
 * - 500: Unexpected server error
 *
 * Note: Authentication is temporarily disabled. Using DEFAULT_USER_ID.
 * Auth will be implemented comprehensively in a future iteration.
 *
 * Idempotency: Calling DELETE multiple times on the same transaction
 * will return 404 after the first successful deletion.
 */
export async function DELETE(context: APIContext) {
  try {
    // Step 1: Parse and validate path parameter
    const params = DeleteTransactionParamsSchema.parse(context.params);

    // Step 2: Get user context
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const userId = DEFAULT_USER_ID;

    // Step 3: Call service layer to soft-delete transaction
    const deleted = await deleteTransaction(supabaseClient, userId, params.id);

    // Step 4: Handle not found case
    if (!deleted) {
      const errorResponse: ErrorResponseDTO = {
        error: "Not Found",
        message: "Transaction not found or has been deleted",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 5: Return success response (204 No Content)
    return new Response(null, {
      status: 204,
      // No Content-Type header needed for 204
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
    console.error("Unexpected error in DELETE /api/v1/transactions/:id:", error);
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

**Uwagi implementacyjne:**

- Funkcja `DELETE` jest dodawana do tego samego pliku co GET i PATCH
- Używamy `return new Response(null, { status: 204 })` dla pustej odpowiedzi 204
- Error handling jest spójny z innymi endpointami (GET, PATCH)
- Helper `formatZodErrors` już istnieje w pliku

---

### Krok 4: Weryfikacja istniejących polityk RLS i triggerów

**Zadanie:** Sprawdź czy polityki RLS i triggery w bazie danych są poprawnie skonfigurowane.

#### 4.1 Sprawdzenie polityki UPDATE dla transactions

**SQL query do weryfikacji:**

```sql
-- Sprawdź czy polityka UPDATE istnieje
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'transactions' AND cmd = 'UPDATE';
```

**Oczekiwany wynik:**

- Polityka powinna istnieć
- `qual` (USING clause) powinno zawierać: `user_id = auth.uid() AND email_confirmed check`
- `with_check` powinno zapobiegać zmianie user_id

**Jeśli polityka nie istnieje, stwórz ją (zgodnie z db-plan.md):**

```sql
CREATE POLICY transactions_update_policy
ON transactions
FOR UPDATE
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
    AND p.email_confirmed = true
  )
)
WITH CHECK (
  user_id = auth.uid()
);
```

#### 4.2 Sprawdzenie triggera audit_log

**SQL query do weryfikacji:**

```sql
-- Sprawdź czy trigger audit_log istnieje
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'transactions'
  AND trigger_name LIKE '%audit%';
```

**Oczekiwany wynik:**

- Trigger powinien być typu `AFTER UPDATE`
- Powinien wywoływać funkcję zapisującą do `audit_log`

**Jeśli trigger nie istnieje, zapoznaj się z plikiem migracji:**

- `supabase/migrations/20251109120300_create_functions_and_triggers.sql`

#### 4.3 Sprawdzenie triggera monthly_metrics

**SQL query do weryfikacji:**

```sql
-- Sprawdź czy trigger monthly_metrics istnieje
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'transactions'
  AND trigger_name LIKE '%monthly%';
```

**Oczekiwany wynik:**

- Trigger powinien być typu `AFTER UPDATE`
- Powinien aktualizować `monthly_metrics` gdy `deleted_at` się zmienia

**Test triggera:**

```sql
-- 1. Stwórz testową transakcję
INSERT INTO transactions (user_id, type, category_code, amount_cents, occurred_on, client_request_id)
VALUES ('user-id', 'EXPENSE', 'GROCERIES', 10000, '2025-01-15', 'test-request-1');

-- 2. Sprawdź monthly_metrics przed delete
SELECT * FROM monthly_metrics WHERE user_id = 'user-id' AND month = '2025-01-01';
-- expenses_cents powinno zawierać 10000

-- 3. Soft-delete transakcji
UPDATE transactions
SET deleted_at = now(), deleted_by = 'user-id'
WHERE client_request_id = 'test-request-1';

-- 4. Sprawdź monthly_metrics po delete
SELECT * FROM monthly_metrics WHERE user_id = 'user-id' AND month = '2025-01-01';
-- expenses_cents powinno być pomniejszone o 10000
```

---

### Krok 5: Dodanie eksportów w module schema

**Plik:** `src/lib/schemas/transaction.schema.ts`

**Zadanie:** Upewnij się, że nowo dodana schema jest wyeksportowana.

```typescript
// At the end of file, verify exports
export {
  CreateTransactionSchema,
  GetTransactionsQuerySchema,
  GetTransactionByIdParamsSchema,
  UpdateTransactionSchema,
  UpdateTransactionParamsSchema,
  DeleteTransactionParamsSchema, // ← Verify this is exported
};
```

---

### Krok 6: Testowanie manualne

**Zadanie:** Przetestuj endpoint DELETE używając narzędzia HTTP client (curl, Postman, Thunder Client).

#### Test 1: Successful delete (204)

```bash
# 1. Utwórz transakcję
curl -X POST http://localhost:4321/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "GROCERIES",
    "amount_cents": 5000,
    "occurred_on": "2025-01-20",
    "note": "Test transaction for delete",
    "client_request_id": "test-delete-001"
  }'

# Zapisz zwrócone ID (np. "abc123...")

# 2. Usuń transakcję
curl -X DELETE http://localhost:4321/api/v1/transactions/abc123... \
  -v  # verbose to see status code

# Oczekiwany wynik:
# HTTP/1.1 204 No Content
# (pusta odpowiedź)
```

#### Test 2: Delete non-existent transaction (404)

```bash
curl -X DELETE http://localhost:4321/api/v1/transactions/00000000-0000-0000-0000-000000000000 \
  -v

# Oczekiwany wynik:
# HTTP/1.1 404 Not Found
# {
#   "error": "Not Found",
#   "message": "Transaction not found or has been deleted"
# }
```

#### Test 3: Invalid UUID format (400)

```bash
curl -X DELETE http://localhost:4321/api/v1/transactions/invalid-uuid \
  -v

# Oczekiwany wynik:
# HTTP/1.1 400 Bad Request
# {
#   "error": "Bad Request",
#   "message": "Invalid transaction ID format",
#   "details": {
#     "id": "Transaction ID must be a valid UUID"
#   }
# }
```

#### Test 4: Idempotency - double delete (404)

```bash
# 1. Utwórz i zapisz ID transakcji (jak w Test 1)
# 2. Usuń pierwszy raz
curl -X DELETE http://localhost:4321/api/v1/transactions/abc123... -v
# → 204 No Content ✅

# 3. Usuń drugi raz (ta sama transakcja)
curl -X DELETE http://localhost:4321/api/v1/transactions/abc123... -v
# → 404 Not Found ✅

# Oczekiwany wynik:
# HTTP/1.1 404 Not Found
# {
#   "error": "Not Found",
#   "message": "Transaction not found or has been deleted"
# }
```

#### Test 5: Verify soft-delete (check database)

```sql
-- Po wykonaniu DELETE z Test 1, sprawdź w bazie:
SELECT id, type, amount_cents, deleted_at, deleted_by
FROM transactions
WHERE client_request_id = 'test-delete-001';

-- Oczekiwany wynik:
-- id | type | amount_cents | deleted_at | deleted_by
-- abc123... | EXPENSE | 5000 | 2025-01-20 10:15:00+00 | <user_id>
```

#### Test 6: Verify audit_log entry

```sql
-- Sprawdź czy soft-delete został zalogowany
SELECT
  entity_type,
  entity_id,
  action,
  before ->> 'deleted_at' as before_deleted_at,
  after ->> 'deleted_at' as after_deleted_at,
  performed_at
FROM audit_log
WHERE entity_id = 'abc123...'  -- ID z Test 1
ORDER BY performed_at DESC
LIMIT 1;

-- Oczekiwany wynik:
-- entity_type | entity_id | action | before_deleted_at | after_deleted_at | performed_at
-- transaction | abc123... | DELETE | null | 2025-01-20T10:15:00Z | 2025-01-20 10:15:00+00
```

#### Test 7: Verify monthly_metrics update

```sql
-- Przed DELETE: sprawdź expenses_cents
SELECT month, expenses_cents, refreshed_at
FROM monthly_metrics
WHERE user_id = '<user_id>' AND month = '2025-01-01';

-- Przykład: expenses_cents = 15000

-- Po DELETE (transaction 5000 groszy):
-- expenses_cents powinno być = 10000 (15000 - 5000)
```

---

### Krok 7: Linting i code style

**Zadanie:** Upewnij się, że kod spełnia zasady projektu.

```bash
# Uruchom linter
npm run lint

# Napraw automatycznie fixable issues
npm run lint:fix
```

**Sprawdź:**

- ✅ Używanie podwójnych cudzysłowów `"` (nie pojedynczych `'`)
- ✅ Średniki na końcu instrukcji
- ✅ Brak console.log (tylko console.error dla błędów)
- ✅ Proper JSDoc comments dla funkcji
- ✅ Type annotations dla wszystkich parametrów

**Przykład z pliku [id].ts:**

```typescript
// ✅ Good
import { z } from "zod";

// ❌ Bad
import { z } from "zod"; // single quotes, missing semicolon
```

---

### Krok 8: Dokumentacja i code review checklist

**Zadanie:** Przygotuj kod do review.

#### Checklist przed commit:

- [ ] **Kod:**
  - [ ] DeleteTransactionParamsSchema dodana do transaction.schema.ts
  - [ ] deleteTransaction() funkcja dodana do transaction.service.ts
  - [ ] DELETE funkcja dodana do [id].ts
  - [ ] Wszystkie importy zaktualizowane

- [ ] **Walidacja:**
  - [ ] Path parameter `id` jest walidowany przez Zod schema
  - [ ] Zwracane są poprawne kody statusu (204, 400, 404, 500)
  - [ ] Error messages są spójne z innymi endpointami

- [ ] **Bezpieczeństwo:**
  - [ ] Ownership check przez `.eq("user_id", userId)`
  - [ ] Soft-delete filter przez `.is("deleted_at", null)`
  - [ ] Brak SQL injection (używamy parametryzowanych zapytań)
  - [ ] Komunikaty błędów nie ujawniają zbyt wiele (information disclosure)

- [ ] **Wydajność:**
  - [ ] Używamy single UPDATE query (nie fetch + update)
  - [ ] Zwracamy tylko `.select("id")` (minimalizacja transfer)
  - [ ] Indeksy są wykorzystywane poprawnie

- [ ] **Testing:**
  - [ ] Wszystkie 7 testów manualnych przeszły pomyślnie
  - [ ] Sprawdzono wpływ na monthly_metrics
  - [ ] Sprawdzono wpływ na audit_log
  - [ ] Idempotencja działa (double-delete → 404)

- [ ] **Code style:**
  - [ ] Linter nie zgłasza błędów
  - [ ] Double quotes używane konsekwentnie
  - [ ] JSDoc comments są kompletne
  - [ ] Kod jest sformatowany (Prettier)

- [ ] **Dokumentacja:**
  - [ ] api-plan.md jest aktualny
  - [ ] Ten implementation plan został stworzony
  - [ ] README (jeśli istnieje) zawiera info o DELETE endpoint

---

### Krok 9: Commit i deployment

**Zadanie:** Zatwierdź zmiany i przygotuj do deploy.

#### Git commit message (zgodnie z Conventional Commits):

```bash
git add src/lib/schemas/transaction.schema.ts
git add src/lib/services/transaction.service.ts
git add src/pages/api/v1/transactions/[id].ts

git commit -m "feat(api): implement DELETE /api/v1/transactions/:id endpoint

- Add DeleteTransactionParamsSchema for path parameter validation
- Implement deleteTransaction() service function with soft-delete logic
- Add DELETE handler to [id].ts API route
- Handle ownership check, idempotency, and proper error responses (204/400/404/500)
- Soft-delete sets deleted_at and deleted_by fields
- Triggers automatically update audit_log and monthly_metrics

Closes #[ISSUE_NUMBER]"
```

#### Pre-deployment checklist:

- [ ] Kod przeszedł code review
- [ ] Wszystkie testy manualne przeszły na dev environment
- [ ] Sprawdzono czy RLS policies są włączone na staging
- [ ] Sprawdzono czy triggery działają na staging
- [ ] Przygotowano rollback plan (jeśli coś pójdzie nie tak)

#### Rollback plan:

Jeśli endpoint DELETE powoduje problemy na produkcji:

1. **Szybkie wyłączenie endpoint:**

   ```typescript
   // W pliku [id].ts, na początku DELETE function:
   export async function DELETE(context: APIContext) {
     // TEMPORARY DISABLE
     return new Response(
       JSON.stringify({
         error: "Service Unavailable",
         message: "This endpoint is temporarily disabled",
       }),
       {
         status: 503,
         headers: { "Content-Type": "application/json" },
       }
     );
   }
   ```

2. **Revert commitu:**

   ```bash
   git revert <commit-hash>
   git push origin master
   ```

3. **Investigate issue:**
   - Sprawdź logi serwera
   - Sprawdź metryki (error rate, response time)
   - Sprawdź czy triggery działają poprawnie

---

## 10. Przyszłe ulepszenia (Future work)

### 10.1 Implementacja autentykacji

**Obecnie:** Używamy `DEFAULT_USER_ID`

**Docelowo:**

```typescript
export async function DELETE(context: APIContext) {
  // Get user from auth middleware
  const userId = context.locals.user?.id;

  if (!userId) {
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

  // ... rest of logic
}
```

### 10.2 Hard-delete scheduler (cleanup job)

**Cel:** Fizyczne usunięcie soft-deleted transactions starszych niż 90 dni

**Implementacja:** GitHub Actions cron job

```sql
-- Job wykonywany raz dziennie
DELETE FROM transactions
WHERE deleted_at < NOW() - INTERVAL '90 days';
```

**Uwaga:** Hard-delete spowoduje kaskadowe usunięcie powiązanych wpisów w audit_log (zgodnie z ON DELETE CASCADE w FK).

### 10.3 Bulk delete endpoint

**Endpoint:** `POST /api/v1/transactions/bulk-delete`

**Request body:**

```json
{
  "transaction_ids": ["id1", "id2", "id3"]
}
```

**Response:**

```json
{
  "deleted_count": 3,
  "failed": []
}
```

### 10.4 Soft-deleted transactions recovery

**Endpoint:** `POST /api/v1/transactions/:id/restore`

**Logika:**

```typescript
UPDATE transactions
SET deleted_at = NULL, deleted_by = NULL
WHERE id = :id AND user_id = :userId AND deleted_at IS NOT NULL;
```

**Use case:** User przypadkowo usunął transakcję i chce ją przywrócić.

### 10.5 Monitoring i alerting

**Metryki do śledzenia:**

- Delete operations per user per day (detect abuse)
- Soft-deleted records growth rate (ensure cleanup job works)
- DELETE endpoint error rate (5xx errors)
- DELETE endpoint p95 response time

**Narzędzia:**

- Supabase built-in monitoring
- PostHog (analytics)
- Sentry (error tracking)

---

## 11. Podsumowanie

Endpoint DELETE /api/v1/transactions/:id wykonuje **soft-delete** transakcji z następującymi kluczowymi cechami:

✅ **Bezpieczeństwo:**

- RLS policies egzekwują ownership
- Explicit check w service layer
- Information disclosure prevention (ogólne error messages)

✅ **Wydajność:**

- Single UPDATE query (brak N+1)
- Wykorzystanie indeksów (PK + user_id)
- Partial index dla deleted_at IS NULL

✅ **Idempotencja:**

- Wielokrotne DELETE zwraca 404
- WHERE deleted_at IS NULL zapobiega double-delete

✅ **Audit trail:**

- Trigger automatycznie loguje do audit_log
- Soft-delete pozwala na data recovery

✅ **Agregaty:**

- Trigger automatycznie aktualizuje monthly_metrics
- Free cash flow pozostaje spójny

✅ **Spójność API:**

- Kody statusu zgodne ze standardem REST (204, 400, 404, 500)
- Error response format spójny z innymi endpointami
- Double quotes i semicolons zgodnie z project rules

**Następne kroki:**

1. Zaimplementuj kod zgodnie z krokami 1-3
2. Przetestuj lokalnie (kroki 6-7)
3. Code review (krok 8)
4. Commit i deploy (krok 9)

**Pytania do rozważenia przed implementacją:**

1. Czy chcemy osobną schema `DeleteTransactionParamsSchema` czy reuse `GetTransactionByIdParamsSchema`?
2. Czy chcemy dodać endpoint `/restore` już teraz czy w późniejszej iteracji?
3. Czy cleanup job (hard-delete po 90 dniach) powinien być częścią tego PR czy osobnego?
