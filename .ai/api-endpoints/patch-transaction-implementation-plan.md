# API Endpoint Implementation Plan: PATCH /api/v1/transactions/:id

## 1. Przegląd punktu końcowego

Endpoint umożliwia aktualizację istniejącej transakcji użytkownika z pełną obsługą backdatingu (zmiana miesiąca transakcji). Wszystkie pola są opcjonalne - użytkownik może zaktualizować tylko wybrane atrybuty. Endpoint nie pozwala na zmianę typu transakcji (`type`), ponieważ wymaga to usunięcia starej i utworzenia nowej transakcji (DELETE + POST).

**Kluczowe cechy:**

- Częściowa aktualizacja (PATCH semantic) - tylko przesłane pola są aktualizowane
- Wykrywanie zmian miesiąca - flag `backdate_warning` w odpowiedzi
- Walidacja spójności kategoria-typ (jeśli kategoria jest zmieniana)
- Ochrona przed soft-deleted transakcjami
- Automatyczne logowanie zmian w `audit_log` (trigger na poziomie bazy)

## 2. Szczegóły żądania

### Metoda HTTP

`PATCH`

### Struktura URL

```
/api/v1/transactions/:id
```

### Parametry

#### Parametry ścieżki (path parameters)

- **id** (wymagany)
  - Typ: `string` (UUID)
  - Opis: Unikalny identyfikator transakcji
  - Walidacja: Musi być poprawnym UUID v4
  - Przykład: `"550e8400-e29b-41d4-a716-446655440000"`

#### Request Body (wszystkie pola opcjonalne)

```typescript
{
  category_code?: string;
  amount_cents?: number;
  occurred_on?: string;
  note?: string | null;
}
```

**Szczegółowa specyfikacja pól:**

- **category_code** (opcjonalny)
  - Typ: `string`
  - Walidacja:
    - Minimum 1 znak
    - Musi istnieć w tabeli `transaction_categories`
    - Musi być aktywny (`is_active = true`)
    - `kind` kategorii musi pasować do `type` transakcji (INCOME/EXPENSE)
  - Przykład: `"RESTAURANTS"`, `"GROCERIES"`

- **amount_cents** (opcjonalny)
  - Typ: `number` (integer)
  - Walidacja:
    - Musi być liczbą całkowitą
    - Musi być > 0
  - Przykład: `15750` (157.50 PLN)

- **occurred_on** (opcjonalny)
  - Typ: `string` (format: YYYY-MM-DD)
  - Walidacja:
    - Musi być w formacie ISO date `YYYY-MM-DD`
    - Nie może być w przyszłości (`<= current_date`)
  - Przykład: `"2025-01-15"`
  - **Uwaga**: Zmiana na inny miesiąc uruchamia przeliczenie `monthly_metrics` i ustawia `backdate_warning: true`

- **note** (opcjonalny, nullable)
  - Typ: `string | null`
  - Walidacja:
    - Maksymalnie 500 znaków
    - Nie może zawierać znaków kontrolnych (ASCII 0x00-0x1F, 0x7F)
    - Może być `null` (usunięcie notatki)
  - Przykład: `"Kolacja w restauracji"`, `null`

### Przykładowe żądanie

```json
{
  "category_code": "RESTAURANTS",
  "amount_cents": 18000,
  "occurred_on": "2025-01-14",
  "note": "Kolacja w restauracji"
}
```

### Ograniczenia

- **Nie można zmienić pola `type`** - próba przesłania tego pola powinna zostać zignorowana lub odrzucona z błędem 400
- Request body nie może być pusty - przynajmniej jedno pole musi być przesłane
- Wszystkie przesłane pola muszą przejść walidację Zod

## 3. Wykorzystywane typy

### DTOs (istniejące w src/types.ts)

