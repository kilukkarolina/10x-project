# API Endpoint Implementation Plan: POST /api/v1/transactions

## 1. Przegląd punktu końcowego

**Cel**: Utworzenie nowej transakcji (przychodu lub wydatku) dla zalogowanego i zweryfikowanego użytkownika.

**Kluczowe funkcjonalności**:
- Tworzenie transakcji typu INCOME lub EXPENSE
- Walidacja zgodności kategorii z typem transakcji
- Idempotencja operacji poprzez `client_request_id`
- Automatyczne dołączanie etykiety kategorii w odpowiedzi
- Trigger w bazie danych automatycznie aktualizuje `monthly_metrics`

**Zależności**:
- Tabela `transactions` z RLS
- Tabela `transaction_categories` (słownik globalny)
- Trigger na `monthly_metrics` (automatyczny update)
- Middleware auth sprawdzający sesję użytkownika

---

## 2. Szczegóły żądania

### Metoda HTTP
`POST`

### Struktura URL
```
/api/v1/transactions
```

### Headers
```
Content-Type: application/json
Authorization: Bearer <supabase-session-token>
```

### Request Body

**Typ**: `CreateTransactionCommand` (z `src/types.ts`)

```typescript
{
  type: "INCOME" | "EXPENSE";           // Wymagane
  category_code: string;                 // Wymagane
  amount_cents: number;                  // Wymagane, > 0
  occurred_on: string;                   // Wymagane, format YYYY-MM-DD, <= dzisiaj
  note?: string | null;                  // Opcjonalne, max 500 znaków
  client_request_id: string;             // Wymagane, UUID dla idempotencji
}
```

**Przykład**:
```json
{
  "type": "EXPENSE",
  "category_code": "GROCERIES",
  "amount_cents": 15750,
  "occurred_on": "2025-01-15",
  "note": "Zakupy w Biedronce",
  "client_request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Parametry

**Wymagane:**
- `type`: Typ transakcji - musi być `INCOME` lub `EXPENSE`
- `category_code`: Kod kategorii z tabeli `transaction_categories`
- `amount_cents`: Kwota w groszach (liczba całkowita > 0)
- `occurred_on`: Data wystąpienia transakcji (YYYY-MM-DD, nie może być w przyszłości)
- `client_request_id`: Unikalny identyfikator żądania (UUID v4/v7) dla idempotencji

**Opcjonalne:**
- `note`: Notatka użytkownika (max 500 znaków, bez znaków kontrolnych)

---

## 3. Wykorzystywane typy

### Input Types
```typescript
// src/types.ts - już zdefiniowany
interface CreateTransactionCommand {
  type: "INCOME" | "EXPENSE";
  category_code: string;
  amount_cents: number;
  occurred_on: string;
  note?: string | null;
  client_request_id: string;
}
```

### Output Types
```typescript
// src/types.ts - już zdefiniowany
interface TransactionDTO {
  id: string;
  type: "INCOME" | "EXPENSE";
  category_code: string;
  category_label: string;              // Joined z transaction_categories
  amount_cents: number;
  occurred_on: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  backdate_warning?: boolean;          // Opcjonalne, gdy zmieniono miesiąc
}
```

### Error Types
```typescript
// src/types.ts - już zdefiniowany
interface ErrorResponseDTO {
  error: string;
  message: string;
  details?: Record<string, string>;
  retry_after_seconds?: number;
}
```

---

## 4. Szczegóły odpowiedzi

### Success Response

**Status**: `201 Created`

**Body**: `TransactionDTO`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "type": "EXPENSE",
  "category_code": "GROCERIES",
  "category_label": "Zakupy spożywcze",
  "amount_cents": 15750,
  "occurred_on": "2025-01-15",
  "note": "Zakupy w Biedronce",
  "created_at": "2025-01-15T18:30:00.123Z",
  "updated_at": "2025-01-15T18:30:00.123Z"
}
```

### Error Responses

#### 400 Bad Request
Błędny format JSON lub brak wymaganych pól (walidacja Zod).

