# API Endpoint Implementation Plan: POST /api/v1/goal-events

## 1. Przegląd punktu końcowego

Endpoint `POST /api/v1/goal-events` służy do dodawania depozytów (DEPOSIT) lub wypłat (WITHDRAW) do celów oszczędnościowych użytkownika. Jest to kluczowa operacja, która atomowo modyfikuje saldo celu i automatycznie aktualizuje metryki miesięczne.

**Kluczowa charakterystyka**: Ten endpoint NIE wykonuje bezpośrednio operacji INSERT/UPDATE, ale wywołuje funkcję PostgreSQL `rpc.add_goal_event()` (SECURITY DEFINER), która w jednej transakcji:

1. Waliduje własność celu i status (nie-zarchiwizowany, nie-usunięty)
2. Blokuje wiersz celu (SELECT ... FOR UPDATE) - zapobiega race conditions
3. Waliduje wystarczające saldo dla WITHDRAW
4. Wstawia rekord goal_event z idempotencją (unique constraint na user_id, client_request_id)
5. Aktualizuje goal.current_balance_cents
6. Triggeruje automatyczne przeliczenie monthly_metrics

**Odpowiedzialność warstw:**

- **API endpoint** (`/src/pages/api/v1/goal-events/index.ts`): Walidacja schematu (Zod), orchestracja, mapowanie błędów
- **Service layer** (`/src/lib/services/goal-event.service.ts`): Business logic, wywołanie RPC, konstrukcja DTO
- **Database (RPC function)**: Transakcyjna logika, walidacja biznesowa na poziomie bazy, blokady, idempotencja

## 2. Szczegóły żądania

### Metoda HTTP

`POST`

### Struktura URL

`/api/v1/goal-events`

### Request Headers

```
Content-Type: application/json
```

### Request Body (CreateGoalEventCommand)

```json
{
  "goal_id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "DEPOSIT",
  "amount_cents": 50000,
  "occurred_on": "2025-01-15",
  "client_request_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
}
```

### Parametry Request Body

#### Wymagane parametry:

| Pole                | Typ           | Opis                                            | Walidacja                                                                           |
| ------------------- | ------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `goal_id`           | string (uuid) | Identyfikator celu oszczędnościowego            | Format UUID, cel musi istnieć i należeć do użytkownika, nie może być zarchiwizowany |
| `type`              | string        | Typ operacji                                    | Enum: "DEPOSIT" lub "WITHDRAW"                                                      |
| `amount_cents`      | number        | Kwota w groszach                                | Integer, > 0                                                                        |
| `occurred_on`       | string        | Data operacji (YYYY-MM-DD)                      | Format YYYY-MM-DD, <= current_date                                                  |
| `client_request_id` | string        | Unikalny identyfikator żądania dla idempotencji | Non-empty string, preferowane UUID                                                  |

#### Opcjonalne parametry:

Brak

### Uwagi dotyczące parametrów:

- **goal_id**: Musi wskazywać na istniejący cel użytkownika. Cele zarchiwizowane (`archived_at != null`) są niedostępne dla nowych operacji.
- **type**:
  - `DEPOSIT`: Dodaje kwotę do salda celu
  - `WITHDRAW`: Odejmuje kwotę od salda celu (wymaga wystarczającego salda)
- **amount_cents**: Przechowywanie w groszach zapewnia precyzję i unika problemów z zaokrąglaniem float
- **occurred_on**: Data historyczna operacji. Może być w przeszłości (dla wpisów historycznych), ale nie w przyszłości. Wpływa na miesiąc w `monthly_metrics`.
- **client_request_id**: Kluczowy dla idempotencji. Ten sam `client_request_id` dla tego samego użytkownika zwróci oryginalny wynik bez duplikowania operacji. Rekomendowane: UUID v4/v7 generowane po stronie klienta.

## 3. Wykorzystywane typy

### Z src/types.ts (istniejące):

```typescript
// Command dla request body
export type CreateGoalEventCommand = Pick<
  GoalEventEntity,
  "goal_id" | "type" | "amount_cents" | "occurred_on" | "client_request_id"
>;

// DTO dla response (201 Created)
export interface GoalEventDetailDTO extends GoalEventDTO {
  goal_balance_after_cents: number; // Saldo celu po operacji
}

// Base DTO (używany w GoalEventDetailDTO)
export type GoalEventDTO = Pick<
  GoalEventEntity,
  "id" | "goal_id" | "type" | "amount_cents" | "occurred_on" | "created_at"
> & {
  goal_name: string; // Joined z goals.name
};

// Standardowa struktura błędów
export interface ErrorResponseDTO {
  error: string;
  message: string;
  details?: Record<string, string>;
  retry_after_seconds?: number;
}
```

### Nowe typy do stworzenia:

**1. Zod Schema (`/src/lib/schemas/goal-event.schema.ts`)**

```typescript
import { z } from "zod";

/**
 * Zod schema for CreateGoalEventCommand
 * Validates incoming request data for POST /api/v1/goal-events
 *
 * Validation rules:
 * - goal_id: Required, valid UUID format
 * - type: Required, must be DEPOSIT or WITHDRAW
 * - amount_cents: Required, positive integer
 * - occurred_on: Required, valid date format YYYY-MM-DD (business rule <= current_date checked in service)
 * - client_request_id: Required, non-empty string for idempotency
 */
export const CreateGoalEventSchema = z.object({
  goal_id: z.string({ required_error: "Goal ID is required" }).uuid("Goal ID must be a valid UUID"),

  type: z.enum(["DEPOSIT", "WITHDRAW"], {
    required_error: "Type is required",
    invalid_type_error: "Type must be DEPOSIT or WITHDRAW",
  }),

  amount_cents: z
    .number({
      required_error: "Amount is required",
      invalid_type_error: "Amount must be a number",
    })
    .int("Amount must be an integer")
    .positive("Amount must be greater than 0"),

  occurred_on: z
    .string({ required_error: "Occurred date is required" })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Occurred date must be in YYYY-MM-DD format")
    .refine(
      (date) => {
        const parsed = new Date(date);
        return !isNaN(parsed.getTime());
      },
      { message: "Occurred date must be a valid date" }
    ),

  client_request_id: z
    .string({ required_error: "Client request ID is required" })
    .min(1, "Client request ID cannot be empty"),
});
```