#### TransactionDTO

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
  backdate_warning?: boolean; // Opcjonalny - tylko gdy miesiąc został zmieniony
}
```

#### UpdateTransactionCommand (istniejący w src/types.ts)

```typescript
interface UpdateTransactionCommand {
  category_code?: string;
  amount_cents?: number;
  occurred_on?: string;
  note?: string | null;
}
```

#### ErrorResponseDTO (istniejący w src/types.ts)

```typescript
interface ErrorResponseDTO {
  error: string;
  message: string;
  details?: Record<string, string>;
}
```

### Zod Schemas (do utworzenia)

#### UpdateTransactionSchema (nowy - src/lib/schemas/transaction.schema.ts)

```typescript
export const UpdateTransactionSchema = z
  .object({
    category_code: z.string().min(1, "Category code cannot be empty").optional(),

    amount_cents: z
      .number({
        invalid_type_error: "Amount must be a number",
      })
      .int("Amount must be an integer")
      .positive("Amount must be greater than 0")
      .optional(),

    occurred_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .refine(
        (date) => {
          const transactionDate = new Date(date);
          const today = new Date();
          today.setHours(23, 59, 59, 999);
          return transactionDate <= today;
        },
        { message: "Transaction date cannot be in the future" }
      )
      .optional(),

    note: z
      .string()
      .max(500, "Note cannot exceed 500 characters")
      .regex(/^[^\x00-\x1F\x7F]*$/, {
        message: "Note cannot contain control characters",
      })
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided for update" });
```

#### UpdateTransactionParamsSchema (nowy - src/lib/schemas/transaction.schema.ts)

```typescript
export const UpdateTransactionParamsSchema = z.object({
  id: z.string().uuid("Transaction ID must be a valid UUID"),
});
```

### Typy pomocnicze dla serwisu

```typescript
interface UpdateTransactionServiceParams {
  supabase: SupabaseClient;
  userId: string;
  transactionId: string;
  command: UpdateTransactionCommand;
}
```

## 4. Szczegóły odpowiedzi

### Sukces: 200 OK

**Content-Type**: `application/json`

**Body**: `TransactionDTO` z zaktualizowanymi danymi

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "EXPENSE",
  "category_code": "RESTAURANTS",
  "category_label": "Restauracje",
  "amount_cents": 18000,
  "occurred_on": "2025-01-14",
  "note": "Kolacja w restauracji",
  "created_at": "2025-01-15T18:30:00Z",
  "updated_at": "2025-01-16T10:00:00Z",
  "backdate_warning": true
}
```

**Uwaga**: Pole `backdate_warning` jest obecne tylko wtedy, gdy `occurred_on` został zmieniony na inny miesiąc.

### Błąd: 400 Bad Request

Nieprawidłowy format danych wejściowych (walidacja Zod nie przeszła).

```json
{
  "error": "Bad Request",
  "message": "Invalid request data",
  "details": {
    "amount_cents": "Amount must be greater than 0",
    "occurred_on": "Date must be in YYYY-MM-DD format"
  }
}
```

### Błąd: 404 Not Found

Transakcja nie istnieje, została soft-deleted lub należy do innego użytkownika.

```json
{
  "error": "Not Found",
  "message": "Transaction not found or has been deleted"
}
```

### Błąd: 422 Unprocessable Entity

Błędy walidacji biznesowej (kategoria nieaktywna, niezgodność typu, etc.).

```json
{
  "error": "Unprocessable Entity",
  "message": "Validation failed",
  "details": {
    "category_code": "Category RESTAURANTS is not valid for INCOME transactions"
  }
}
```

**Możliwe komunikaty w `details`:**

- `"Category code does not exist or is inactive"`
- `"Category is not active"`
- `"Category {code} is not valid for {type} transactions"`
- `"Transaction date cannot be in the future"` (duplikat z 400, ale dla spójności biznesowej)

### Błąd: 500 Internal Server Error

Nieoczekiwany błąd serwera lub bazy danych.

```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred. Please try again later."
}
```

## 5. Przepływ danych

### Architektura warstwowa

```
Client Request
      ↓
API Route Handler (src/pages/api/v1/transactions/[id].ts - PATCH function)
      ↓
Zod Validation (UpdateTransactionSchema, UpdateTransactionParamsSchema)
      ↓
Service Layer (src/lib/services/transaction.service.ts - updateTransaction())
      ↓
Supabase Client (with RLS)
      ↓
PostgreSQL Database (transactions table)
      ↓
Database Triggers (audit_log, monthly_metrics update)
      ↓
Service Layer (returns TransactionDTO with backdate_warning)
      ↓
API Route Handler (returns 200 OK response)
      ↓
Client Response
```

### Szczegółowy przepływ w warstwie serwisowej

**Funkcja**: `updateTransaction(supabase, userId, transactionId, command)`

#### Krok 1: Pobranie istniejącej transakcji

```typescript
const existing = await supabase
  .from("transactions")
  .select("id, type, category_code, occurred_on, user_id, deleted_at")
  .eq("id", transactionId)
  .eq("user_id", userId)
  .is("deleted_at", null)
  .single();
```

**Obsługa błędów:**

- Jeśli `error.code === "PGRST116"` → return null (404)
- Jeśli `!data` → return null (404)
- Inne błędy → throw error (500)

#### Krok 2: Walidacja kategorii (jeśli category_code jest w command)

```typescript
if (command.category_code) {
  const category = await supabase
    .from("transaction_categories")
    .select("kind, is_active")
    .eq("code", command.category_code)
    .single();

  // Walidacje:
  // - kategoria musi istnieć
  // - kategoria musi być aktywna
  // - category.kind musi być === existing.type
}
```

**Obsługa błędów:**

- Kategoria nie istnieje → throw ValidationError (422)
- Kategoria nieaktywna → throw ValidationError (422)
- Kategoria nie pasuje do typu → throw ValidationError (422)

#### Krok 3: Wykrycie zmiany miesiąca

```typescript
let monthChanged = false;
if (command.occurred_on && command.occurred_on !== existing.occurred_on) {
  const oldMonth = existing.occurred_on.substring(0, 7); // YYYY-MM
  const newMonth = command.occurred_on.substring(0, 7);
  monthChanged = oldMonth !== newMonth;
}
```

#### Krok 4: Wykonanie UPDATE

```typescript
const updateData: Record<string, any> = {
  updated_by: userId,
};

if (command.category_code !== undefined) updateData.category_code = command.category_code;
if (command.amount_cents !== undefined) updateData.amount_cents = command.amount_cents;
if (command.occurred_on !== undefined) updateData.occurred_on = command.occurred_on;
if (command.note !== undefined) updateData.note = command.note;

const { data: updated, error } = await supabase
  .from("transactions")
  .update(updateData)
  .eq("id", transactionId)
  .eq("user_id", userId)
  .select(
    `
    id, type, category_code, amount_cents, occurred_on, note,
    created_at, updated_at,
    transaction_categories!inner(label_pl)
  `
  )
  .single();
```

**Uwagi:**

- RLS automatycznie weryfikuje `user_id = auth.uid()`
- Trigger na UPDATE automatycznie aktualizuje `updated_at`
- Trigger na UPDATE loguje zmianę do `audit_log`
- Trigger na UPDATE przelicza `monthly_metrics` (jeśli zmienił się miesiąc lub kwota)

#### Krok 5: Mapowanie do TransactionDTO

```typescript
return {
  id: updated.id,
  type: updated.type,
  category_code: updated.category_code,
  category_label: updated.transaction_categories.label_pl,
  amount_cents: updated.amount_cents,
  occurred_on: updated.occurred_on,
  note: updated.note,
  created_at: updated.created_at,
  updated_at: updated.updated_at,
  ...(monthChanged && { backdate_warning: true }),
};
```

### Interakcje z bazą danych

#### Tabele odczytywane:

- `transactions` - pobieranie istniejącej transakcji
- `transaction_categories` - walidacja kategorii (jeśli zmieniana)

#### Tabele modyfikowane:

- `transactions` - UPDATE rekordu
- `audit_log` - automatyczne logowanie przez trigger (INSERT)
- `monthly_metrics` - automatyczne przeliczenie przez trigger (UPDATE/INSERT)

#### Triggery wykonywane automatycznie:

1. **Before UPDATE trigger**: Aktualizacja `updated_at = now()`
2. **After UPDATE trigger**: INSERT do `audit_log` z `before` i `after` JSON
3. **After UPDATE trigger**: Przeliczenie `monthly_metrics` dla starego i nowego miesiąca (jeśli zmiana)

## 6. Względy bezpieczeństwa

### Uwierzytelnianie i autoryzacja

#### Obecny stan (MVP)

- Tymczasowo używamy `DEFAULT_USER_ID` (hardcoded UUID)
- Auth będzie zaimplementowany kompleksowo w przyszłej iteracji
- Kod przygotowany na łatwą integrację z `context.locals.user`

#### Docelowa implementacja (po auth)

```typescript
// W przyszłości:
const user = context.locals.user;
if (!user) {
  return new Response(
    JSON.stringify({
      error: "Unauthorized",
      message: "Authentication required",
    }),
    { status: 401 }
  );
}
const userId = user.id;
```

### Row Level Security (RLS)

Supabase RLS automatycznie weryfikuje podczas UPDATE:

```sql
-- Polityka RLS dla transactions UPDATE
USING (user_id = auth.uid() AND EXISTS(
  SELECT 1 FROM profiles WHERE user_id = auth.uid() AND email_confirmed = true
))
WITH CHECK (user_id = auth.uid())
```

**Konsekwencje:**

- Użytkownik może aktualizować tylko własne transakcje
- Próba UPDATE cudzej transakcji zwróci 0 affected rows (404)
- Niezweryfikowani użytkownicy są blokowi (po implementacji auth)

### Walidacja danych wejściowych

#### Warstwa 1: Zod Schema (format + podstawowe reguły)

- Format UUID dla `id`
- Format YYYY-MM-DD dla `occurred_on`
- Typ integer dla `amount_cents`
- Długość max 500 dla `note`
- Brak znaków kontrolnych w `note` (XSS protection)

#### Warstwa 2: Service Layer (reguły biznesowe)

- Transakcja musi istnieć i nie być soft-deleted
- Kategoria musi istnieć, być aktywna i pasować do typu
- `occurred_on` nie może być w przyszłości

#### Warstwa 3: Database Constraints (ostateczna ochrona)

- CHECK constraints na `amount_cents > 0`
- CHECK constraint na `occurred_on <= current_date`
- FK constraint na `category_code` → `transaction_categories.code`
- Złożony FK na `(category_code, type)` → `(code, kind)` gwarantuje spójność

### Ochrona przed atakami

#### SQL Injection

- **Mitygacja**: Supabase używa przygotowanych zapytań (parameterized queries)
- Wszystkie wartości są przekazywane jako parametry, nie konkatenowane

#### XSS (Cross-Site Scripting)

- **Mitygacja**: Regex w Zod blokuje znaki kontrolne w `note`
- Frontend powinien dodatkowo sanityzować przed wyświetleniem (DOMPurify)

#### CSRF (Cross-Site Request Forgery)

- **Mitygacja**: Supabase token w Authorization header (nie cookie)
- SameSite cookie policy (po implementacji auth)

#### Mass Assignment

- **Mitygacja**: Explicit mapping pól w serwisie
- Tylko pola z `UpdateTransactionCommand` są aktualizowane
- Pole `type` jest explicite ignorowane/zablokowane

#### Privilege Escalation

- **Mitygacja**: RLS + explicit `user_id` check w query
- Użytkownik nie może zmienić `user_id` transakcji

### Soft-Delete Protection

Transakcje z `deleted_at IS NOT NULL` są:

- Niewidoczne w queries (filtr `.is("deleted_at", null)`)
- Niedostępne do edycji (zwracane jako 404)
- Zachowane w bazie dla audit trail

## 7. Obsługa błędów

### Tabela wszystkich scenariuszy błędów

| Kod | Scenariusz                    | Warunek                             | Message                                                 | Details                                                                            |
| --- | ----------------------------- | ----------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 400 | Nieprawidłowy UUID            | Zod validation fail na `id`         | "Invalid transaction ID format"                         | `{ "id": "Transaction ID must be a valid UUID" }`                                  |
| 400 | Nieprawidłowy request body    | Zod validation fail na body         | "Invalid request data"                                  | Szczegóły z Zod errors                                                             |
| 400 | Pusty request body            | Brak żadnego pola                   | "Invalid request data"                                  | `{ "_root": "At least one field must be provided for update" }`                    |
| 404 | Transakcja nie istnieje       | Brak rekordu w DB                   | "Transaction not found or has been deleted"             | brak                                                                               |
| 404 | Transakcja soft-deleted       | `deleted_at IS NOT NULL`            | "Transaction not found or has been deleted"             | brak                                                                               |
| 404 | Transakcja innego użytkownika | `user_id != auth.uid()` (RLS)       | "Transaction not found or has been deleted"             | brak                                                                               |
| 422 | Kategoria nie istnieje        | Brak w `transaction_categories`     | "Validation failed"                                     | `{ "category_code": "Category code does not exist or is inactive" }`               |
| 422 | Kategoria nieaktywna          | `is_active = false`                 | "Validation failed"                                     | `{ "category_code": "Category is not active" }`                                    |
| 422 | Niezgodność kategoria-typ     | `category.kind != transaction.type` | "Validation failed"                                     | `{ "category_code": "Category RESTAURANTS is not valid for INCOME transactions" }` |
| 500 | Błąd bazy danych              | Supabase client error               | "An unexpected error occurred. Please try again later." | brak                                                                               |
| 500 | Niespodziewany błąd           | Uncaught exception                  | "An unexpected error occurred. Please try again later." | brak                                                                               |

### Implementacja obsługi błędów w API Route

```typescript
export async function PATCH(context: APIContext) {
  try {
    // 1. Walidacja path params
    const params = UpdateTransactionParamsSchema.parse(context.params);

    // 2. Walidacja request body
    const body = await context.request.json();
    const command = UpdateTransactionSchema.parse(body);

    // 3. Wywołanie serwisu
    const transaction = await updateTransaction(supabaseClient, DEFAULT_USER_ID, params.id, command);

    // 4. Not found
    if (!transaction) {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "Transaction not found or has been deleted",
        }),
        { status: 404 }
      );
    }

    // 5. Success
    return new Response(JSON.stringify(transaction), { status: 200 });
  } catch (error) {
    // Zod validation errors (400)
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "Invalid request data",
          details: formatZodErrors(error),
        }),
        { status: 400 }
      );
    }

    // ValidationError from service (422)
    if (error instanceof ValidationError) {
      return new Response(
        JSON.stringify({
          error: "Unprocessable Entity",
          message: "Validation failed",
          details: error.details,
        }),
        { status: 422 }
      );
    }

    // Database/unexpected errors (500)
    console.error("Unexpected error in PATCH /api/v1/transactions/:id:", error);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "An unexpected error occurred. Please try again later.",
      }),
      { status: 500 }
    );
  }
}
```

### Logowanie błędów

#### Console logging (development)

```typescript
console.error("Unexpected error in PATCH /api/v1/transactions/:id:", error);
```

#### Production monitoring (future)

- Sentry/LogRocket integration
- Structured logging (JSON format)
- Error rate monitoring
- Alert thresholds

### Komunikaty dla użytkownika

#### Zasady:

- **400/422**: Szczegółowe komunikaty pomocne dla developera/użytkownika
- **404**: Ogólny komunikat (nie ujawniamy czy transakcja istnieje dla innego usera)
- **500**: Ogólny komunikat (nie ujawniamy szczegółów wewnętrznych)

#### Język:

- Wszystkie komunikaty w języku angielskim (API convention)
- Frontend odpowiada za tłumaczenie na polski dla użytkownika

## 8. Rozważania dotyczące wydajności

### Potencjalne wąskie gardła

#### 1. Podwójne query do bazy (fetch existing + update)

**Problem**: Wykonujemy 2 queries:

- SELECT existing transaction
- UPDATE transaction

**Mitygacja**:

- Oba queries są proste (primary key lookup)
- Indexy na `transactions(id)` i `transactions(user_id, id)` zapewniają O(log n)
- Alternatywa (single query with RETURNING old values) jest złożona w Supabase

**Decyzja**: Pozostawiamy 2 queries dla czytelności kodu.

#### 2. Walidacja kategorii (dodatkowy SELECT)

**Problem**: Jeśli `category_code` jest zmieniane, wykonujemy dodatkowy SELECT do `transaction_categories`.

**Mitygacja**:

- Tabela `transaction_categories` jest słownikiem (mały rozmiar, ~20 rekordów)
- Potencjalne cache'owanie w przyszłości (Redis/memory cache)
- Primary key lookup jest bardzo szybki

**Optymalizacja (future)**:

```typescript
// Cache categories in memory (load on startup)
const CATEGORIES_CACHE = new Map<string, Category>();
```

#### 3. Triggery na UPDATE (audit_log, monthly_metrics)

**Problem**: UPDATE na `transactions` uruchamia 2-3 triggery, co zwiększa czas wykonania.

**Mitygacja**:

- Triggery są niezbędne dla integralności danych (audit trail, metrics)
- Są dobrze zindexowane i zoptymalizowane
- Supabase wykonuje je asynchronicznie (nie blokuje response)

**Monitoring**: Mierzymy czas wykonania w production i ewentualnie optymalizujemy triggery.

#### 4. Backdate recalculation (zmiana miesiąca)

**Problem**: Zmiana `occurred_on` na inny miesiąc wymaga przeliczenia 2 wierszy w `monthly_metrics`.

**Mitygacja**:

- Trigger jest inkrementalny (odejmuje ze starego miesiąca, dodaje do nowego)
- Nie wykonuje pełnego agregatu (sumowania wszystkich transactions)
- Upsert na `(user_id, month)` jest atomowy i szybki

**SQL trigger (uproszczony)**:

```sql
-- Stary miesiąc
UPDATE monthly_metrics
SET expenses_cents = expenses_cents - OLD.amount_cents
WHERE user_id = OLD.user_id AND month = date_trunc('month', OLD.occurred_on);

-- Nowy miesiąc
INSERT INTO monthly_metrics (user_id, month, expenses_cents)
VALUES (NEW.user_id, date_trunc('month', NEW.occurred_on), NEW.amount_cents)
ON CONFLICT (user_id, month) DO UPDATE
  SET expenses_cents = monthly_metrics.expenses_cents + EXCLUDED.expenses_cents;
```

### Strategie optymalizacji

#### Indexy (już wdrożone w db-plan.md)

```sql
-- Główny index dla UPDATE
CREATE INDEX idx_transactions_pkey ON transactions(id);

-- Index dla ownership check
CREATE INDEX idx_tx_user ON transactions(user_id);

-- Partial index dla active transactions
CREATE INDEX idx_tx_keyset
  ON transactions(user_id, occurred_on DESC, id DESC)
  WHERE deleted_at IS NULL;

-- Index dla category lookup
CREATE INDEX idx_transaction_categories_pkey
  ON transaction_categories(code);
```

#### Prepared statements

Supabase PostgREST automatycznie używa prepared statements dla wszystkich queries.

#### Connection pooling

Supabase automatycznie zarządza connection poolem (Supavisor/PgBouncer).

#### Caching (future optimization)

**Warstwa 1: Database query cache**

- PostgreSQL shared_buffers (często używane tabele w RAM)
- `transaction_categories` jest małe i zawsze w cache

**Warstwa 2: Application cache (future)**

```typescript
// Redis cache dla categories (optional)
const category = (await redis.get(`category:${code}`)) ?? (await fetchFromDB(code));
```

**Warstwa 3: HTTP cache**

- PATCH responses nie są cache'owalne (per HTTP spec)
- Ale GET categories może mieć Cache-Control: max-age=3600

### Monitoring wydajności

#### Metryki do śledzenia:

- P50, P95, P99 response time dla PATCH endpoint
- Query execution time (przez Supabase Dashboard)
- Trigger execution time
- Error rate (500 errors)

#### Cele wydajnościowe (SLA):

- P95 < 300ms (3 queries + 2 triggers)
- P99 < 500ms
- Error rate < 0.1%

#### Alerty:

- Response time > 1s
- Error rate > 1% w 5 min
- Database CPU > 80%

## 9. Etapy wdrożenia

### Faza 1: Przygotowanie typów i schematów (30 min)

#### Krok 1.1: Aktualizacja transaction.schema.ts

**Plik**: `src/lib/schemas/transaction.schema.ts`

**Dodać na końcu pliku:**

```typescript
/**
 * Zod schema for UpdateTransactionCommand
 * Validates incoming request data for PATCH /api/v1/transactions/:id
 *
 * Validation rules:
 * - All fields are optional (partial update)
 * - category_code: Non-empty string
 * - amount_cents: Positive integer
 * - occurred_on: YYYY-MM-DD format, not in the future
 * - note: Optional, max 500 chars, no control characters, nullable
 * - At least one field must be provided
 */
export const UpdateTransactionSchema = z
  .object({
    category_code: z.string().min(1, "Category code cannot be empty").optional(),

    amount_cents: z
      .number({
        invalid_type_error: "Amount must be a number",
      })
      .int("Amount must be an integer")
      .positive("Amount must be greater than 0")
      .optional(),

    occurred_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .refine(
        (date) => {
          const transactionDate = new Date(date);
          const today = new Date();
          today.setHours(23, 59, 59, 999); // End of today
          return transactionDate <= today;
        },
        { message: "Transaction date cannot be in the future" }
      )
      .optional(),

    note: z
      .string()
      .max(500, "Note cannot exceed 500 characters")
      // eslint-disable-next-line no-control-regex
      .regex(/^[^\x00-\x1F\x7F]*$/, {
        message: "Note cannot contain control characters",
      })
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

/**
 * Type inference from Zod schema for use in TypeScript
 */
export type UpdateTransactionSchemaType = z.infer<typeof UpdateTransactionSchema>;

/**
 * Zod schema for PATCH /api/v1/transactions/:id path parameters
 * Validates transaction UUID in URL path
 */
export const UpdateTransactionParamsSchema = z.object({
  id: z.string().uuid("Transaction ID must be a valid UUID"),
});

/**
 * Type inference from schema
 */
export type UpdateTransactionParams = z.infer<typeof UpdateTransactionParamsSchema>;
```

**Weryfikacja:**

- Sprawdź brak błędów TypeScript
- Upewnij się, że wszystkie importy są poprawne

#### Krok 1.2: Weryfikacja typów w src/types.ts

**Plik**: `src/types.ts`

**Sprawdź, że istnieje:**

```typescript
export interface UpdateTransactionCommand {
  category_code?: string;
  amount_cents?: number;
  occurred_on?: string;
  note?: string | null;
}
```

**Oraz że TransactionDTO ma opcjonalne pole:**

```typescript
export interface TransactionDTO {
  // ... inne pola
  backdate_warning?: boolean;
}
```

**Status**: ✅ Oba typy już istnieją (według pliku types.ts)

### Faza 2: Implementacja warstwy serwisowej (60 min)

#### Krok 2.1: Dodanie funkcji updateTransaction do transaction.service.ts

**Plik**: `src/lib/services/transaction.service.ts`

**Dodać na końcu pliku (przed ostatnią linią):**

```typescript
/**
 * Updates an existing transaction for the authenticated user
 *
 * Business logic flow:
 * 1. Fetch existing transaction (validate ownership, not soft-deleted)
 * 2. If category_code is being changed:
 *    - Validate category exists and is active
 *    - Validate category kind matches transaction type (cannot change type)
 * 3. Detect if month is changing (for backdate_warning)
 * 4. Build update payload with only provided fields
 * 5. Execute UPDATE with RETURNING clause
 * 6. Return TransactionDTO with backdate_warning if month changed
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param transactionId - UUID of transaction to update
 * @param command - Validated command data (UpdateTransactionCommand)
 * @returns Promise<TransactionDTO | null> - Updated transaction, or null if not found
 * @throws ValidationError - Business validation failed (422)
 * @throws Error - Database error (will be caught as 500)
 */
export async function updateTransaction(
  supabase: SupabaseClient,
  userId: string,
  transactionId: string,
  command: UpdateTransactionCommand
): Promise<TransactionDTO | null> {
  // Step 1: Fetch existing transaction
  // We need: type (for category validation), occurred_on (for backdate detection)
  const { data: existing, error: fetchError } = await supabase
    .from("transactions")
    .select("id, type, category_code, occurred_on")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single();

  // Handle not found cases
  if (fetchError) {
    // Supabase returns PGRST116 for .single() when no rows found
    if (fetchError.code === "PGRST116") {
      return null;
    }
    // Other database errors should propagate as 500
    throw fetchError;
  }

  if (!existing) {
    return null;
  }

  // Step 2: Validate category if being changed
  if (command.category_code !== undefined) {
    const { data: category, error: categoryError } = await supabase
      .from("transaction_categories")
      .select("kind, is_active")
      .eq("code", command.category_code)
      .single();

    if (categoryError || !category) {
      throw new ValidationError("Category code does not exist or is inactive", {
        category_code: command.category_code,
      });
    }

    if (!category.is_active) {
      throw new ValidationError("Category is not active", {
        category_code: command.category_code,
      });
    }

    // Validate category kind matches transaction type (cannot change type)
    if (category.kind !== existing.type) {
      throw new ValidationError(`Category ${command.category_code} is not valid for ${existing.type} transactions`, {
        category_code: `Category kind ${category.kind} does not match transaction type ${existing.type}`,
      });
    }
  }

  // Step 3: Detect month change for backdate_warning
  let monthChanged = false;
  if (command.occurred_on !== undefined && command.occurred_on !== existing.occurred_on) {
    // Extract YYYY-MM from YYYY-MM-DD
    const oldMonth = existing.occurred_on.substring(0, 7);
    const newMonth = command.occurred_on.substring(0, 7);
    monthChanged = oldMonth !== newMonth;
  }

  // Step 4: Build update payload
  // Only include fields that are present in command (partial update)
  const updateData: Record<string, any> = {
    updated_by: userId, // Always update this field
  };

  if (command.category_code !== undefined) {
    updateData.category_code = command.category_code;
  }
  if (command.amount_cents !== undefined) {
    updateData.amount_cents = command.amount_cents;
  }
  if (command.occurred_on !== undefined) {
    updateData.occurred_on = command.occurred_on;
  }
  if (command.note !== undefined) {
    updateData.note = command.note;
  }

  // Step 5: Execute UPDATE with RETURNING
  const { data: updated, error: updateError } = await supabase
    .from("transactions")
    .update(updateData)
    .eq("id", transactionId)
    .eq("user_id", userId)
    .is("deleted_at", null) // Extra safety check
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
    .single();

  if (updateError) {
    // Handle not found (e.g., concurrent soft-delete)
    if (updateError.code === "PGRST116") {
      return null;
    }
    // Let other database errors propagate
    throw updateError;
  }

  if (!updated) {
    return null;
  }

  // Step 6: Map to TransactionDTO with optional backdate_warning
  const result: TransactionDTO = {
    id: updated.id,
    type: updated.type,
    category_code: updated.category_code,
    category_label: (updated.transaction_categories as { label_pl: string }).label_pl,
    amount_cents: updated.amount_cents,
    occurred_on: updated.occurred_on,
    note: updated.note,
    created_at: updated.created_at,
    updated_at: updated.updated_at,
  };

  // Add backdate_warning only if month changed
  if (monthChanged) {
    result.backdate_warning = true;
  }

  return result;
}
```

**Weryfikacja:**

- Sprawdź brak błędów TypeScript
- Upewnij się, że import `UpdateTransactionCommand` z `@/types` działa
- Sprawdź, że `ValidationError` jest już zdefiniowana w tym samym pliku

#### Krok 2.2: Dodanie typu do importów

**Na górze pliku** `transaction.service.ts`:

```typescript
import type {
  CreateTransactionCommand,
  TransactionDTO,
  TransactionListResponseDTO,
  UpdateTransactionCommand, // <-- Dodaj ten import
} from "@/types";
```

### Faza 3: Implementacja API route handler (45 min)

#### Krok 3.1: Dodanie PATCH handler do [id].ts

**Plik**: `src/pages/api/v1/transactions/[id].ts`

**Dodać nowe importy na górze:**

```typescript
import {
  GetTransactionByIdParamsSchema,
  UpdateTransactionParamsSchema, // <-- Nowy
  UpdateTransactionSchema, // <-- Nowy
} from "@/lib/schemas/transaction.schema";
import {
  getTransactionById,
  updateTransaction, // <-- Nowy
  ValidationError, // <-- Nowy
} from "@/lib/services/transaction.service";
```

**Dodać na końcu pliku (po funkcji GET):**

```typescript
/**
 * PATCH /api/v1/transactions/:id
 *
 * Update an existing transaction. Supports partial updates (all fields optional).
 * Cannot change transaction type - use DELETE + POST instead.
 * Changing occurred_on to different month triggers backdate recalculation.
 *
 * Path parameters:
 * - id: Transaction UUID (validated with Zod)
 *
 * Request body (all optional):
 * {
 *   category_code?: string;
 *   amount_cents?: number;
 *   occurred_on?: string;  // YYYY-MM-DD
 *   note?: string | null;
 * }
 *
 * Success response: 200 OK with TransactionDTO
 * {
 *   id: "uuid-string",
 *   type: "EXPENSE",
 *   category_code: "RESTAURANTS",
 *   category_label: "Restauracje",
 *   amount_cents: 18000,
 *   occurred_on: "2025-01-14",
 *   note: "Kolacja w restauracji",
 *   created_at: "2025-01-15T18:30:00Z",
 *   updated_at: "2025-01-16T10:00:00Z",
 *   backdate_warning: true  // Only present if month changed
 * }
 *
 * Error responses:
 * - 400: Invalid request data (Zod validation failed)
 * - 404: Transaction not found or soft-deleted
 * - 422: Business validation failed (category invalid, etc.)
 * - 500: Unexpected server error
 *
 * Note: Authentication is temporarily disabled. Using DEFAULT_USER_ID.
 * Auth will be implemented comprehensively in a future iteration.
 */
export async function PATCH(context: APIContext) {
  try {
    // Step 1: Parse and validate path parameter
    const params = UpdateTransactionParamsSchema.parse(context.params);

    // Step 2: Parse and validate request body
    const body = await context.request.json();
    const command = UpdateTransactionSchema.parse(body);

    // Step 3: Call service layer to update transaction
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const transaction = await updateTransaction(supabaseClient, DEFAULT_USER_ID, params.id, command);

    // Step 4: Handle not found case
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

    // Step 5: Return success response
    return new Response(JSON.stringify(transaction), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle Zod validation errors (400 Bad Request)
    if (error instanceof z.ZodError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid request data",
        details: formatZodErrors(error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle ValidationError from service layer (422 Unprocessable Entity)
    if (error instanceof ValidationError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Unprocessable Entity",
        message: "Validation failed",
        details: error.details,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle all other unexpected errors (500 Internal Server Error)
    // eslint-disable-next-line no-console
    console.error("Unexpected error in PATCH /api/v1/transactions/:id:", error);
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

### Faza 4: Testowanie (60 min)

#### Krok 4.1: Przygotowanie środowiska testowego

**Terminal:**

```bash
# Sprawdź, czy dev server działa
npm run dev

# W osobnym terminalu - sprawdź logi Supabase
npx supabase status
```

#### Krok 4.2: Testy manualne (curl/Postman)

**Test 1: Happy path - update single field**

```bash
curl -X PATCH http://localhost:4321/api/v1/transactions/{existing-id} \
  -H "Content-Type: application/json" \
  -d '{
    "note": "Updated note"
  }'

# Expected: 200 OK
# {
#   "id": "...",
#   "type": "EXPENSE",
#   "category_code": "GROCERIES",
#   "category_label": "Zakupy spożywcze",
#   "amount_cents": 15750,
#   "occurred_on": "2025-01-15",
#   "note": "Updated note",
#   "created_at": "...",
#   "updated_at": "..." (newer timestamp)
# }
```

**Test 2: Happy path - update multiple fields**

```bash
curl -X PATCH http://localhost:4321/api/v1/transactions/{existing-id} \
  -H "Content-Type: application/json" \
  -d '{
    "category_code": "RESTAURANTS",
    "amount_cents": 18000,
    "note": "Kolacja"
  }'

