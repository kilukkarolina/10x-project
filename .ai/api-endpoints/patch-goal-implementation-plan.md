# API Endpoint Implementation Plan: PATCH /api/v1/goals/:id

## 1. Przegląd punktu końcowego

Endpoint `PATCH /api/v1/goals/:id` umożliwia częściową aktualizację istniejącego celu oszczędnościowego użytkownika. Użytkownik może zaktualizować nazwę celu, kwotę docelową lub status priorytetu. Wszystkie pola są opcjonalne - użytkownik wysyła tylko te pola, które chce zmienić.

**Kluczowe funkcjonalności:**

- Partial update - aktualizacja tylko podanych pól
- Automatyczne zarządzanie priorytetem - ustawienie `is_priority: true` automatycznie usuwa priorytet z innych celów
- Ochrona przed aktualizacją zarchiwizowanych celów
- Niemożność bezpośredniej zmiany salda (`current_balance_cents`) - wymaga użycia goal-events

**Business rules:**

- Tylko jeden cel może być oznaczony jako priorytetowy (is_priority=true)
- Nie można aktualizować celów zarchiwizowanych (archived_at IS NOT NULL)
- Pole `current_balance_cents` jest read-only (zmiana tylko przez goal-events)
- Cel musi należeć do uwierzytelnionego użytkownika (RLS)

---

## 2. Szczegóły żądania

### Metoda HTTP

`PATCH`

### Struktura URL

```
/api/v1/goals/:id
```

### Parametry

#### Path Parameters (wymagane):

- **id** (string, UUID): Identyfikator celu do aktualizacji
  - Format: UUID v4
  - Przykład: `"550e8400-e29b-41d4-a716-446655440000"`
  - Walidacja: Musi być prawidłowym UUID

#### Request Body (wszystkie pola opcjonalne, ale przynajmniej jedno wymagane):

```typescript
{
  name?: string;              // 1-100 znaków
  target_amount_cents?: number; // integer, positive (>0)
  is_priority?: boolean;      // true lub false
}
```

**Przykład request body:**

```json
{
  "name": "Wakacje w Grecji 2025",
  "target_amount_cents": 600000,
  "is_priority": true
}
```

**Przykład częściowej aktualizacji (tylko nazwa):**

```json
{
  "name": "Nowa nazwa celu"
}
```

### Headers

```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

---

## 3. Wykorzystywane typy

### DTO Types (z `src/types.ts`):

- **UpdateGoalCommand**: Command model dla aktualizacji celu

  ```typescript
  interface UpdateGoalCommand {
    name?: string;
    target_amount_cents?: number;
    is_priority?: boolean;
  }
  ```

- **GoalDTO**: Response model z pełnymi danymi celu

  ```typescript
  interface GoalDTO {
    id: string;
    name: string;
    type_code: string;
    type_label: string; // joined from goal_types
    target_amount_cents: number;
    current_balance_cents: number;
    progress_percentage: number; // computed field
    is_priority: boolean;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
  }
  ```

- **ErrorResponseDTO**: Standardowy format odpowiedzi błędu
  ```typescript
  interface ErrorResponseDTO {
    error: string;
    message: string;
    details?: Record<string, string>;
  }
  ```

### Zod Schemas (do stworzenia w `src/lib/schemas/goal.schema.ts`):

- **UpdateGoalParamsSchema**: Walidacja path parameter

  ```typescript
  z.object({
    id: z.string().uuid("Invalid goal ID format"),
  });
  ```

- **UpdateGoalSchema**: Walidacja request body
  ```typescript
  z.object({
    name: z.string().min(1).max(100).optional(),
    target_amount_cents: z.number().int().positive().optional(),
    is_priority: z.boolean().optional(),
  }).refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });
  ```

### Service Layer (nowa funkcja w `src/lib/services/goal.service.ts`):

- **updateGoal**: Business logic dla aktualizacji celu
  ```typescript
  async function updateGoal(
    supabase: SupabaseClient,
    userId: string,
    goalId: string,
    command: UpdateGoalCommand
  ): Promise<GoalDTO>;
  ```

---

## 4. Szczegóły odpowiedzi

### Success Response: `200 OK`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Wakacje w Grecji 2025",
  "type_code": "VACATION",
  "type_label": "Wakacje",
  "target_amount_cents": 600000,
  "current_balance_cents": 125000,
  "progress_percentage": 20.83,
  "is_priority": true,
  "archived_at": null,
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-16T10:00:00Z"
}
```