## 4. Szczegóły odpowiedzi

### Success Response: 201 Created

```json
{
  "id": "8f7d9c5e-3b2a-4f1e-9d8c-7a6b5c4d3e2f",
  "goal_id": "550e8400-e29b-41d4-a716-446655440000",
  "goal_name": "Wakacje w Grecji",
  "type": "DEPOSIT",
  "amount_cents": 50000,
  "occurred_on": "2025-01-15",
  "created_at": "2025-01-15T18:30:00.000Z",
  "goal_balance_after_cents": 175000
}
```

**Struktura**: `GoalEventDetailDTO`

**Pola odpowiedzi:**

- `id`: UUID wygenerowany przez bazę danych dla nowego goal_event
- `goal_id`: ID celu (echo z request)
- `goal_name`: Nazwa celu (joined z tabeli goals)
- `type`: Typ operacji (echo z request)
- `amount_cents`: Kwota operacji (echo z request)
- `occurred_on`: Data operacji (echo z request)
- `created_at`: Timestamp utworzenia rekordu w bazie
- `goal_balance_after_cents`: **Kluczowe pole** - aktualne saldo celu PO tej operacji

### Error Responses

#### 400 Bad Request - Nieprawidłowy format danych (Zod validation)

```json
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "goal_id": "Goal ID must be a valid UUID",
    "amount_cents": "Amount must be greater than 0"
  }
}
```

**Kiedy**:

- Brak wymaganego pola
- Nieprawidłowy format UUID w goal_id
- type nie jest "DEPOSIT" ani "WITHDRAW"
- amount_cents nie jest positive integer
- occurred_on nie jest w formacie YYYY-MM-DD
- Brak lub pusty client_request_id

#### 404 Not Found - Cel nie istnieje lub jest zarchiwizowany

```json
{
  "error": "Not Found",
  "message": "Goal not found or is archived",
  "details": {
    "goal_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Kiedy**:

- Cel o podanym goal_id nie istnieje
- Cel należy do innego użytkownika (RLS)
- Cel jest zarchiwizowany (archived_at != null)
- Cel jest soft-deleted (deleted_at != null)

#### 409 Conflict - Duplikat lub niewystarczające saldo

**Przypadek 1: Duplikat client_request_id (idempotencja)**

```json
{
  "error": "Conflict",
  "message": "Goal event with this client_request_id already exists",
  "details": {
    "client_request_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
  }
}
```

**Przypadek 2: Niewystarczające saldo dla WITHDRAW**

```json
{
  "error": "Conflict",
  "message": "Insufficient balance for withdrawal",
  "details": {
    "current_balance_cents": "100000",
    "requested_amount_cents": "150000"
  }
}
```

**Kiedy**:

- Ten sam user_id + client_request_id już istnieje w goal_events (unique constraint)
- Dla WITHDRAW: amount_cents > goal.current_balance_cents

#### 422 Unprocessable Entity - Business validation

```json
{
  "error": "Unprocessable Entity",
  "message": "Occurred date cannot be in the future",
  "details": {
    "occurred_on": "2025-01-15",
    "current_date": "2025-01-14"
  }
}
```

**Kiedy**:

- occurred_on > current_date (data w przyszłości)
- Inne business rules naruszenia

#### 500 Internal Server Error

```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred. Please try again later."
}
```

**Kiedy**: Nieoczekiwane błędy bazy danych, błędy systemu

## 5. Przepływ danych

### High-level flow:

```
Client Request
    ↓
[1] API Endpoint (/src/pages/api/v1/goal-events/index.ts)
    → Parse request body
    → Validate with Zod (CreateGoalEventSchema)
    ↓
[2] Service Layer (/src/lib/services/goal-event.service.ts)
    → Validate business rules (pre-RPC checks)
    → Call Supabase RPC: rpc.add_goal_event()
    ↓
[3] PostgreSQL RPC Function (rpc.add_goal_event)
    → BEGIN TRANSACTION
    → Verify goal ownership & status (user_id, archived_at, deleted_at)
    → SELECT ... FOR UPDATE on goals (row lock)
    → Validate occurred_on <= current_date
    → Validate WITHDRAW: amount_cents <= current_balance_cents
    → INSERT goal_events (idempotency: unique constraint user_id, client_request_id)
    → UPDATE goals SET current_balance_cents = current_balance_cents +/- amount_cents
    → Trigger: update monthly_metrics (net_saved_cents, free_cash_flow_cents)
    → COMMIT TRANSACTION
    → RETURN new goal_event row
    ↓
[4] Service Layer (continued)
    → Fetch created goal_event with joined goal_name
    → Fetch updated goal balance (current_balance_cents)
    → Construct GoalEventDetailDTO
    → Return to endpoint
    ↓
[5] API Endpoint (continued)
    → Return 201 Created with GoalEventDetailDTO
    ↓
Client Response
```

### Detailed step-by-step w Service Layer:

**Funkcja: `createGoalEvent(supabase, userId, command)`**

```typescript
// STEP 1: Pre-validation - Check if goal exists and is accessible
const goal = await supabase
  .from("goals")
  .select("id, current_balance_cents, archived_at, deleted_at")
  .eq("id", command.goal_id)
  .eq("user_id", userId)
  .maybeSingle();