```json
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "amount_cents": "Expected number, received string",
    "occurred_on": "Invalid date format"
  }
}
```

#### 401 Unauthorized
Brak sesji użytkownika lub email nie zweryfikowany.

```json
{
  "error": "Unauthorized",
  "message": "User not authenticated or email not verified"
}
```

#### 409 Conflict
Duplikat `client_request_id` (idempotencja).

```json
{
  "error": "Conflict",
  "message": "Transaction with this client_request_id already exists"
}
```

**Uwaga**: W przypadku 409, można rozważyć zwrócenie istniejącej transakcji w body (idempotencja).

#### 422 Unprocessable Entity
Błędy walidacji biznesowej.

```json
{
  "error": "Unprocessable Entity",
  "message": "Category GROCERIES is not valid for INCOME transactions",
  "details": {
    "category_code": "Category kind EXPENSE does not match transaction type INCOME"
  }
}
```

Inne przykłady 422:
- Data w przyszłości: `"Transaction date cannot be in the future"`
- Nieistniejąca kategoria: `"Category code does not exist or is inactive"`
- Nieprawidłowa notatka: `"Note contains control characters"`

#### 500 Internal Server Error
Niespodziewany błąd bazy danych lub serwera.

```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred. Please try again later."
}
```

---

## 5. Przepływ danych

### Architektura
```
Client Request
    ↓
Astro Middleware (auth check)
    ↓
POST /api/v1/transactions endpoint
    ↓
Zod validation (CreateTransactionCommand schema)
    ↓
TransactionService.createTransaction()
    ↓
    ├─> Validate category (query transaction_categories)
    ├─> Insert transaction (with RLS check)
    ├─> Fetch with joined category_label
    └─> Return TransactionDTO
    ↓
Database Trigger → Update monthly_metrics
    ↓
201 Response with TransactionDTO
```

### Szczegółowy przepływ

1. **Middleware** (`src/middleware/index.ts`):
   - Sprawdza `context.locals.supabase` i `context.locals.user`
   - Jeśli brak sesji → zwraca 401

2. **Endpoint** (`src/pages/api/v1/transactions/index.ts`):
   - Handler: `export async function POST(context: APIContext)`
   - Parse JSON body
   - Walidacja Zod schema
   - Call `TransactionService.createTransaction(supabase, userId, command)`

3. **Service** (`src/lib/services/transaction.service.ts`):
   - **Krok 1**: Query `transaction_categories` aby sprawdzić:
     - Czy `category_code` istnieje
     - Czy `is_active = true`
     - Czy `kind` pasuje do `command.type` (INCOME → INCOME, EXPENSE → EXPENSE)
   - **Krok 2**: Insert do `transactions`:
     ```sql
     INSERT INTO transactions (
       user_id, type, category_code, amount_cents, 
       occurred_on, note, client_request_id,
       created_by, updated_by
     ) VALUES (...)
     ```
   - RLS automatycznie sprawdzi `email_confirmed` i właściciela
   - **Krok 3**: Fetch inserted transaction z joined `category_label`:
     ```sql
     SELECT t.*, tc.label_pl as category_label
     FROM transactions t
     JOIN transaction_categories tc ON t.category_code = tc.code
     WHERE t.id = <inserted_id>
     ```
   - **Krok 4**: Map do `TransactionDTO` i return

4. **Database Trigger** (automatyczny):
   - Po INSERT trigger aktualizuje `monthly_metrics`
   - Increments `income_cents` lub `expenses_cents`
   - Recalculates `free_cash_flow_cents`

5. **Response**:
   - Endpoint zwraca 201 + `TransactionDTO`

### Interakcje z bazą danych

**Tabele**:
- `transactions` (INSERT + SELECT)
- `transaction_categories` (SELECT dla walidacji)
- `monthly_metrics` (UPDATE przez trigger)
- `audit_log` (INSERT przez trigger na transactions)