# Expected: 200 OK with updated fields
```

**Test 3: Backdate warning - change month**

```bash
curl -X PATCH http://localhost:4321/api/v1/transactions/{existing-id} \
  -H "Content-Type: application/json" \
  -d '{
    "occurred_on": "2024-12-25"
  }'

# Expected: 200 OK with "backdate_warning": true
```

**Test 4: Error - invalid UUID**

```bash
curl -X PATCH http://localhost:4321/api/v1/transactions/invalid-uuid \
  -H "Content-Type: application/json" \
  -d '{"note": "test"}'

# Expected: 400 Bad Request
# {
#   "error": "Bad Request",
#   "message": "Invalid transaction ID format",
#   "details": {
#     "id": "Transaction ID must be a valid UUID"
#   }
# }
```

**Test 5: Error - not found**

```bash
curl -X PATCH http://localhost:4321/api/v1/transactions/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{"note": "test"}'

# Expected: 404 Not Found
# {
#   "error": "Not Found",
#   "message": "Transaction not found or has been deleted"
# }
```

**Test 6: Error - empty body**

```bash
curl -X PATCH http://localhost:4321/api/v1/transactions/{existing-id} \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: 400 Bad Request
# {
#   "error": "Bad Request",
#   "message": "Invalid request data",
#   "details": {
#     "_root": "At least one field must be provided for update"
#   }
# }
```

**Test 7: Error - invalid category**

```bash
curl -X PATCH http://localhost:4321/api/v1/transactions/{existing-id} \
  -H "Content-Type: application/json" \
  -d '{
    "category_code": "NONEXISTENT"
  }'