// If goal not found → 404
if (!goal) {
  throw new NotFoundError("Goal not found");
}

// If goal archived → 404
if (goal.archived_at) {
  throw new NotFoundError("Goal is archived");
}

// If goal soft-deleted → 404
if (goal.deleted_at) {
  throw new NotFoundError("Goal is deleted");
}

// STEP 2: Validate future date (business rule)
const today = new Date().toISOString().split("T")[0];
if (command.occurred_on > today) {
  throw new ValidationError("Occurred date cannot be in the future");
}

// STEP 3: Call RPC function (handles transaction, lock, balance update)
const { data: rpcResult, error: rpcError } = await supabase.rpc("add_goal_event", {
  p_goal_id: command.goal_id,
  p_type: command.type,
  p_amount_cents: command.amount_cents,
  p_occurred_on: command.occurred_on,
  p_client_request_id: command.client_request_id,
});

// Handle RPC errors:
// - Duplicate client_request_id (23505 unique_violation) → 409
// - Insufficient balance (custom P0001) → 409
// - Other errors → 500

// STEP 4: Fetch created goal_event with joined goal_name
const { data: goalEvent } = await supabase
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
  .eq("id", rpcResult.goal_event_id)
  .single();

// STEP 5: Fetch updated goal balance
const { data: updatedGoal } = await supabase
  .from("goals")
  .select("current_balance_cents")
  .eq("id", command.goal_id)
  .single();

// STEP 6: Construct GoalEventDetailDTO
const dto: GoalEventDetailDTO = {
  id: goalEvent.id,
  goal_id: goalEvent.goal_id,
  goal_name: goalEvent.goals.name,
  type: goalEvent.type,
  amount_cents: goalEvent.amount_cents,
  occurred_on: goalEvent.occurred_on,
  created_at: goalEvent.created_at,
  goal_balance_after_cents: updatedGoal.current_balance_cents,
};

return dto;
```

### Interakcje z bazą danych:

**Tabele odczytywane:**

- `goals` - weryfikacja istnienia i statusu, SELECT ... FOR UPDATE w RPC
- `goal_events` - odczyt utworzonego wydarzenia
- `goal_types` - pośrednio przez FK w goals (walidacja w RLS)

**Tabele modyfikowane:**

- `goal_events` - INSERT nowego wydarzenia (przez RPC)
- `goals` - UPDATE current_balance_cents (przez RPC)
- `monthly_metrics` - UPDATE lub INSERT (przez trigger po goal_events INSERT)
- `audit_log` - INSERT (przez trigger po goal_events INSERT)

**Funkcje RPC:**

- `add_goal_event()` - główna logika transakcyjna

**Triggery aktywowane:**

- Trigger na goal_events (AFTER INSERT) → audit_log
- Trigger na goal_events (AFTER INSERT) → monthly_metrics recalculation

## 6. Względy bezpieczeństwa

### 6.1. Autentykacja i Autoryzacja

**Obecny stan (development):**

- Tymczasowo używany `DEFAULT_USER_ID` (jak w innych endpointach)
- Auth będzie implementowany kompleksowo w przyszłej iteracji

**Docelowy stan (production):**

```typescript
// Verify user is authenticated
if (!context.locals.user) {
  return new Response(
    JSON.stringify({
      error: "Unauthorized",
      message: "Authentication required",
    }),
    { status: 401 }
  );
}

const userId = context.locals.user.id;
```

### 6.2. Row-Level Security (RLS)

**goals table:**

- Polityka SELECT: `user_id = auth.uid() AND email_confirmed`
- Zapewnia, że użytkownik widzi tylko swoje cele

**goal_events table:**

- Polityka SELECT: `user_id = auth.uid() AND email_confirmed`
- **BRAK polityki INSERT dla klienta** - wstawianie TYLKO przez RPC function
- Chroni przed bezpośrednim wstawianiem z pominięciem walidacji i logiki salda

**Funkcja RPC add_goal_event():**

- `SECURITY DEFINER` - wykonuje się z uprawnieniami właściciela funkcji
- Wewnętrznie weryfikuje: `goal.user_id = auth.uid()`
- Weryfikuje: `profiles.email_confirmed = true`
- Gwarantuje atomowość i spójność operacji

### 6.3. Walidacja danych wejściowych

**Warstwa 1: Zod Schema (400 Bad Request)**

- Validacja typu i formatu danych
- Zapobiega SQL injection (UUID format)
- Zapobiega type confusion attacks

**Warstwa 2: Business Logic (422/409/404)**

- Weryfikacja własności zasobu (goal należy do użytkownika)
- Weryfikacja stanu zasobu (goal nie zarchiwizowany, nie usunięty)
- Weryfikacja business rules (data, saldo)

**Warstwa 3: Database constraints**

- CHECK constraints: `amount_cents > 0`, `occurred_on <= current_date`
- UNIQUE constraint: `(user_id, client_request_id)` - idempotencja
- FK constraints: goal_id → goals(id), user_id → profiles(user_id)

### 6.4. Idempotencja i Race Conditions

**Idempotencja:**

- Unique constraint na `(user_id, client_request_id)` w `goal_events`
- Ten sam request (ten sam client_request_id) nie zostanie wykonany dwukrotnie
- Zwraca 409 Conflict z informacją o duplikacie

**Race Conditions:**

- `SELECT ... FOR UPDATE` w RPC function blokuje wiersz `goals`
- Zapobiega równoczesnym modyfikacjom salda przez wiele requestów
- Gwarantuje ACID properties transakcji

**Insufficient Balance Race:**

```
Request A: WITHDRAW 100 (balance: 150)
Request B: WITHDRAW 100 (balance: 150)
Concurrent execution WITHOUT lock:
  → Both pass check (150 >= 100)
  → Final balance: -50 ❌