**Indeksy wykorzystywane**:
- `uniq_transactions_request(user_id, client_request_id)` - idempotencja
- `idx_tx_user(user_id)` - RLS i query
- `transaction_categories_pkey(code)` - lookup kategorii

---

## 6. Względy bezpieczeństwa

### Uwierzytelnianie i autoryzacja

1. **Middleware Auth**:
   - Sprawdza `context.locals.user` (sesja Supabase)
   - Jeśli brak → 401 przed wywołaniem handlera

2. **Row Level Security (RLS)**:
   - Polityka INSERT na `transactions`:
     ```sql
     WITH CHECK (
       user_id = auth.uid() 
       AND EXISTS (
         SELECT 1 FROM profiles 
         WHERE user_id = auth.uid() 
         AND email_confirmed = true
       )
     )
     ```
   - Automatycznie blokuje niezweryfikowanych użytkowników
   - Blokuje próby wstawienia transakcji dla innego user_id

3. **User ID z sesji**:
   - Zawsze używać `context.locals.user.id` z middleware
   - NIGDY nie ufać `user_id` z request body

### Walidacja danych

1. **Zod Schema** (format i typy):
   ```typescript
   const CreateTransactionSchema = z.object({
     type: z.enum(["INCOME", "EXPENSE"]),
     category_code: z.string().min(1),
     amount_cents: z.number().int().positive(),
     occurred_on: z.string()
       .regex(/^\d{4}-\d{2}-\d{2}$/)
       .refine(date => new Date(date) <= new Date(), {
         message: "Transaction date cannot be in the future"
       }),
     note: z.string()
       .max(500)
       .regex(/^[^\x00-\x1F\x7F]*$/, "Note cannot contain control characters")
       .nullable()
       .optional(),
     client_request_id: z.string().uuid()
   });
   ```

2. **Business validation** (w service):
   - Category exists and is_active
   - Category kind matches transaction type
   - Database constraints (NOT NULL, CHECK) jako ostatnia linia obrony

### Ochrona przed atakami

1. **SQL Injection**:
   - Supabase client używa prepared statements
   - Nie budujemy raw SQL z user input

2. **XSS**:
   - Field `note` przechowujemy jako raw text
   - Sanityzacja następuje na frontend przy wyświetlaniu (DOMPurify lub podobne)
   - Backend nie modyfikuje note (poza validacją długości i braku control chars)

3. **CSRF**:
   - Astro middleware może sprawdzać origin
   - Supabase session cookies z `SameSite=Lax` i `Secure`

4. **Rate Limiting**:
   - W MVP: brak (opcjonalnie można dodać w middleware)
   - Tabela `rate_limits` jest gotowa dla przyszłych potrzeb

5. **Idempotencja**:
   - `client_request_id` zapobiega duplikatom przy retry
   - Unique constraint `(user_id, client_request_id)` w bazie

### HTTPS i Transport

- Wymagane HTTPS dla wszystkich requestów (konfiguracja hostingu)
- Supabase session token przesyłany w Authorization header lub secure cookie

---

## 7. Obsługa błędów

### Kategorie błędów

| Kod | Scenariusz | Message | Details |
|-----|-----------|---------|---------|
| **400** | Błędny JSON | "Invalid request body" | Zod validation errors |
| **401** | Brak sesji | "User not authenticated or email not verified" | - |
| **409** | Duplikat client_request_id | "Transaction with this client_request_id already exists" | - |
| **422** | Data w przyszłości | "Transaction date cannot be in the future" | `{"occurred_on": "..."}` |
| **422** | Nieistniejąca kategoria | "Category code does not exist or is inactive" | `{"category_code": "..."}` |
| **422** | Niezgodność type/kind | "Category X is not valid for Y transactions" | `{"category_code": "..."}` |
| **500** | Błąd bazy | "An unexpected error occurred" | - (log szczegóły server-side) |

### Implementacja obsługi błędów