### Error Responses

#### 400 Bad Request - Nieprawidłowa walidacja danych wejściowych

```json
{
  "error": "Bad Request",
  "message": "Invalid request data",
  "details": {
    "id": "Invalid goal ID format",
    "name": "Name cannot exceed 100 characters"
  }
}
```

#### 401 Unauthorized - Brak lub nieprawidłowy token

```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

#### 404 Not Found - Cel nie istnieje lub nie należy do użytkownika

```json
{
  "error": "Not Found",
  "message": "Goal not found"
}
```

#### 422 Unprocessable Entity - Błędy walidacji biznesowej

**Próba aktualizacji zarchiwizowanego celu:**

```json
{
  "error": "Unprocessable Entity",
  "message": "Cannot update archived goal",
  "details": {
    "archived_at": "2025-01-10T10:00:00Z"
  }
}
```

**Konflikt priorytetu (jeśli automatyczna zmiana się nie powiodła):**

```json
{
  "error": "Unprocessable Entity",
  "message": "Failed to update goal priority",
  "details": {
    "is_priority": "Another goal is already marked as priority"
  }
}
```

#### 500 Internal Server Error - Nieoczekiwany błąd serwera

```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred. Please try again later."
}
```

---

## 5. Przepływ danych

### Diagram przepływu:

```
Client Request
    ↓
[1] PATCH /api/v1/goals/:id endpoint
    ↓
[2] Walidacja path parameter (Zod: UpdateGoalParamsSchema)
    ↓
[3] Walidacja request body (Zod: UpdateGoalSchema)
    ↓
[4] Wywołanie updateGoal(supabase, userId, goalId, command)
    ↓
[5] Service Layer: goal.service.ts::updateGoal()
    ├─ [5a] Fetch goal with FOR UPDATE lock
    ├─ [5b] Sprawdź czy cel istnieje
    ├─ [5c] Sprawdź czy cel nie jest zarchiwizowany
    ├─ [5d] Jeśli is_priority=true:
    │       ├─ SELECT innych celów z is_priority=true
    │       └─ UPDATE innych celów: SET is_priority=false
    ├─ [5e] UPDATE goals SET ... WHERE id=goalId AND user_id=userId
    ├─ [5f] SELECT zaktualizowany cel z JOIN goal_types
    └─ [5g] Compute progress_percentage
    ↓
[6] Transform do GoalDTO
    ↓