WITH SELECT ... FOR UPDATE:
  → Request A locks row, subtracts 100, commits → balance: 50
  → Request B waits for lock, checks (50 >= 100) → FAILS ✅
```

### 6.5. SQL Injection Prevention

- Supabase client używa prepared statements (parameterized queries)
- Wszystkie parametry do RPC są escapowane przez Supabase
- Zod validation zapewnia format UUID dla goal_id
- Brak raw SQL queries w aplikacji

### 6.6. XSS Prevention

- W tym endpoincie nie ma pól tekstowych od użytkownika (brak note, name)
- goal_name jest pobierane z bazy (trusted source)
- Response jest JSON - client odpowiedzialny za sanityzację przy renderowaniu

### 6.7. Audit Trail

- Każda operacja (INSERT goal_event) jest logowana do `audit_log` przez trigger
- Przechowuje: `owner_user_id`, `actor_user_id`, `entity_type`, `entity_id`, `action`, `before`, `after`, `performed_at`
- Retencja 30 dni (zgodnie z PRD)
- Umożliwia forensics w przypadku incydentów

### 6.8. Rate Limiting

**Uwaga**: Rate limiting nie jest implementowany na poziomie tego endpointu, ale zgodnie z tech-stack.md:

- Rate limiting (3 requests / 30 min) dotyczy operacji verify/reset w Auth
- Dla goal-events brak specjalnego rate limiting (chronione przez auth + RLS)
- W przyszłości można dodać limit na poziomie API gateway lub middleware

## 7. Obsługa błędów

### 7.1. Hierarchia obsługi błędów

```typescript
try {
  // 1. Parse & Validate (Zod)
  const command = CreateGoalEventSchema.parse(body);

  // 2. Business Logic (Service)
  const goalEvent = await createGoalEvent(supabase, userId, command);

  // 3. Success
  return new Response(JSON.stringify(goalEvent), { status: 201 });

} catch (error) {
  // Error handling cascade

  // Zod validation error → 400
  if (error instanceof z.ZodError) { ... }

  // NotFoundError → 404
  if (error instanceof NotFoundError) { ... }

  // Conflict errors → 409
  if (error instanceof ValidationError && error.code === "DUPLICATE_REQUEST") { ... }
  if (error instanceof ValidationError && error.code === "INSUFFICIENT_BALANCE") { ... }

  // Business validation → 422
  if (error instanceof ValidationError) { ... }

  // Unexpected errors → 500
  console.error("Unexpected error:", error);
  return { status: 500, error: "Internal Server Error" };
}
```

### 7.2. Szczegółowe mapowanie błędów

| Error Type                  | HTTP Status | Error Code            | Przykład                                                    |
| --------------------------- | ----------- | --------------------- | ----------------------------------------------------------- |
| Zod validation failed       | 400         | Bad Request           | Brak wymaganego pola, nieprawidłowy format                  |
| Goal not found              | 404         | Not Found             | goal_id nie istnieje lub należy do innego użytkownika       |
| Goal archived               | 404         | Not Found             | archived_at != null                                         |
| Goal soft-deleted           | 404         | Not Found             | deleted_at != null                                          |
| Duplicate client_request_id | 409         | Conflict              | Unique constraint violation na (user_id, client_request_id) |
| Insufficient balance        | 409         | Conflict              | WITHDRAW: amount > current_balance                          |
| Future date                 | 422         | Unprocessable Entity  | occurred_on > current_date                                  |
| Database error              | 500         | Internal Server Error | Connection lost, timeout                                    |
| RPC function error          | 500         | Internal Server Error | Unexpected error w funkcji PostgreSQL                       |

### 7.3. Error Classes w Service Layer

**Do stworzenia w `/src/lib/services/goal-event.service.ts`:**

```typescript
/**
 * Custom error for resource not found (404)
 */
export class NotFoundError extends Error {
  constructor(
    message: string,
    public details?: Record<string, string>
  ) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Custom error for business validation (422) and conflicts (409)
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public code?: string, // e.g., "DUPLICATE_REQUEST", "INSUFFICIENT_BALANCE"
    public details?: Record<string, string>
  ) {
    super(message);
    this.name = "ValidationError";
  }
}
```

### 7.4. Handling PostgreSQL Error Codes

Funkcja RPC `add_goal_event()` może zwrócić PostgreSQL error codes:

```typescript
// W service layer, po wywołaniu RPC:
if (rpcError) {
  // 23505: unique_violation (duplicate client_request_id)
  if (rpcError.code === "23505") {
    throw new ValidationError(
      "Goal event with this client_request_id already exists",
      "DUPLICATE_REQUEST",
      { client_request_id: command.client_request_id }
    );
  }

  // P0001: raise_exception (custom error z funkcji, np. insufficient balance)
  if (rpcError.code === "P0001" && rpcError.message.includes("Insufficient balance")) {
    throw new ValidationError(
      "Insufficient balance for withdrawal",
      "INSUFFICIENT_BALANCE",
      {
        current_balance_cents: /* extracted from error message */,
        requested_amount_cents: command.amount_cents.toString(),
      }
    );
  }

  // 23514: check_violation (CHECK constraint, np. occurred_on > current_date)
  if (rpcError.code === "23514") {
    throw new ValidationError("Date validation failed", undefined, {
      occurred_on: command.occurred_on,
    });
  }

  // Unexpected database error → rethrow as generic error (500)
  throw new Error(`Database error: ${rpcError.message}`);
}
```

### 7.5. Error Response Format

Wszystkie błędy zwracają `ErrorResponseDTO`:

```typescript
interface ErrorResponseDTO {
  error: string; // HTTP status name (e.g., "Bad Request", "Not Found")
  message: string; // Human-readable error message
  details?: Record<string, string>; // Field-level details
  retry_after_seconds?: number; // For rate limiting (not used here)
}
```

**Przykłady:**

```json
// 400 Bad Request
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "amount_cents": "Amount must be greater than 0",
    "occurred_on": "Occurred date must be in YYYY-MM-DD format"
  }
}