**W endpoint handler**:
```typescript
try {
  // Zod validation
  const command = CreateTransactionSchema.parse(body);
  
  // Service call
  const transaction = await TransactionService.createTransaction(
    context.locals.supabase,
    context.locals.user.id,
    command
  );
  
  return new Response(JSON.stringify(transaction), {
    status: 201,
    headers: { "Content-Type": "application/json" }
  });
  
} catch (error) {
  if (error instanceof z.ZodError) {
    // 400 Bad Request
    return new Response(JSON.stringify({
      error: "Bad Request",
      message: "Invalid request body",
      details: formatZodErrors(error)
    }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  
  if (error instanceof ValidationError) {
    // 422 Unprocessable Entity
    return new Response(JSON.stringify({
      error: "Unprocessable Entity",
      message: error.message,
      details: error.details
    }), { status: 422, headers: { "Content-Type": "application/json" } });
  }
  
  if (error.code === "23505") { // Unique constraint violation
    // 409 Conflict
    return new Response(JSON.stringify({
      error: "Conflict",
      message: "Transaction with this client_request_id already exists"
    }), { status: 409, headers: { "Content-Type": "application/json" } });
  }
  
  // 500 Internal Server Error
  console.error("Unexpected error:", error);
  return new Response(JSON.stringify({
    error: "Internal Server Error",
    message: "An unexpected error occurred. Please try again later."
  }), { status: 500, headers: { "Content-Type": "application/json" } });
}
```

**W service layer**:
- Rzuć custom `ValidationError` dla błędów biznesowych
- Pozwól Supabase errors propagować dla 500
- Dla 409 (duplikat): można opcjonalnie fetch istniejącą transakcję i zwrócić

### Logging

**Co logować**:
- 500 errors: pełny stack trace + context
- 422 errors: message + user_id (dla analityki)
- 409 errors: user_id + client_request_id (monitoring duplikatów)

**Gdzie logować**:
- Console.error dla development
- W produkcji: rozważyć integrację z Sentry/LogRocket (opcjonalne w MVP)

---

## 8. Rozważania dotyczące wydajności

### Potencjalne wąskie gardła

1. **Query transaction_categories**:
   - **Problem**: Dodatkowy SELECT przed INSERT
   - **Mitigacja**: Cache kategorii w pamięci (dict code → kind) z TTL 5 min
   - **Alternatywa**: Złożony FK w bazie sprawdzi automatycznie (może zwrócić mniej czytelny błąd)

2. **Joined SELECT po INSERT**:
   - **Problem**: Drugi query do fetch z label
   - **Mitigacja**: Używamy indeksów (PK + FK), szybki lookup
   - **Alternatywa**: RETURNING clause z JOIN w INSERT (ale Supabase może to komplikować)

3. **Trigger na monthly_metrics**:
   - **Problem**: Dodatkowy UPDATE w tej samej transakcji
   - **Impact**: Minimalny, jeden wiersz UPDATE z indeksem (user_id, month)
   - **Mitigacja**: Już zoptymalizowane (inkrementalne updates, nie full recalculation)

4. **RLS check**:
   - **Problem**: Subquery do profiles przy każdym INSERT
   - **Impact**: Akceptowalny dla MVP (pojedynczy row lookup z PK)
   - **Mitigacja**: Index na profiles(user_id, email_confirmed)

### Strategie optymalizacji

1. **Database indexes** (już zdefiniowane w db-plan.md):
   - `uniq_transactions_request(user_id, client_request_id)` - idempotencja
   - `idx_tx_user(user_id)` - RLS
   - `transaction_categories_pkey(code)` - validation lookup
   - `monthly_metrics_pkey(user_id, month)` - trigger update

2. **Caching** (opcjonalne, nie w MVP):
   - Cache `transaction_categories` dict w Redis/memory
   - TTL: 5 minut (rzadko się zmienia)
   - Invalidation: przy UPDATE kategorii

3. **Connection pooling**:
   - Supabase zarządza automatycznie
   - Astro może używać singleton Supabase client