# Expected: 422 Unprocessable Entity
# {
#   "error": "Unprocessable Entity",
#   "message": "Validation failed",
#   "details": {
#     "category_code": "NONEXISTENT"
#   }
# }
```

**Test 8: Error - category kind mismatch**

```bash
# Assuming existing transaction is EXPENSE, try to change to INCOME category
curl -X PATCH http://localhost:4321/api/v1/transactions/{expense-id} \
  -H "Content-Type: application/json" \
  -d '{
    "category_code": "SALARY"
  }'

# Expected: 422 Unprocessable Entity
# {
#   "error": "Unprocessable Entity",
#   "message": "Validation failed",
#   "details": {
#     "category_code": "Category kind INCOME does not match transaction type EXPENSE"
#   }
# }
```

**Test 9: Error - invalid amount**

```bash
curl -X PATCH http://localhost:4321/api/v1/transactions/{existing-id} \
  -H "Content-Type: application/json" \
  -d '{
    "amount_cents": -100
  }'

# Expected: 400 Bad Request
# {
#   "error": "Bad Request",
#   "message": "Invalid request data",
#   "details": {
#     "amount_cents": "Amount must be greater than 0"
#   }
# }
```

**Test 10: Error - future date**

```bash
curl -X PATCH http://localhost:4321/api/v1/transactions/{existing-id} \
  -H "Content-Type: application/json" \
  -d '{
    "occurred_on": "2026-12-31"
  }'