// 404 Not Found
{
  "error": "Not Found",
  "message": "Goal not found or is archived",
  "details": {
    "goal_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}

// 409 Conflict
{
  "error": "Conflict",
  "message": "Insufficient balance for withdrawal",
  "details": {
    "current_balance_cents": "100000",
    "requested_amount_cents": "150000"
  }
}

// 422 Unprocessable Entity
{
  "error": "Unprocessable Entity",
  "message": "Occurred date cannot be in the future",
  "details": {
    "occurred_on": "2025-12-31",
    "current_date": "2025-01-15"
  }
}

// 500 Internal Server Error
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred. Please try again later."
}
```

### 7.6. Logging Strategy

```typescript
// W endpoint, dla błędów 500:
console.error("Unexpected error in POST /api/v1/goal-events:", error);

// W service, dla krytycznych operacji:
console.log("Calling RPC add_goal_event for goal:", command.goal_id);
console.log("RPC completed successfully, event ID:", rpcResult.goal_event_id);

// Dla błędów biznesowych (NOT logged, to normalne przypadki):
// ValidationError, NotFoundError - brak console.error
```

## 8. Rozważania dotyczące wydajności

### 8.1. Potencjalne wąskie gardła

**1. Row Lock Duration (SELECT ... FOR UPDATE)**

- **Problem**: Długo trzymany lock na wierszu `goals` blokuje inne operacje na tym celu
- **Impact**: Jeśli RPC function jest wolna, inne requesty czekają
- **Mitigation**:
  - RPC function musi być szybka (tylko niezbędne operacje wewnątrz transakcji)
  - Unikać długich zapytań wewnątrz RPC
  - Timeout dla lock (default: wait indefinitely - można skonfigurować `lock_timeout`)

**2. Multiple Database Calls per Request**

- **Problem**: Service wykonuje multiple queries:
  1. Pre-validation: SELECT goal
  2. RPC call (wewnątrz: SELECT FOR UPDATE, INSERT, UPDATE)
  3. Post-RPC: SELECT goal_event z joined goal_name
  4. Post-RPC: SELECT updated goal balance
- **Impact**: Latencja sum(round-trips)
- **Mitigation**:
  - Połączyć query 3 i 4 w jeden (JOIN goals w tym samym SELECT)
  - RPC function może zwracać pełny goal_event + balance w jednym RETURN
  - Rozważyć: Pre-validation może być opcjonalna (RPC i tak to sprawdzi)

**3. Trigger Overhead (monthly_metrics recalculation)**

- **Problem**: Po każdym INSERT goal_event trigger aktualizuje `monthly_metrics`
- **Impact**: Wydłuża czas transakcji
- **Mitigation**:
  - Trigger musi być zoptymalizowany (inkrementalna aktualizacja, nie full recalc)
  - Indeksy na `goal_events(user_id, month, type)` przyspieszają agregacje
  - Rozważyć: async update monthly_metrics (queue/background job) - ale wtedy metryki nie będą immediate consistent

**4. Concurrent Requests for Same Goal**

- **Problem**: Wiele równoczesnych DEPOSIT/WITHDRAW na ten sam cel
- **Impact**: Requesty czekają na lock, increased latency
- **Mitigation**:
  - Nie da się uniknąć (potrzebujemy lock dla spójności)
  - Client-side: debounce / throttle requests
  - Monitoring: alert gdy lock wait time > threshold

### 8.2. Strategie optymalizacji

**Optymalizacja 1: Reduce Database Round-trips**

Obecny flow:

```
1. SELECT goals (pre-validation)
2. RPC add_goal_event
3. SELECT goal_events (fetch created event)
4. SELECT goals (fetch updated balance)
```

Zoptymalizowany flow:

```
1. RPC add_goal_event_optimized (returns full goal_event + balance)
```

**Implementacja:**

- Zmodyfikować RPC function, aby zwracała:
  ```sql
  RETURN QUERY
  SELECT
    ge.id, ge.goal_id, ge.type, ge.amount_cents, ge.occurred_on, ge.created_at,
    g.name AS goal_name,
    g.current_balance_cents AS goal_balance_after_cents
  FROM goal_events ge
  JOIN goals g ON ge.goal_id = g.id
  WHERE ge.id = v_goal_event_id;
  ```
- Service layer bezpośrednio mapuje result na GoalEventDetailDTO

**Korzyść**: Reduce 4 queries → 1 RPC call (~50-75% latency reduction)

**Optymalizacja 2: Conditional Pre-validation**

- Skip pre-validation SELECT goals
- RPC function i tak sprawdzi wszystko + zwróci odpowiedni błąd
- Service layer bezpośrednio mapuje PostgreSQL error codes na HTTP statuses

**Korzyść**: Mniej queries, prostszy kod

**Trade-off**: Trudniejsze mapowanie błędów (musimy polegać na PostgreSQL error codes)

**Optymalizacja 3: Indeksy**

Zgodnie z db-plan.md, zapewnić indeksy:

```sql
-- Idempotencja (unique)
CREATE UNIQUE INDEX uniq_goal_events_request
ON goal_events(user_id, client_request_id);

-- Agregacje dla monthly_metrics trigger
CREATE INDEX idx_ge_user_month
ON goal_events(user_id, month, type);

-- Join goal_name
CREATE INDEX idx_ge_goal
ON goal_events(goal_id);

-- Pre-validation query (if kept)
CREATE INDEX idx_goals_active
ON goals(user_id)
WHERE deleted_at IS NULL AND archived_at IS NULL;
```

**Optymalizacja 4: Connection Pooling**

- Supabase Free tier: max 60 connections
- Ensure connection pooling w supabase client
- Avoid connection leaks (wszystkie queries w try/finally)

**Optymalizacja 5: Caching (Not Applicable)**

- Goal events to transakcyjne dane (nie można cachować)
- Każdy request modyfikuje stan (POST)
- Cache invalidation byłby zbyt skomplikowany

### 8.3. Monitoring Metrics

**Key Performance Indicators:**

- **P50, P95, P99 latency** dla endpoint
- **Lock wait time** dla SELECT ... FOR UPDATE
- **RPC function execution time**
- **Trigger execution time** (monthly_metrics update)
- **Error rate** dla poszczególnych statusów (400, 409, 422, 500)
- **Idempotent retry rate** (409 z duplicate client_request_id)

**Alerting thresholds:**

- P95 latency > 500ms → investigate
- Lock wait time > 1s → concurrent load issue
- Error rate 500 > 1% → database issues
- Error rate 409 (insufficient balance) spike → może wskazywać na UI bug

### 8.4. Scalability Considerations

**Current architecture (MVP):**

- Supabase Free tier: wystarczająca dla MVP (do ~100 users)
- No sharding, single database

**Future scale concerns:**

- Goals z dużą liczbą events (tysiące): query performance może spadać
- Solution: Pagination dla GET /api/v1/goal-events (już w specyfikacji dla future)
- Solution: Archive old events (np. > 1 year) do osobnej tabeli

**Horizontal scalability:**

- Stateless API → easy to scale (multiple Astro instances)
- Database → Supabase handles (connection pooling, read replicas w paid plans)

## 9. Etapy wdrożenia

### KROK 1: Stworzenie funkcji PostgreSQL RPC

**Plik**: `/supabase/migrations/YYYYMMDDHHMMSS_create_add_goal_event_function.sql`

**Zadania:**

1. Stworzyć funkcję `add_goal_event()` z sygnaturą:

   ```sql
   CREATE OR REPLACE FUNCTION public.add_goal_event(
     p_goal_id uuid,
     p_type text,
     p_amount_cents integer,
     p_occurred_on date,
     p_client_request_id text
   ) RETURNS uuid
   SECURITY DEFINER
   SET search_path = public
   LANGUAGE plpgsql
   AS $$
   DECLARE
     v_user_id uuid;
     v_goal_event_id uuid;
     v_current_balance integer;
   BEGIN
     -- Get authenticated user
     v_user_id := auth.uid();
     IF v_user_id IS NULL THEN
       RAISE EXCEPTION 'Unauthorized';
     END IF;

     -- Lock goal row and validate ownership + status
     SELECT current_balance_cents INTO v_current_balance
     FROM goals
     WHERE id = p_goal_id
       AND user_id = v_user_id
       AND archived_at IS NULL
       AND deleted_at IS NULL
     FOR UPDATE;

     IF NOT FOUND THEN
       RAISE EXCEPTION 'Goal not found or is archived';
     END IF;

     -- Validate occurred_on <= current_date
     IF p_occurred_on > CURRENT_DATE THEN
       RAISE EXCEPTION 'Occurred date cannot be in the future';
     END IF;

     -- Validate WITHDRAW balance
     IF p_type = 'WITHDRAW' AND p_amount_cents > v_current_balance THEN
       RAISE EXCEPTION 'Insufficient balance for withdrawal. Current: %, Requested: %',
         v_current_balance, p_amount_cents;
     END IF;

     -- Insert goal_event (idempotency via unique constraint)
     INSERT INTO goal_events (
       user_id, goal_id, type, amount_cents, occurred_on, client_request_id
     ) VALUES (
       v_user_id, p_goal_id, p_type, p_amount_cents, p_occurred_on, p_client_request_id
     )
     RETURNING id INTO v_goal_event_id;

     -- Update goal balance
     UPDATE goals
     SET
       current_balance_cents = current_balance_cents +
         CASE WHEN p_type = 'DEPOSIT' THEN p_amount_cents ELSE -p_amount_cents END,
       updated_at = now(),
       updated_by = v_user_id
     WHERE id = p_goal_id;

     RETURN v_goal_event_id;
   END;
   $$;
   ```

2. Nadać uprawnienia:

   ```sql
   GRANT EXECUTE ON FUNCTION public.add_goal_event TO authenticated;
   ```

3. Przetestować funkcję:

   ```sql
   -- Test DEPOSIT
   SELECT add_goal_event(
     '<goal-uuid>',
     'DEPOSIT',
     10000,
     CURRENT_DATE,
     'test-request-id-1'
   );

   -- Test WITHDRAW (should succeed if balance sufficient)
   SELECT add_goal_event(
     '<goal-uuid>',
     'WITHDRAW',
     5000,
     CURRENT_DATE,
     'test-request-id-2'
   );

   -- Test insufficient balance (should fail)
   SELECT add_goal_event(
     '<goal-uuid>',
     'WITHDRAW',
     99999999,
     CURRENT_DATE,
     'test-request-id-3'
   );

   -- Test idempotency (should fail with unique violation)
   SELECT add_goal_event(
     '<goal-uuid>',
     'DEPOSIT',
     10000,
     CURRENT_DATE,
     'test-request-id-1'
   );
   ```

### KROK 2: Stworzenie Zod Schema

**Plik**: `/src/lib/schemas/goal-event.schema.ts`

**Zadania:**

1. Utworzyć nowy plik
2. Zaimportować zod
3. Zdefiniować `CreateGoalEventSchema` (patrz sekcja 3)
4. Eksportować schema

**Kod** (patrz sekcja 3 - "Wykorzystywane typy")

### KROK 3: Stworzenie Service Layer

**Plik**: `/src/lib/services/goal-event.service.ts`

**Zadania:**

1. Zdefiniować custom error classes:
   - `NotFoundError` (extends Error)
   - `ValidationError` (extends Error, z code i details)

2. Zaimplementować funkcję `createGoalEvent`:

   ```typescript
   export async function createGoalEvent(
     supabase: SupabaseClient,
     userId: string,
     command: CreateGoalEventCommand
   ): Promise<GoalEventDetailDTO>;
   ```

3. Implementacja flow (patrz sekcja 5 - "Przepływ danych"):
   - Pre-validation: goal existence, archived status
   - Business validation: future date check
   - Call RPC `add_goal_event()`
   - Handle RPC errors (PostgreSQL error codes)
   - Fetch created goal_event with joined goal_name
   - Fetch updated goal balance
   - Construct GoalEventDetailDTO
   - Return

4. Unit tests (opcjonalnie, ale rekomendowane):
   - Mock Supabase client
   - Test all error paths (NotFoundError, ValidationError codes)
   - Test success path

**Szczegóły implementacji patrz sekcja 5.**

### KROK 4: Stworzenie API Endpoint

**Plik**: `/src/pages/api/v1/goal-events/index.ts`

**Zadania:**

1. Zaimportować zależności:

   ```typescript
   import type { APIContext } from "astro";
   import { z } from "zod";
   import { supabaseClient, DEFAULT_USER_ID } from "@/db/supabase.client";
   import { CreateGoalEventSchema } from "@/lib/schemas/goal-event.schema";
   import { createGoalEvent, NotFoundError, ValidationError } from "@/lib/services/goal-event.service";
   import type { ErrorResponseDTO, GoalEventDetailDTO } from "@/types";
   ```

2. Disable prerendering:

   ```typescript
   export const prerender = false;
   ```

3. Utility function `formatZodErrors` (copy z goals/index.ts)

4. Implementować `POST` handler:

   ```typescript
   export async function POST(context: APIContext) {
     try {
       // 1. Parse request body
       const body = await context.request.json();

       // 2. Validate with Zod
       const command = CreateGoalEventSchema.parse(body);

       // 3. Call service (using DEFAULT_USER_ID for now)
       const goalEvent = await createGoalEvent(
         supabaseClient,
         DEFAULT_USER_ID,
         command
       );

       // 4. Return 201 Created
       return new Response(JSON.stringify(goalEvent), {
         status: 201,
         headers: { "Content-Type": "application/json" },
       });

     } catch (error) {
       // 5. Error handling (see section 7)

       // Zod validation → 400
       if (error instanceof z.ZodError) { ... }

       // NotFoundError → 404
       if (error instanceof NotFoundError) { ... }

       // ValidationError with codes → 409 or 422
       if (error instanceof ValidationError) {
         if (error.code === "DUPLICATE_REQUEST" || error.code === "INSUFFICIENT_BALANCE") {
           // 409 Conflict
         } else {
           // 422 Unprocessable Entity
         }
       }

       // Unexpected → 500
       console.error("Unexpected error:", error);
       // Return 500
     }
   }
   ```

**Pełny kod error handling patrz sekcja 7.**

### KROK 5: Testowanie Endpoint

**Zadania:**

1. Start Supabase lokalnie: `npx supabase start`
2. Apply migrations (jeśli nowe): `npx supabase db push`
3. Start dev server: `npm run dev`
4. Test POST requests:

**Test 1: Success - DEPOSIT**

```bash
curl -X POST http://localhost:4321/api/v1/goal-events \
  -H "Content-Type: application/json" \
  -d '{
    "goal_id": "<existing-goal-uuid>",
    "type": "DEPOSIT",
    "amount_cents": 50000,
    "occurred_on": "2025-01-15",
    "client_request_id": "550e8400-e29b-41d4-a716-446655440001"
  }'