[7] Return Response 200 OK z GoalDTO
```

### Szczegółowy przepływ w service layer:

1. **Rozpoczęcie transakcji** (implicit w Supabase)

2. **Fetch i lock celu:**

   ```sql
   SELECT * FROM goals
   WHERE id = $goalId
   AND user_id = $userId
   AND deleted_at IS NULL
   FOR UPDATE
   ```

   - Jeśli brak: throw error → 404 Not Found
   - Jeśli `archived_at IS NOT NULL`: throw ValidationError → 422

3. **Zarządzanie priorytetem** (jeśli `is_priority: true` w command):

   ```sql
   UPDATE goals
   SET is_priority = false, updated_at = now(), updated_by = $userId
   WHERE user_id = $userId
   AND id != $goalId
   AND is_priority = true
   AND archived_at IS NULL
   AND deleted_at IS NULL
   ```

4. **Aktualizacja celu:**

   ```sql
   UPDATE goals
   SET
     name = COALESCE($name, name),
     target_amount_cents = COALESCE($targetAmount, target_amount_cents),
     is_priority = COALESCE($isPriority, is_priority),
     updated_at = now(),
     updated_by = $userId
   WHERE id = $goalId AND user_id = $userId
   RETURNING *
   ```

5. **Fetch zaktualizowanego celu z joined data:**

   ```sql
   SELECT
     g.id, g.name, g.type_code, g.target_amount_cents,
     g.current_balance_cents, g.is_priority, g.archived_at,
     g.created_at, g.updated_at,
     gt.label_pl as type_label
   FROM goals g
   INNER JOIN goal_types gt ON g.type_code = gt.code
   WHERE g.id = $goalId
   ```

6. **Compute progress_percentage:**

   ```typescript
   progress_percentage = (current_balance_cents / target_amount_cents) * 100;
   ```

7. **Return GoalDTO**

### Interakcje z bazą danych:

- **Tabela główna**: `goals`
- **Tabela pomocnicza**: `goal_types` (JOIN dla type_label)
- **Automatyczne triggery**:
  - `update_updated_at_column()` - aktualizuje `updated_at`
  - `audit_log_trigger()` - loguje zmiany do `audit_log`

---

## 6. Względy bezpieczeństwa

### Uwierzytelnienie

- **Token JWT**: Wymagany Bearer token w Authorization header
- **Supabase Auth**: Token weryfikowany przez middleware Astro
- **User context**: `context.locals.user` zawiera authenticated user ID
- **Email verification**: RLS wymaga `profiles.email_confirmed = true`

### Autoryzacja

- **Row Level Security (RLS)**:
  ```sql
  -- Policy dla UPDATE goals
  CREATE POLICY "update_own_goals" ON goals
  FOR UPDATE
  USING (
    user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND email_confirmed = true)
  )
  WITH CHECK (user_id = auth.uid());
  ```
- **Ownership check**: RLS automatycznie filtruje cele należące do użytkownika
- **Soft-delete protection**: Polityki RLS ukrywają cele z `deleted_at IS NOT NULL`

### Walidacja danych wejściowych

- **Path parameter**: UUID validation przez Zod (prevents injection)
- **Request body**: Type-safe validation przez Zod schema
  - `name`: max 100 znaków (prevents buffer overflow)
  - `target_amount_cents`: positive integer only
  - `is_priority`: boolean only
- **Sanitization**: Zod automatycznie type-coerces i odrzuca nieprawidłowe typy

### Ochrona przed race conditions

- **SELECT FOR UPDATE**: Lock na rekord podczas aktualizacji priorytetu
- **Transakcja atomowa**: Zmiana priorytetu i update celu w jednej transakcji
- **Optimistic concurrency**: `updated_at` timestamp pokazuje ostatnią zmianę

### Ochrona przed atakami

- **SQL Injection**: Parametryzowane zapytania przez Supabase client
- **XSS**: Brak renderowania HTML (API tylko zwraca JSON)
- **CSRF**: Token JWT w header (nie w cookie)
- **Rate limiting**: Implementowane na poziomie infrastruktury (Supabase/Astro)

### Audit trail

- **Automatic logging**: Trigger `audit_log_trigger()` loguje:
  - `entity_type: 'goal'`
  - `action: 'UPDATE'`
  - `before`: Stary stan rekordu (JSON)
  - `after`: Nowy stan rekordu (JSON)
  - `owner_user_id`: ID właściciela celu
  - `actor_user_id`: ID użytkownika wykonującego zmianę
- **Retention**: 30 dni (automatyczne czyszczenie przez cron job)

---

## 7. Obsługa błędów

### Tabela scenariuszy błędów:

| Scenariusz                       | Kod statusu | Error                 | Message                             | Details                                               |
| -------------------------------- | ----------- | --------------------- | ----------------------------------- | ----------------------------------------------------- |
| Nieprawidłowy UUID w path        | 400         | Bad Request           | Invalid goal ID format              | `{ "id": "Invalid goal ID format" }`                  |
| Pusty request body               | 400         | Bad Request           | At least one field must be provided | -                                                     |
| `name` > 100 znaków              | 400         | Bad Request           | Invalid request data                | `{ "name": "Name cannot exceed 100 characters" }`     |
| `target_amount_cents` ≤ 0        | 400         | Bad Request           | Invalid request data                | `{ "target_amount_cents": "Must be greater than 0" }` |
| Nieprawidłowy typ pola           | 400         | Bad Request           | Invalid request data                | `{ "field": "Expected type, received type" }`         |
| Brak tokenu JWT                  | 401         | Unauthorized          | Authentication required             | -                                                     |
| Token wygasły                    | 401         | Unauthorized          | Token expired                       | -                                                     |
| Cel nie istnieje                 | 404         | Not Found             | Goal not found                      | -                                                     |
| Cel należy do innego użytkownika | 404         | Not Found             | Goal not found                      | -                                                     |
| Cel jest zarchiwizowany          | 422         | Unprocessable Entity  | Cannot update archived goal         | `{ "archived_at": "ISO timestamp" }`                  |
| Błąd DB (connection)             | 500         | Internal Server Error | An unexpected error occurred        | -                                                     |
| Nieoczekiwany błąd               | 500         | Internal Server Error | An unexpected error occurred        | -                                                     |

### Implementacja obsługi błędów:

#### 1. Walidacja Zod (400 Bad Request)

```typescript
const paramsValidation = UpdateGoalParamsSchema.safeParse({ id: context.params.id });
if (!paramsValidation.success) {
  return new Response(
    JSON.stringify({
      error: "Bad Request",
      message: "Invalid goal ID format",
      details: formatZodErrors(paramsValidation.error),
    }),
    { status: 400 }
  );
}
```

#### 2. ValidationError z service layer (422 Unprocessable Entity)

```typescript
try {
  const goal = await updateGoal(supabase, userId, goalId, command);
  // ...
} catch (error) {
  if (error instanceof ValidationError) {
    return new Response(
      JSON.stringify({
        error: "Unprocessable Entity",
        message: error.message,
        details: error.details,
      }),
      { status: 422 }
    );
  }
  // ...
}
```

#### 3. Goal not found (404 Not Found)

```typescript
// W service layer: return null jeśli cel nie istnieje
const goal = await updateGoal(...);
if (!goal) {
  return new Response(JSON.stringify({
    error: "Not Found",
    message: "Goal not found"
  }), { status: 404 });
}
```

#### 4. Database/Unexpected errors (500 Internal Server Error)

```typescript
try {
  // ... endpoint logic
} catch (error) {
  console.error("Unexpected error in PATCH /api/v1/goals/:id:", error);
  return new Response(
    JSON.stringify({
      error: "Internal Server Error",
      message: "An unexpected error occurred. Please try again later.",
    }),
    { status: 500 }
  );
}
```

### Logging błędów:

- **Console.error**: Logowanie szczegółów błędu do stderr (tylko 500 errors)
- **Nie logować**: Błędy walidacji (400, 422) - to oczekiwane błędy użytkownika
- **Struktura logu**:
  ```typescript
  console.error("Unexpected error in PATCH /api/v1/goals/:id:", {
    error: error.message,
    stack: error.stack,
    userId: userId,
    goalId: goalId,
  });
  ```

---

## 8. Rozważania dotyczące wydajności

### Potencjalne wąskie gardła:

1. **Priority swap operation**:
   - Problem: Dodatkowe UPDATE wszystkich innych celów użytkownika
   - Impact: O(n) gdzie n = liczba celów użytkownika
   - Mitigacja:
     - Indeks: `idx_goals_active(user_id) WHERE deleted_at IS NULL AND archived_at IS NULL`
     - Unikatowy indeks: `uniq_goals_priority(user_id) WHERE is_priority AND archived_at IS NULL`
     - W praktyce: użytkownik ma max 10-20 celów → negligible impact

2. **JOIN z goal_types**:
   - Problem: Dodatkowe JOIN dla każdej aktualizacji
   - Impact: Minimal - `goal_types` jest małą lookup table (< 20 rows)
   - Mitigacja: PostgreSQL cache'uje small lookup tables in memory

3. **SELECT FOR UPDATE lock**:
   - Problem: Lock contention przy concurrent updates tego samego celu
   - Impact: Minimal - rzadki przypadek (użytkownik edytuje cel z wielu urządzeń jednocześnie)
   - Mitigacja: Krótki czas trwania transakcji (< 100ms)

4. **Audit log trigger**:
   - Problem: Dodatkowy INSERT do audit_log przy każdej aktualizacji
   - Impact: +10-20ms per update
   - Mitigacja: Asynchroniczny trigger (nie blokuje response), indeksy na audit_log

### Strategie optymalizacji:

#### 1. Indeksy (już zdefiniowane w db-plan.md):

```sql
-- Filtrowanie aktywnych celów użytkownika
CREATE INDEX idx_goals_active ON goals(user_id)
WHERE deleted_at IS NULL AND archived_at IS NULL;