# Expected: 400 Bad Request
# {
#   "error": "Bad Request",
#   "message": "Invalid request data",
#   "details": {
#     "occurred_on": "Transaction date cannot be in the future"
#   }
# }
```

**Test 11: Error - note too long**

```bash
curl -X PATCH http://localhost:4321/api/v1/transactions/{existing-id} \
  -H "Content-Type: application/json" \
  -d '{
    "note": "'"$(printf 'a%.0s' {1..501})"'"
  }'

# Expected: 400 Bad Request
# {
#   "error": "Bad Request",
#   "message": "Invalid request data",
#   "details": {
#     "note": "Note cannot exceed 500 characters"
#   }
# }
```

**Test 12: Edge case - set note to null**

```bash
curl -X PATCH http://localhost:4321/api/v1/transactions/{existing-id} \
  -H "Content-Type: application/json" \
  -d '{
    "note": null
  }'

# Expected: 200 OK with "note": null
```

#### Krok 4.3: Weryfikacja w bazie danych

**Supabase SQL Editor:**

```sql
-- Sprawdź zaktualizowaną transakcję
SELECT * FROM transactions
WHERE id = 'your-transaction-id';

-- Sprawdź audit_log entry (trigger)
SELECT * FROM audit_log
WHERE entity_type = 'transaction'
  AND entity_id = 'your-transaction-id'
  AND action = 'UPDATE'