```

Expected: 201 Created, GoalEventDetailDTO

**Test 2: Success - WITHDRAW**

```bash
curl -X POST http://localhost:4321/api/v1/goal-events \
  -H "Content-Type: application/json" \
  -d '{
    "goal_id": "<existing-goal-uuid>",
    "type": "WITHDRAW",
    "amount_cents": 20000,
    "occurred_on": "2025-01-15",
    "client_request_id": "550e8400-e29b-41d4-a716-446655440002"
  }'
```

Expected: 201 Created

**Test 3: 400 Bad Request - Invalid data**

```bash
curl -X POST http://localhost:4321/api/v1/goal-events \
  -H "Content-Type: application/json" \
  -d '{
    "goal_id": "not-a-uuid",
    "type": "INVALID",
    "amount_cents": -100,
    "occurred_on": "invalid-date"
  }'
```

Expected: 400, details z Zod errors

**Test 4: 404 Not Found - Goal nie istnieje**

```bash
curl -X POST http://localhost:4321/api/v1/goal-events \
  -H "Content-Type: application/json" \
  -d '{
    "goal_id": "00000000-0000-0000-0000-000000000000",
    "type": "DEPOSIT",
    "amount_cents": 10000,
    "occurred_on": "2025-01-15",
    "client_request_id": "550e8400-e29b-41d4-a716-446655440003"
  }'