4. **Response size**:
   - TransactionDTO jest lekki (~200-300 bytes)
   - Brak paginacji (single item response)

### Metryki do monitorowania

- P95 response time dla POST /api/v1/transactions
- Rate 409 errors (duplikaty) - wskaźnik problemów z retry
- Rate 422 errors (validation) - wskaźnik UX issues
- Database query time dla INSERT + SELECT

**Target**: < 200ms P95 dla całego flow (realistyczne dla Supabase Free tier)

---

## 9. Etapy wdrożenia

### Krok 1: Przygotowanie środowiska
- [ ] Upewnić się, że migracje bazy danych są uruchomione:
  - Tabela `transactions` z RLS
  - Tabela `transaction_categories` z danymi seed
  - Trigger na `monthly_metrics`
  - Trigger na `audit_log`
- [ ] Zweryfikować konfigurację middleware auth w `src/middleware/index.ts`

### Krok 2: Definicja Zod schema
- [ ] Utworzyć plik `src/lib/schemas/transaction.schema.ts`
- [ ] Zdefiniować `CreateTransactionSchema`:
  ```typescript
  import { z } from "zod";
  
  export const CreateTransactionSchema = z.object({
    type: z.enum(["INCOME", "EXPENSE"]),
    category_code: z.string().min(1),
    amount_cents: z.number().int().positive(),
    occurred_on: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (date) => new Date(date) <= new Date(),
        { message: "Transaction date cannot be in the future" }
      ),
    note: z.string()
      .max(500)
      .regex(/^[^\x00-\x1F\x7F]*$/, {
        message: "Note cannot contain control characters"
      })
      .nullable()
      .optional(),
    client_request_id: z.string().uuid()
  });
  ```

### Krok 3: Implementacja TransactionService
- [ ] Utworzyć plik `src/lib/services/transaction.service.ts`
- [ ] Zaimportować typy:
  ```typescript
  import type { SupabaseClient } from "@/db/supabase.client";
  import type { CreateTransactionCommand, TransactionDTO } from "@/types";
  ```
- [ ] Zdefiniować custom error class:
  ```typescript
  export class ValidationError extends Error {
    constructor(
      message: string,
      public details?: Record<string, string>
    ) {
      super(message);
      this.name = "ValidationError";
    }
  }
  ```
- [ ] Implementować `createTransaction()`:
  ```typescript
  export async function createTransaction(
    supabase: SupabaseClient,
    userId: string,
    command: CreateTransactionCommand
  ): Promise<TransactionDTO> {
    // 1. Validate category
    const { data: category, error: categoryError } = await supabase
      .from("transaction_categories")
      .select("kind, is_active")
      .eq("code", command.category_code)
      .single();
    
    if (categoryError || !category) {
      throw new ValidationError(
        "Category code does not exist or is inactive",
        { category_code: command.category_code }
      );
    }
    
    if (!category.is_active) {
      throw new ValidationError(
        "Category is not active",
        { category_code: command.category_code }
      );
    }
    
    if (category.kind !== command.type) {
      throw new ValidationError(
        `Category ${command.category_code} is not valid for ${command.type} transactions`,
        { 
          category_code: `Category kind ${category.kind} does not match transaction type ${command.type}` 
        }
      );
    }
    
    // 2. Insert transaction
    const { data: transaction, error: insertError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: command.type,
        category_code: command.category_code,
        amount_cents: command.amount_cents,
        occurred_on: command.occurred_on,
        note: command.note ?? null,
        client_request_id: command.client_request_id,
        created_by: userId,
        updated_by: userId
      })
      .select(`
        id,
        type,
        category_code,
        amount_cents,
        occurred_on,
        note,
        created_at,
        updated_at,
        transaction_categories!inner(label_pl)
      `)
      .single();
    
    if (insertError) {
      // Let it propagate for 500 or rethrow specific codes
      throw insertError;
    }
    
    // 3. Map to DTO
    return {
      id: transaction.id,
      type: transaction.type,
      category_code: transaction.category_code,
      category_label: transaction.transaction_categories.label_pl,
      amount_cents: transaction.amount_cents,
      occurred_on: transaction.occurred_on,
      note: transaction.note,
      created_at: transaction.created_at,
      updated_at: transaction.updated_at
    };
  }
  ```