ORDER BY performed_at DESC
LIMIT 1;

-- Sprawdź monthly_metrics (jeśli zmiana miesiąca)
SELECT * FROM monthly_metrics
WHERE user_id = 'your-user-id'
  AND month IN ('2025-01-01', '2024-12-01')
ORDER BY month DESC;
```

#### Krok 4.4: Weryfikacja logów

**Terminal (dev server logs):**

```bash
# Sprawdź brak błędów console.error
# Sprawdź poprawny flow logów
```

**Supabase Dashboard:**

- Sprawdź logi API w zakładce Logs
- Sprawdź query performance w zakładce Database → Logs
- Sprawdź trigger execution time

### Faza 5: Dokumentacja i czyszczenie (15 min)

#### Krok 5.1: Weryfikacja dokumentacji

**Pliki do sprawdzenia:**

- ✅ `src/lib/schemas/transaction.schema.ts` - JSDoc comments
- ✅ `src/lib/services/transaction.service.ts` - JSDoc comments dla updateTransaction
- ✅ `src/pages/api/v1/transactions/[id].ts` - JSDoc comment dla PATCH

**Wszystkie funkcje mają:**

- Opis co robią
- Parametry (@param)
- Zwracana wartość (@returns)
- Możliwe błędy (@throws)

#### Krok 5.2: Sprawdzenie linterów

**Terminal:**

```bash
# Uruchom ESLint
npm run lint