```

Expected: 404

**Test 5: 409 Conflict - Insufficient balance**

```bash
# First, get current balance of goal (should be < 999999)
curl -X POST http://localhost:4321/api/v1/goal-events \
  -H "Content-Type: application/json" \
  -d '{
    "goal_id": "<existing-goal-uuid>",
    "type": "WITHDRAW",
    "amount_cents": 999999999,
    "occurred_on": "2025-01-15",
    "client_request_id": "550e8400-e29b-41d4-a716-446655440004"
  }'
```

Expected: 409, message "Insufficient balance"

**Test 6: 409 Conflict - Duplicate client_request_id**

```bash
# Repeat Test 1 with same client_request_id
curl -X POST http://localhost:4321/api/v1/goal-events \
  -H "Content-Type: application/json" \
  -d '{
    "goal_id": "<existing-goal-uuid>",
    "type": "DEPOSIT",
    "amount_cents": 50000,
    "occurred_on": "2025-01-15",
    "client_request_id": "550e8400-e29b-41d4-a716-446655440001"
  }'
```

Expected: 409, message "already exists"

**Test 7: 422 Unprocessable Entity - Future date**

```bash
curl -X POST http://localhost:4321/api/v1/goal-events \
  -H "Content-Type: application/json" \
  -d '{
    "goal_id": "<existing-goal-uuid>",
    "type": "DEPOSIT",
    "amount_cents": 10000,
    "occurred_on": "2099-12-31",
    "client_request_id": "550e8400-e29b-41d4-a716-446655440005"
  }'