-- Unikalny priorytet (zapobiega race conditions)
CREATE UNIQUE INDEX uniq_goals_priority ON goals(user_id)
WHERE is_priority AND archived_at IS NULL;

-- Lookup dla goal_types
CREATE INDEX idx_goals_type ON goals(type_code);
```

#### 2. Redukcja roundtripów:

- **Single query dla update + fetch**: Użycie `.select()` po `.update()` w Supabase
- **Batch operations**: Priority swap w jednym UPDATE statement

#### 3. Caching (opcjonalnie dla przyszłości):

- **Redis cache**: Cache goal_types lookup table (TTL: 1 godzina)
- **Invalidation**: Invalidate cache tylko gdy admin zmienia goal_types

#### 4. Connection pooling:

- **Supabase**: Automatyczny connection pool (max 15 connections dla Free tier)
- **Best practice**: Reuse supabase client instance (nie tworzyć nowego dla każdego request)

### Metryki wydajności (target):

- **P50 latency**: < 100ms
- **P95 latency**: < 300ms
- **P99 latency**: < 500ms
- **Database query time**: < 50ms (większość czasu to network overhead)

### Monitoring:

- **Supabase Dashboard**: Query performance metrics
- **Application logs**: Log slow requests (> 500ms)
- **Alert**: Gdy P95 > 500ms

---

## 9. Etapy wdrożenia

### Krok 1: Dodanie Zod schemas do `src/lib/schemas/goal.schema.ts`

Dodaj na końcu pliku:

```typescript
/**
 * Zod schema for PATCH /api/v1/goals/:id path parameter
 * Validates that the goal ID is a valid UUID
 */