# Jeśli są błędy, napraw je
npm run lint -- --fix

# Sprawdź TypeScript
npx tsc --noEmit
```

#### Krok 5.3: Commit zmian

**Git:**

```bash
git status

# Powinny być zmodyfikowane:
# - src/lib/schemas/transaction.schema.ts
# - src/lib/services/transaction.service.ts
# - src/pages/api/v1/transactions/[id].ts

git add .

git commit -m "feat: implement PATCH /api/v1/transactions/:id endpoint

- Add UpdateTransactionSchema and UpdateTransactionParamsSchema
- Implement updateTransaction service function with:
  - Category validation (exists, active, matches type)
  - Backdate detection (month change)
  - Partial update support
- Add PATCH handler to [id].ts with comprehensive error handling
- Support for 200, 400, 404, 422, 500 status codes
- All fields optional, at least one required
- Automatic audit_log and monthly_metrics updates via triggers"
```

### Faza 6: Testing guide (opcjonalnie - 30 min)

#### Krok 6.1: Utworzenie testing guide (jeśli wymagane)

**Plik**: `.ai/testing-guide-patch-transaction.md`

Zawartość analogiczna do `testing-guide-get-transaction-by-id.md`, z testami dla PATCH endpoint.

**Sekcje:**

1. Setup instructions
2. Test scenarios (12 test cases)
3. Database verification queries
4. Expected results
5. Troubleshooting

---

## 10. Checklist implementacji

### Pre-implementation

- [ ] Przeczytać cały plan implementacji
- [ ] Zrozumieć flow danych i business logic
- [ ] Przygotować środowisko (Supabase running, dev server ready)
- [ ] Mieć dostęp do istniejącej transakcji w bazie (do testów)

### Implementation

- [ ] Faza 1: Schematy i typy (UpdateTransactionSchema, UpdateTransactionParamsSchema)
- [ ] Faza 2: Service layer (updateTransaction function)
- [ ] Faza 3: API route handler (PATCH function)
- [ ] Faza 4: Testy manualne (wszystkie 12 test cases)
- [ ] Faza 5: Dokumentacja i linting
- [ ] Faza 6: Testing guide (opcjonalne)

### Verification

- [ ] TypeScript kompiluje się bez błędów
- [ ] ESLint nie pokazuje błędów
- [ ] Wszystkie testy manualne przechodzą
- [ ] Audit log poprawnie zapisuje UPDATE
- [ ] Monthly metrics są aktualizowane (jeśli zmiana miesiąca)
- [ ] Backdate_warning pojawia się prawidłowo
- [ ] Błędy 400/404/422/500 są poprawnie obsługiwane

### Post-implementation

- [ ] Commit zmian z descriptive message
- [ ] Update API documentation (jeśli istnieje Swagger/OpenAPI)
- [ ] Poinformować team o nowym endpoincie
- [ ] Dodać do backlog: integracja auth (gdy będzie gotowy)

---

## 11. Uwagi i potencjalne pułapki

### Common pitfalls

1. **Zapomnienie o walidacji kategorii**
   - ❌ Błąd: Nie sprawdzenie `is_active`
   - ✅ Fix: Walidacja `is_active` w service layer

2. **Niepoprawne wykrywanie zmiany miesiąca**
   - ❌ Błąd: Porównywanie całej daty zamiast tylko YYYY-MM
   - ✅ Fix: `substring(0, 7)` lub `date_trunc('month')`

3. **Mass assignment vulnerability**
   - ❌ Błąd: Przekazanie całego body do UPDATE
   - ✅ Fix: Explicit mapping tylko pól z `UpdateTransactionCommand`

4. **Zwracanie 500 zamiast 404 dla not found**
   - ❌ Błąd: Nie sprawdzenie `error.code === "PGRST116"`
   - ✅ Fix: Return null w serwisie, 404 w route handler

5. **Brak obsługi pustego body**
   - ❌ Błąd: Brak `.refine()` w Zod schema
   - ✅ Fix: `refine((data) => Object.keys(data).length > 0)`

6. **Nieaktualne updated_at**
   - ❌ Błąd: Nie ustawienie `updated_by`
   - ✅ Fix: Zawsze dodawaj `updated_by: userId` do updateData

### Testing tips

1. **Używaj rzeczywistych danych**
   - Testuj na transakcjach z różnymi typami (INCOME/EXPENSE)
   - Testuj z różnymi kategoriami

2. **Testuj edge cases**
   - Nota = null (usunięcie)
   - Zmiana daty w tym samym miesiącu (brak backdate_warning)
   - Zmiana daty na inny miesiąc (backdate_warning)

3. **Weryfikuj triggery**
   - Sprawdź audit_log po każdym UPDATE
   - Sprawdź monthly_metrics po zmianie miesiąca

4. **Monitoruj performance**
   - Mierz czas wykonania (powinno być < 300ms)
   - Sprawdź query plan w Supabase

### Future improvements

1. **Caching kategorii**

   ```typescript
   // In-memory cache dla transaction_categories
   const CATEGORIES_CACHE = new Map<string, Category>();
   ```

2. **Batch updates**

   ```typescript
   // API endpoint dla bulk update (przyszłość)
   PATCH / api / v1 / transactions / batch;
   ```

3. **Optimistic locking**

   ```typescript
   // Sprawdzenie updated_at przed UPDATE (prevent lost updates)
   .match({ id, updated_at: command.expected_version })
   ```

4. **Webhook notifications**
   ```typescript
   // Notify frontend o zmianach monthly_metrics
   await notifyWebhook({ event: "transaction.updated", data: transaction });
   ```

---

## 12. Przykłady użycia (dla frontend developerów)

### JavaScript/TypeScript (fetch)

```typescript
// Update transaction note
async function updateTransactionNote(transactionId: string, note: string) {
  const response = await fetch(`/api/v1/transactions/${transactionId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ note }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Update multiple fields with backdate detection
async function updateTransaction(
  transactionId: string,
  updates: {
    category_code?: string;
    amount_cents?: number;
    occurred_on?: string;
    note?: string | null;
  }
) {
  const response = await fetch(`/api/v1/transactions/${transactionId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    if (response.status === 422) {
      // Business validation error - show user-friendly message
      throw new ValidationError(error.message, error.details);
    }
    throw new Error(error.message);
  }

  const transaction = await response.json();

  // Show warning if month was changed
  if (transaction.backdate_warning) {
    showWarningToast("Miesiąc transakcji został zmieniony. Statystyki zostały przeliczone.");
  }

  return transaction;
}

// React hook example
function useUpdateTransaction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = async (id: string, data: UpdateTransactionCommand) => {
    setLoading(true);
    setError(null);

    try {
      const result = await updateTransaction(id, data);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { update, loading, error };
}
```

### Error handling na frontendzie

```typescript
try {
  const updated = await updateTransaction(id, { note: "New note" });
  showSuccessToast("Transakcja zaktualizowana");
} catch (error) {
  if (error instanceof ValidationError) {
    // 422 - show field-specific errors
    Object.entries(error.details).forEach(([field, message]) => {
      showFieldError(field, message);
    });
  } else if (error.message === "Transaction not found or has been deleted") {
    // 404 - redirect to list
    router.push("/transactions");
    showErrorToast("Transakcja nie została znaleziona");
  } else {
    // 500 or network error
    showErrorToast("Wystąpił błąd. Spróbuj ponownie później.");
  }
}
```

---

## 13. Odniesienia

### Powiązane plany implementacji

- `post-transaction-implementation-plan.md` - POST /api/v1/transactions
- `get-specified-transaction-implementation-plan.md` - GET /api/v1/transactions/:id
- `get-transactions-implementation-plan.md` - GET /api/v1/transactions (list)

### Dokumentacja

- `api-plan.md` - Pełna specyfikacja API
- `db-plan.md` - Schemat bazy danych
- `prd.md` - Product Requirements Document

### Tech stack

- Astro 5 - https://docs.astro.build/
- TypeScript 5 - https://www.typescriptlang.org/docs/
- Supabase - https://supabase.com/docs
- Zod - https://zod.dev/

### Database

- PostgreSQL 15 - https://www.postgresql.org/docs/15/
- RLS (Row Level Security) - https://supabase.com/docs/guides/auth/row-level-security
- Triggers - https://www.postgresql.org/docs/15/triggers.html

---

**Koniec planu implementacji**

Powodzenia w implementacji! 🚀

W razie pytań lub problemów, sprawdź sekcję "Uwagi i potencjalne pułapki" lub skonsultuj się z pozostałymi planami implementacji.