```

Expected: 422, message "future"

### KROK 6: Weryfikacja Side Effects

**Zadania:**

1. Sprawdzić, że goal.current_balance_cents został zaktualizowany:

   ```bash
   # GET goal details
   curl http://localhost:4321/api/v1/goals/<goal-uuid>
   ```

   Verify: `current_balance_cents` odpowiada sumie events

2. Sprawdzić, że monthly_metrics został przeliczony:

   ```sql
   -- W Supabase SQL Editor
   SELECT * FROM monthly_metrics
   WHERE user_id = '<user-uuid>'
   AND month = '2025-01-01';
   ```

   Verify: `net_saved_cents` i `free_cash_flow_cents` odzwierciedlają nowy goal_event

3. Sprawdzić audit_log:
   ```sql
   SELECT * FROM audit_log
   WHERE entity_type = 'goal_event'
   AND entity_id = '<goal-event-uuid>';
   ```
   Verify: Wpis z action='CREATE', after zawiera goal_event data

### KROK 7: Dokumentacja

**Zadania:**

1. Upewnić się, że specyfikacja w `/api-plan.md` jest aktualna
2. Dodać przykłady użycia w README (opcjonalnie)
3. Dokumentacja dla frontend team:
   - Wyjaśnienie idempotencji (client_request_id musi być unikalny)
   - Przykłady generowania UUID v4/v7 po stronie klienta
   - Format response (GoalEventDetailDTO)
   - Handling error responses

### KROK 8: Code Review Checklist

Przed mergem, sprawdzić:

- [ ] Funkcja RPC poprawnie obsługuje wszystkie edge cases
- [ ] Zod schema waliduje wszystkie wymagane pola
- [ ] Service layer mapuje wszystkie PostgreSQL error codes na odpowiednie HTTP statuses
- [ ] Endpoint zwraca poprawne kody statusu (201, 400, 404, 409, 422, 500)
- [ ] Error responses mają format ErrorResponseDTO z details
- [ ] Success response ma format GoalEventDetailDTO
- [ ] Wszystkie błędy są logowane (console.error dla 500)
- [ ] Code follows style guide (double quotes, semicolons)
- [ ] Linter passes (no warnings/errors)
- [ ] All manual tests pass (patrz KROK 5)
- [ ] Side effects verified (balance updated, metrics recalculated, audit logged)
- [ ] Documentation updated (API plan, comments w kodzie)

### KROK 9: Deployment (Future)

**Development:**

- Kod jest gotowy po mergniu do `master`
- Supabase migrations auto-applied (jeśli skonfigurowane)

**Production (gdy auth będzie gotowy):**

- [ ] Replace `DEFAULT_USER_ID` z `context.locals.user.id`
- [ ] Add auth check (401 Unauthorized jeśli brak user)
- [ ] Update tests (dodać Authorization header)
- [ ] Verify RLS policies w production Supabase

---

## 10. Podsumowanie

Endpoint POST /api/v1/goal-events jest krytyczną operacją transakcyjną, która wymaga:

- **Atomowości**: Wszystkie operacje (INSERT event, UPDATE balance, UPDATE metrics) w jednej transakcji
- **Spójności**: SELECT ... FOR UPDATE zapobiega race conditions
- **Idempotencji**: Unique constraint na (user_id, client_request_id)
- **Audytowalności**: Automatyczne logowanie do audit_log

Implementacja w 3 warstwach:

1. **PostgreSQL RPC function** - core business logic, ACID guarantees
2. **Service layer** - orchestration, error mapping, DTO construction
3. **API endpoint** - validation, HTTP mapping, error responses

Kluczowe decyzje architektoniczne:

- **Użycie RPC zamiast bezpośredniego INSERT** - gwarantuje atomowość i enkapsuluje logikę salda
- **Pre-validation w service** - early failure, lepsze error messages
- **Szczegółowe mapowanie błędów** - różne HTTP statuses dla różnych scenariuszy (404, 409, 422)
- **Custom error classes** - czytelniejszy kod, łatwiejszy error handling

Performance considerations:

- Multiple DB calls → możliwa optymalizacja (single RPC return)
- Row lock duration → minimize transaction time
- Concurrent requests → inevitable, monitor lock wait time

Security:

- RLS na goal_events (brak INSERT policy dla klienta)
- RPC SECURITY DEFINER weryfikuje ownership
- Idempotencja chroni przed duplikatami
- Audit log dla forensics

Ten plan zapewnia solidną podstawę do implementacji endpoint zgodnie z najlepszymi praktykami i wymaganiami PRD.