export const UpdateGoalParamsSchema = z.object({
  id: z.string().uuid("Invalid goal ID format"),
});

/**
 * Zod schema for UpdateGoalCommand (PATCH /api/v1/goals/:id request body)
 * Validates incoming request data for updating a goal
 *
 * Validation rules:
 * - name: Optional, 1-100 characters if provided
 * - target_amount_cents: Optional, positive integer if provided
 * - is_priority: Optional boolean if provided
 * - At least one field must be provided (non-empty body)
 */
export const UpdateGoalSchema = z
  .object({
    name: z.string().min(1, "Name cannot be empty").max(100, "Name cannot exceed 100 characters").optional(),

    target_amount_cents: z
      .number({
        invalid_type_error: "Target amount must be a number",
      })
      .int("Target amount must be an integer")
      .positive("Target amount must be greater than 0")
      .optional(),

    is_priority: z
      .boolean({
        invalid_type_error: "Priority must be a boolean",
      })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
```

**Testowanie:**

- Sprawdź, czy schema akceptuje valid partial updates
- Sprawdź, czy schema odrzuca pusty body
- Sprawdź, czy schema odrzuca nieprawidłowe typy

---

### Krok 2: Dodanie funkcji `updateGoal` do `src/lib/services/goal.service.ts`

Dodaj na końcu pliku przed ostatnim eksportem:

```typescript
/**
 * Updates an existing goal for the authenticated user
 *
 * Business logic flow:
 * 1. Fetch goal and verify ownership (RLS)
 * 2. Validate goal is not archived
 * 3. If is_priority=true, unset priority on other goals (atomic)
 * 4. Update goal with provided fields only (partial update)
 * 5. Fetch updated goal with joined type_label
 * 6. Compute progress_percentage and return GoalDTO
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param goalId - UUID of the goal to update
 * @param command - Validated command data (UpdateGoalCommand) with only fields to update
 * @returns Promise<GoalDTO | null> - Updated goal with type label and progress, or null if not found
 * @throws ValidationError - Business validation failed (422)
 * @throws Error - Database error (will be caught as 500)
 */
export async function updateGoal(
  supabase: SupabaseClient,
  userId: string,
  goalId: string,
  command: UpdateGoalCommand
): Promise<GoalDTO | null> {
  // Step 1: Fetch goal to verify it exists and belongs to user
  const { data: existingGoal, error: fetchError } = await supabase
    .from("goals")
    .select("id, archived_at")
    .eq("id", goalId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch goal: ${fetchError.message}`);
  }

  // Step 2: Return null if goal doesn't exist or doesn't belong to user
  if (!existingGoal) {
    return null;
  }

  // Step 3: Validate goal is not archived
  if (existingGoal.archived_at !== null) {
    throw new ValidationError("Cannot update archived goal", {
      archived_at: existingGoal.archived_at,
    });
  }

  // Step 4: If is_priority=true, unset priority on other goals
  if (command.is_priority === true) {
    const { error: priorityError } = await supabase
      .from("goals")
      .update({
        is_priority: false,
        updated_by: userId,
      })
      .eq("user_id", userId)
      .neq("id", goalId)
      .eq("is_priority", true)
      .is("archived_at", null)
      .is("deleted_at", null);

    if (priorityError) {
      throw new Error(`Failed to update priority on other goals: ${priorityError.message}`);
    }
  }

  // Step 5: Build update object with only provided fields
  const updateData: Record<string, unknown> = {
    updated_by: userId,
  };

  if (command.name !== undefined) {
    updateData.name = command.name;
  }
  if (command.target_amount_cents !== undefined) {
    updateData.target_amount_cents = command.target_amount_cents;
  }
  if (command.is_priority !== undefined) {
    updateData.is_priority = command.is_priority;
  }

  // Step 6: Update goal
  const { error: updateError } = await supabase.from("goals").update(updateData).eq("id", goalId).eq("user_id", userId);

  if (updateError) {
    throw new Error(`Failed to update goal: ${updateError.message}`);
  }

  // Step 7: Fetch updated goal with joined type_label
  const { data: updatedGoal, error: selectError } = await supabase
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
    .eq("id", goalId)
    .eq("user_id", userId)
    .single();

  if (selectError) {
    throw new Error(`Failed to fetch updated goal: ${selectError.message}`);
  }

  if (!updatedGoal) {
    throw new Error("Goal was not updated");
  }

  // Step 8: Transform to GoalDTO with computed progress_percentage
  const goalTypes = updatedGoal.goal_types as { label_pl: string } | { label_pl: string }[];
  const typeLabel = Array.isArray(goalTypes) ? goalTypes[0].label_pl : goalTypes.label_pl;

  const progressPercentage =
    updatedGoal.target_amount_cents > 0
      ? (updatedGoal.current_balance_cents / updatedGoal.target_amount_cents) * 100
      : 0;

  const goalDTO: GoalDTO = {
    id: updatedGoal.id,
    name: updatedGoal.name,
    type_code: updatedGoal.type_code,
    type_label: typeLabel,
    target_amount_cents: updatedGoal.target_amount_cents,
    current_balance_cents: updatedGoal.current_balance_cents,
    progress_percentage: progressPercentage,
    is_priority: updatedGoal.is_priority,
    archived_at: updatedGoal.archived_at,
    created_at: updatedGoal.created_at,
    updated_at: updatedGoal.updated_at,
  };

  return goalDTO;
}
```

**Testowanie:**

- Test case 1: Update tylko name
- Test case 2: Update tylko target_amount_cents
- Test case 3: Update tylko is_priority
- Test case 4: Update wszystkich pól jednocześnie
- Test case 5: Update is_priority=true usuwa priorytet z innego celu
- Test case 6: Próba update zarchiwizowanego celu (expect ValidationError)
- Test case 7: Próba update nieistniejącego celu (expect null)

---

### Krok 3: Dodanie handlera PATCH do `src/pages/api/v1/goals/[id].ts`

Dodaj na końcu pliku:

```typescript
/**
 * PATCH /api/v1/goals/:id
 *
 * Updates an existing goal (partial update).
 *
 * Path parameters:
 * - id (required, UUID): Goal identifier
 *
 * Request body (all fields optional, but at least one required):
 * - name (optional, string): Goal name, 1-100 characters
 * - target_amount_cents (optional, number): Target amount in cents, positive integer
 * - is_priority (optional, boolean): Priority flag
 *
 * Business rules:
 * - Cannot update archived goals (422 Unprocessable Entity)
 * - Cannot update current_balance_cents (use goal-events instead)
 * - Setting is_priority=true automatically unsets priority on other goals
 * - Only one goal can be marked as priority at a time
 *
 * Success response: 200 OK with GoalDTO
 * {
 *   id: string,
 *   name: string,
 *   type_code: string,
 *   type_label: string,
 *   target_amount_cents: number,
 *   current_balance_cents: number,
 *   progress_percentage: number,
 *   is_priority: boolean,
 *   archived_at: string | null,
 *   created_at: string,
 *   updated_at: string
 * }
 *
 * Error responses:
 * - 400: Invalid path parameter or request body (Zod validation failed)
 * - 404: Goal not found or doesn't belong to user
 * - 422: Cannot update archived goal
 * - 500: Unexpected server error
 *
 * Note: Authentication is temporarily disabled. Using DEFAULT_USER_ID.
 * Auth will be implemented comprehensively in a future iteration.
 */
export async function PATCH(context: APIContext) {
  try {
    // Step 1: Validate path parameter (goal ID)
    const paramsValidation = UpdateGoalParamsSchema.safeParse({ id: context.params.id });

    if (!paramsValidation.success) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid goal ID format",
        details: formatZodErrors(paramsValidation.error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 2: Parse and validate request body
    let requestBody;
    try {
      requestBody = await context.request.json();
    } catch {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid JSON in request body",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const bodyValidation = UpdateGoalSchema.safeParse(requestBody);

    if (!bodyValidation.success) {
      const errorResponse: ErrorResponseDTO = {
        error: "Bad Request",
        message: "Invalid request data",
        details: formatZodErrors(bodyValidation.error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 3: Call service layer to update goal
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const goal = await updateGoal(supabaseClient, DEFAULT_USER_ID, paramsValidation.data.id, bodyValidation.data);

    // Step 4: Return 404 if goal doesn't exist
    if (!goal) {
      const errorResponse: ErrorResponseDTO = {
        error: "Not Found",
        message: "Goal not found",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 5: Return 200 OK with updated GoalDTO
    return new Response(JSON.stringify(goal), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle ValidationError (422 Unprocessable Entity)
    if (error instanceof ValidationError) {
      const errorResponse: ErrorResponseDTO = {
        error: "Unprocessable Entity",
        message: error.message,
        details: error.details,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle all unexpected errors (500 Internal Server Error)
    // eslint-disable-next-line no-console
    console.error("Unexpected error in PATCH /api/v1/goals/:id:", error);
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

**Wymagane importy** (dodaj na początku pliku jeśli nie ma):

```typescript
import { UpdateGoalParamsSchema, UpdateGoalSchema } from "@/lib/schemas/goal.schema";
import { updateGoal, ValidationError } from "@/lib/services/goal.service";
import type { UpdateGoalCommand } from "@/types";
```

---

### Krok 4: Testowanie manualne

Uruchom serwer deweloperski:

```bash
npm run dev
```

**Test 1: Update tylko name (happy path)**

```bash
curl -X PATCH http://localhost:4321/api/v1/goals/{goal-id} \
  -H "Content-Type: application/json" \
  -d '{"name": "Nowa nazwa celu"}'

# Expected: 200 OK z zaktualizowanym GoalDTO
```

**Test 2: Update tylko target_amount_cents**

```bash
curl -X PATCH http://localhost:4321/api/v1/goals/{goal-id} \
  -H "Content-Type: application/json" \
  -d '{"target_amount_cents": 500000}'

# Expected: 200 OK, progress_percentage się zmieni
```

**Test 3: Update is_priority=true**

```bash
curl -X PATCH http://localhost:4321/api/v1/goals/{goal-id} \
  -H "Content-Type: application/json" \
  -d '{"is_priority": true}'

# Expected: 200 OK, sprawdź czy inne cele mają is_priority=false
```

**Test 4: Update wszystkich pól**

```bash
curl -X PATCH http://localhost:4321/api/v1/goals/{goal-id} \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Wakacje w Grecji 2025",
    "target_amount_cents": 600000,
    "is_priority": true
  }'

# Expected: 200 OK z wszystkimi zaktualizowanymi polami
```

**Test 5: Nieprawidłowy UUID**

```bash
curl -X PATCH http://localhost:4321/api/v1/goals/invalid-uuid \
  -H "Content-Type: application/json" \
  -d '{"name": "Test"}'

# Expected: 400 Bad Request
# { "error": "Bad Request", "message": "Invalid goal ID format", ... }
```

**Test 6: Pusty body**

```bash
curl -X PATCH http://localhost:4321/api/v1/goals/{goal-id} \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: 400 Bad Request
# { "error": "Bad Request", "message": "At least one field must be provided" }
```

**Test 7: name > 100 znaków**

```bash
curl -X PATCH http://localhost:4321/api/v1/goals/{goal-id} \
  -H "Content-Type: application/json" \
  -d '{"name": "' + 'x'.repeat(101) + '"}'

# Expected: 400 Bad Request
# { "error": "Bad Request", "message": "Name cannot exceed 100 characters" }
```

**Test 8: target_amount_cents ≤ 0**

```bash
curl -X PATCH http://localhost:4321/api/v1/goals/{goal-id} \
  -H "Content-Type: application/json" \
  -d '{"target_amount_cents": 0}'

# Expected: 400 Bad Request
# { "error": "Bad Request", "message": "Target amount must be greater than 0" }
```

**Test 9: Nieistniejący goal ID**

```bash
curl -X PATCH http://localhost:4321/api/v1/goals/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{"name": "Test"}'

# Expected: 404 Not Found
# { "error": "Not Found", "message": "Goal not found" }
```

**Test 10: Update zarchiwizowanego celu**

```bash
# Najpierw zarchiwizuj cel (POST /api/v1/goals/{id}/archive)
# Potem spróbuj go zaktualizować:
curl -X PATCH http://localhost:4321/api/v1/goals/{archived-goal-id} \
  -H "Content-Type: application/json" \
  -d '{"name": "Test"}'

# Expected: 422 Unprocessable Entity
# { "error": "Unprocessable Entity", "message": "Cannot update archived goal", ... }
```

---

### Krok 5: Sprawdzenie lintowania

Uruchom linter:

```bash
npm run lint
```

Napraw wszystkie błędy ESLint:

- Upewnij się, że używasz double quotes (`"`)
- Dodaj semicolons
- Usuń unused imports
- Napraw type errors

---

### Krok 6: Weryfikacja typów TypeScript

Uruchom type checking:

```bash
npx tsc --noEmit
```

Napraw wszystkie type errors:

- Upewnij się, że `UpdateGoalCommand` z `types.ts` pasuje do schematu
- Sprawdź czy wszystkie importy są poprawne
- Zweryfikuj typy zwracane z Supabase queries

---

### Krok 7: Testowanie z audit_log

Sprawdź czy zmiany są logowane w `audit_log`:

```sql
-- Wykonaj update przez API
-- Potem sprawdź w bazie danych:
SELECT * FROM audit_log
WHERE entity_type = 'goal'
  AND action = 'UPDATE'
  AND entity_id = '{goal-id}'
ORDER BY performed_at DESC
LIMIT 1;

-- Oczekiwany wynik:
-- - owner_user_id: ID użytkownika
-- - actor_user_id: ID użytkownika
-- - entity_type: 'goal'
-- - action: 'UPDATE'
-- - before: JSON ze starym stanem (name, target_amount_cents, is_priority, ...)
-- - after: JSON z nowym stanem
-- - performed_at: timestamp
```

---

### Krok 8: Testowanie priority swap

Sprawdź czy priorytet jest automatycznie usuwany z innych celów:

```bash
# 1. Stwórz dwa cele
# 2. Ustaw pierwszy jako priority
curl -X PATCH http://localhost:4321/api/v1/goals/{goal-1-id} \
  -H "Content-Type: application/json" \
  -d '{"is_priority": true}'

# 3. Sprawdź GET /api/v1/goals - goal-1 powinien mieć is_priority=true

# 4. Ustaw drugi jako priority
curl -X PATCH http://localhost:4321/api/v1/goals/{goal-2-id} \
  -H "Content-Type: application/json" \
  -d '{"is_priority": true}'

# 5. Sprawdź GET /api/v1/goals:
#    - goal-1 powinien mieć is_priority=false
#    - goal-2 powinien mieć is_priority=true
```

---

### Krok 9: Dokumentacja

Zaktualizuj dokumentację API (jeśli istnieje):

- Dodaj przykłady request/response dla PATCH /api/v1/goals/:id
- Dodaj opis error responses
- Dodaj notatki o business rules (priority swap, archived goals)

---

### Krok 10: Code review checklist

Przed merge do głównej gałęzi sprawdź:

- [ ] Zod schemas są poprawne i pokrywają wszystkie edge cases
- [ ] Service layer funkcja `updateGoal` jest dobrze przetestowana
- [ ] Endpoint handler obsługuje wszystkie error cases
- [ ] ValidationError jest poprawnie rzucany i łapany
- [ ] Używane są double quotes i semicolons (code style)
- [ ] TypeScript types są poprawne (brak `any`)
- [ ] ESLint nie zgłasza błędów
- [ ] Manualne testy przechodzą poprawnie
- [ ] Audit log działa poprawnie
- [ ] Priority swap działa atomicznie
- [ ] Dokumentacja jest zaktualizowana

---

## Podsumowanie

Ten plan implementacji obejmuje:

1. **Walidację danych**: Zod schemas dla path parameter i request body
2. **Business logic**: Service layer funkcja z walidacją biznesową
3. **API endpoint**: Handler PATCH z obsługą błędów
4. **Bezpieczeństwo**: RLS, JWT auth, input validation
5. **Audit trail**: Automatyczne logowanie zmian
6. **Performance**: Optymalne indeksy i atomic operations
7. **Testing**: Kompletne scenariusze testowe

Po wykonaniu wszystkich kroków endpoint `PATCH /api/v1/goals/:id` będzie w pełni funkcjonalny i zgodny z specyfikacją API.