### Krok 4: Utworzenie endpoint handler
- [ ] Utworzyć plik `src/pages/api/v1/transactions/index.ts`
- [ ] Dodać `export const prerender = false;`
- [ ] Zaimportować zależności:
  ```typescript
  import type { APIContext } from "astro";
  import { z } from "zod";
  import { CreateTransactionSchema } from "@/lib/schemas/transaction.schema";
  import { createTransaction, ValidationError } from "@/lib/services/transaction.service";
  import type { ErrorResponseDTO } from "@/types";
  ```
- [ ] Implementować helper do formatowania Zod errors:
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
- [ ] Implementować POST handler:
  ```typescript
  export async function POST(context: APIContext) {
    // Auth check (middleware should handle this, but double-check)
    if (!context.locals.user) {
      const errorResponse: ErrorResponseDTO = {
        error: "Unauthorized",
        message: "User not authenticated or email not verified"
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    try {
      // Parse and validate request body
      const body = await context.request.json();
      const command = CreateTransactionSchema.parse(body);
      
      // Call service
      const transaction = await createTransaction(
        context.locals.supabase,
        context.locals.user.id,
        command
      );
      
      // Return 201 Created
      return new Response(JSON.stringify(transaction), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
      
    } catch (error) {
      // Zod validation errors
      if (error instanceof z.ZodError) {
        const errorResponse: ErrorResponseDTO = {
          error: "Bad Request",
          message: "Invalid request body",
          details: formatZodErrors(error)
        };
        return new Response(JSON.stringify(errorResponse), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      // Business validation errors
      if (error instanceof ValidationError) {
        const errorResponse: ErrorResponseDTO = {
          error: "Unprocessable Entity",
          message: error.message,
          details: error.details
        };
        return new Response(JSON.stringify(errorResponse), {
          status: 422,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      // Unique constraint violation (duplicate client_request_id)
      if (error?.code === "23505") {
        const errorResponse: ErrorResponseDTO = {
          error: "Conflict",
          message: "Transaction with this client_request_id already exists"
        };
        return new Response(JSON.stringify(errorResponse), {
          status: 409,
          headers: { "Content-Type": "application/json" }
        });
      }
      
      // Unexpected errors
      console.error("Unexpected error in POST /api/v1/transactions:", error);
      const errorResponse: ErrorResponseDTO = {
        error: "Internal Server Error",
        message: "An unexpected error occurred. Please try again later."
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
  ```

### Krok 5: Testy manualne
- [ ] Test happy path:
  ```bash
  curl -X POST http://localhost:4321/api/v1/transactions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer <token>" \
    -d '{
      "type": "EXPENSE",
      "category_code": "GROCERIES",
      "amount_cents": 15750,
      "occurred_on": "2025-01-15",
      "note": "Test zakupu",
      "client_request_id": "550e8400-e29b-41d4-a716-446655440000"
    }'
  ```
  - Oczekiwane: 201 + TransactionDTO z category_label
- [ ] Test 401 (brak tokenu)
- [ ] Test 400 (błędny JSON / missing fields)
- [ ] Test 422 (data w przyszłości)
- [ ] Test 422 (nieistniejąca kategoria)
- [ ] Test 422 (INCOME + kategoria EXPENSE)
- [ ] Test 409 (duplikat client_request_id - retry tego samego requesta)

### Krok 6: Weryfikacja efektów ubocznych
- [ ] Sprawdzić w bazie, czy trigger zaktualizował `monthly_metrics`:
  ```sql
  SELECT * FROM monthly_metrics 
  WHERE user_id = '<test_user_id>' 
  AND month = '2025-01-01';
  ```
  - Oczekiwane: `expenses_cents` zwiększone o 15750
- [ ] Sprawdzić w bazie, czy trigger utworzył wpis w `audit_log`:
  ```sql
  SELECT * FROM audit_log 
  WHERE entity_type = 'transaction' 
  AND entity_id = '<created_transaction_id>';
  ```
  - Oczekiwane: wpis z action='CREATE' i after={...}

### Krok 7: Code review i linting
- [ ] Uruchomić linter:
  ```bash
  npm run lint
  ```
- [ ] Sprawdzić formatowanie (Prettier/ESLint)
- [ ] Upewnić się, że używamy podwójnych cudzysłowów (`"`) wszędzie
- [ ] Sprawdzić, czy wszystkie importy używają `@/` aliasu

### Krok 8: Dokumentacja i commit
- [ ] Zaktualizować plik `.ai/api-plan.md` jeśli są różnice w implementacji
- [ ] Dodać komentarze JSDoc do funkcji serwisowych
- [ ] Commit z opisowym komunikatem:
  ```
  feat: implement POST /api/v1/transactions endpoint
  
  - Add CreateTransactionSchema with Zod validation
  - Implement TransactionService.createTransaction()
  - Add endpoint handler with error handling
  - Validate category code and type consistency
  - Support idempotency via client_request_id
  ```

### Krok 9: (Opcjonalne) Testy automatyczne
- [ ] Utworzyć test suite dla TransactionService (Vitest):
  - Test walidacji kategorii
  - Test insert success path
  - Test error handling
- [ ] Utworzyć test integracyjny dla endpointu:
  - Mock Supabase client
  - Test różnych scenariuszy odpowiedzi

---

## 10. Checklist finalny przed merge

- [ ] Endpoint zwraca 201 dla poprawnego requesta
- [ ] Endpoint zwraca 400 dla błędów walidacji Zod
- [ ] Endpoint zwraca 401 dla niezalogowanych użytkowników
- [ ] Endpoint zwraca 409 dla duplikatu client_request_id
- [ ] Endpoint zwraca 422 dla błędów walidacji biznesowej
- [ ] Endpoint zwraca 500 dla nieoczekiwanych błędów (z logowaniem)
- [ ] TransactionDTO zawiera joined category_label
- [ ] Trigger aktualizuje monthly_metrics po INSERT
- [ ] Trigger tworzy wpis w audit_log
- [ ] RLS blokuje niezweryfikowanych użytkowników
- [ ] Kod używa podwójnych cudzysłowów (`"`)
- [ ] Wszystkie importy używają aliasu `@/`
- [ ] Linter przechodzi bez błędów
- [ ] Dokumentacja jest aktualna

---

## 11. Przyszłe usprawnienia (post-MVP)

1. **Caching kategorii**: In-memory cache dla transaction_categories
2. **Rate limiting**: Middleware sprawdzający limit requestów per user
3. **Batch operations**: Endpoint do tworzenia wielu transakcji jednocześnie
4. **Webhooks**: Powiadomienie po utworzeniu transakcji (opcjonalne)
5. **Audit enrichment**: Dodatkowe metadata w audit_log (IP, user agent)
6. **Metrics**: Integration z monitoring (Sentry, DataDog)
7. **Soft delete recovery**: Endpoint do przywracania soft-deleted transactions
8. **CSV import**: Bulk import transakcji z pliku

---

## Podsumowanie

Ten plan implementacji pokrywa wszystkie aspekty endpointu POST /api/v1/transactions zgodnie z PRD i specyfikacją API. Kluczowe punkty:

- **Bezpieczeństwo**: RLS + middleware auth + walidacja
- **Idempotencja**: client_request_id zapobiega duplikatom
- **Walidacja**: Zod (format) + service layer (biznes)
- **Error handling**: Szczegółowe kody statusu i messages
- **Wydajność**: Optymalne indeksy i minimal queries
- **Maintainability**: Separation of concerns (endpoint → service → database)

Implementacja powinna zająć ~2-4h dla doświadczonego developera, włączając testy manualne.

