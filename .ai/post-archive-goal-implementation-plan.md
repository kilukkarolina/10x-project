# API Endpoint Implementation Plan: POST /api/v1/goals/:id/archive

## 1. Przegląd punktu końcowego

Endpoint umożliwia soft archiwizację celu finansowego użytkownika. Archiwizacja polega na ustawieniu pola `archived_at` na aktualny timestamp, co powoduje ukrycie celu w domyślnych listach (chyba że użytkownik wyraźnie zażąda wyświetlenia zarchiwizowanych celów).

**Kluczowe założenia biznesowe:**
- Archiwizacja jest nieodwracalna operacją (brak endpointu do cofnięcia archiwizacji w MVP)
- Zarchiwizowane cele nadal zachowują historię zdarzeń (goal_events)
- Dane historyczne pozostają niezmienione i dostępne w raportach
- Cel z flagą `is_priority=true` nie może być zarchiwizowany (należy najpierw usunąć priorytet)
- Cel już zarchiwizowany nie może być ponownie zarchiwizowany

**Kontekst w systemie:**
- Archiwizacja jest alternatywą dla soft-delete (deleted_at)
- Zarchiwizowane cele można nadal przeglądać z flagą `include_archived=true`
- Operacja powinna być zarejestrowana w audit_log przez trigger

---

## 2. Szczegóły żądania

### HTTP Method
`POST`

### Struktura URL
```
POST /api/v1/goals/:id/archive
```

### Path Parameters
| Parameter | Type   | Required | Description                | Validation       |
|-----------|--------|----------|----------------------------|------------------|
| `id`      | string | Yes      | UUID identyfikator celu    | UUID format      |

### Query Parameters
Brak

### Request Headers
```
Content-Type: application/json
Authorization: Bearer <jwt-token>
```
*Uwaga: Autoryzacja jest tymczasowo wyłączona w MVP. Endpoint używa DEFAULT_USER_ID.*

### Request Body
Brak (endpoint nie przyjmuje request body)

### Przykład żądania
```bash
POST /api/v1/goals/550e8400-e29b-41d4-a716-446655440000/archive
Authorization: Bearer <jwt-token>
```

---

## 3. Wykorzystywane typy

### DTO Types (już zdefiniowane w src/types.ts)

#### ArchiveGoalResponseDTO
```typescript
export interface ArchiveGoalResponseDTO extends Pick<GoalEntity, "id" | "name" | "archived_at"> {
  message: string;
}
```

**Struktura:**
- `id` (string): UUID celu
- `name` (string): Nazwa celu
- `archived_at` (string): Timestamp archiwizacji w formacie ISO 8601 UTC
- `message` (string): Komunikat potwierdzający archiwizację

#### ErrorResponseDTO
```typescript
export interface ErrorResponseDTO {
  error: string;
  message: string;
  details?: Record<string, string>;
  retry_after_seconds?: number;
}
```

### Validation Schemas (do utworzenia w src/lib/schemas/goal.schema.ts)

#### ArchiveGoalParamsSchema
```typescript
export const ArchiveGoalParamsSchema = z.object({
  id: z.string().uuid("Invalid goal ID format"),
});
```

**Walidacja:**
- `id`: wymagane, musi być prawidłowym UUID

---

## 4. Szczegóły odpowiedzi

### Success Response: 200 OK

**Status Code:** `200 OK`

**Response Body:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Wakacje w Grecji",
  "archived_at": "2025-01-16T10:00:00.000Z",
  "message": "Cel został zarchiwizowany. Dane historyczne pozostają niezmienione."
}
```

**Content-Type:** `application/json`

### Error Responses

#### 400 Bad Request - Invalid UUID Format
```json
{
  "error": "Bad Request",
  "message": "Invalid goal ID format",
  "details": {
    "id": "Invalid uuid"
  }
}
```

**Przyczyna:** Path parameter `id` nie jest prawidłowym UUID

---

#### 404 Not Found - Goal Does Not Exist
```json
{
  "error": "Not Found",
  "message": "Goal not found"
}
```

**Przyczyny:**
- Cel o podanym ID nie istnieje
- Cel należy do innego użytkownika (RLS)
- Cel jest soft-deleted (deleted_at IS NOT NULL)

---

#### 409 Conflict - Cannot Archive Priority Goal
```json
{
  "error": "Conflict",
  "message": "Cannot archive priority goal. Please unset priority flag first.",
  "details": {
    "is_priority": "true"
  }
}
```

**Przyczyna:** Cel jest oznaczony jako priorytet (`is_priority=true`). Użytkownik musi najpierw zaktualizować cel i usunąć flagę priorytetu poprzez `PATCH /api/v1/goals/:id`.

---

#### 422 Unprocessable Entity - Goal Already Archived
```json
{
  "error": "Unprocessable Entity",
  "message": "Goal is already archived",
  "details": {
    "archived_at": "2025-01-15T14:30:00.000Z"
  }
}
```

**Przyczyna:** Cel jest już zarchiwizowany (`archived_at IS NOT NULL`)

---

#### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred. Please try again later."
}
```

**Przyczyna:** Nieoczekiwany błąd serwera lub bazy danych

---

## 5. Przepływ danych

### Diagram przepływu
```
[Client Request]
      |
      v
[1. Validate Path Parameter (UUID)]
      |
      v
[2. Call archiveGoal() service]
      |
      v
[3. Fetch goal and verify ownership]
      |
      +-- Goal not found --> [404 Not Found]
      |
      v
[4. Check if already archived]
      |
      +-- Already archived --> [422 Unprocessable Entity]
      |
      v
[5. Check if priority goal]
      |
      +-- Is priority --> [409 Conflict]
      |
      v
[6. UPDATE goals SET archived_at = NOW()]
      |
      v
[7. Trigger logs to audit_log (automatic)]
      |
      v
[8. Return ArchiveGoalResponseDTO]
      |
      v
[200 OK Response]
```

### Szczegółowy opis kroków

#### Krok 1: Walidacja Path Parameter
- Pobierz `id` z `context.params.id`
- Waliduj za pomocą `ArchiveGoalParamsSchema.safeParse()`
- Jeśli walidacja nie powiedzie się → zwróć 400 Bad Request

#### Krok 2: Wywołanie warstwy serwisowej
- Wywołaj `archiveGoal(supabaseClient, DEFAULT_USER_ID, goalId)`
- Przekaż zwalidowany UUID i user ID

#### Krok 3: Weryfikacja istnienia i ownership
- Wykonaj SELECT na tabeli `goals`:
  ```sql
  SELECT id, name, archived_at, is_priority
  FROM goals
  WHERE id = $1
    AND user_id = $2
    AND deleted_at IS NULL
  ```
- RLS automatycznie weryfikuje ownership
- Jeśli brak wyniku → zwróć null (endpoint zwróci 404)

#### Krok 4: Sprawdzenie czy już zarchiwizowany
- Jeśli `archived_at IS NOT NULL` → rzuć ValidationError (422)

#### Krok 5: Sprawdzenie czy cel jest priority
- Jeśli `is_priority = true` → rzuć ValidationError z kodem 409 Conflict

#### Krok 6: Aktualizacja celu
- Wykonaj UPDATE:
  ```sql
  UPDATE goals
  SET archived_at = NOW(),
      updated_by = $user_id
  WHERE id = $goal_id
    AND user_id = $user_id
  RETURNING id, name, archived_at
  ```

#### Krok 7: Automatyczne logowanie (trigger)
- Trigger na UPDATE tabeli `goals` automatycznie zapisze zmianę w `audit_log`:
  - `entity_type`: 'goal'
  - `entity_id`: goal_id
  - `action`: 'UPDATE'
  - `before`: `{"archived_at": null}`
  - `after`: `{"archived_at": "2025-01-16T10:00:00Z"}`

#### Krok 8: Zwrócenie odpowiedzi
- Skonstruuj `ArchiveGoalResponseDTO`:
  ```typescript
  {
    id: result.id,
    name: result.name,
    archived_at: result.archived_at,
    message: "Cel został zarchiwizowany. Dane historyczne pozostają niezmienione."
  }
  ```
- Zwróć 200 OK

---

## 6. Względy bezpieczeństwa

### 6.1 Uwierzytelnianie i autoryzacja

**Uwierzytelnianie:**
- W MVP: Tymczasowo wyłączone, używany jest `DEFAULT_USER_ID`
- Docelowo: JWT token w nagłówku `Authorization: Bearer <token>`
- Supabase Auth zarządza sesją i generuje tokeny

**Autoryzacja:**
- Row Level Security (RLS) na tabeli `goals` zapewnia, że:
  - Użytkownik może aktualizować tylko własne cele
  - Filtry `user_id = auth.uid()` są wymuszane na poziomie bazy
- Dodatkowe sprawdzenie `user_id` w WHERE clause dla pewności

### 6.2 Walidacja danych wejściowych

**Path Parameter Validation:**
- UUID format zapobiega SQL injection
- Zod schema `z.string().uuid()` odrzuca nieprawidłowe formaty
- Przykłady odrzuconych wartości:
  - `"abc"` → 400 Bad Request
  - `"123-456-789"` → 400 Bad Request
  - `"' OR '1'='1"` → 400 Bad Request

**Ownership Verification:**
- Każde zapytanie zawiera `user_id` w WHERE clause
- RLS podwójnie weryfikuje dostęp
- Niemożność archiwizacji cudzych celów nawet przy próbie obejścia walidacji

### 6.3 Ochrona przed nadużyciami

**Rate Limiting:**
- Nie wymagane dla tego endpointu (niskopriorytowa operacja)
- Możliwe dodanie w przyszłości jeśli będą nadużycia

**Idempotencja:**
- Endpoint NIE jest idempotentny (drugie wywołanie zwraca 422)
- Klient powinien obsłużyć 422 jako "już wykonano"
- Brak potrzeby `client_request_id` (operacja raz na cel)

**CSRF Protection:**
- Supabase Auth obsługuje CSRF tokeny
- SameSite=Lax dla session cookies

---

## 7. Obsługa błędów

### 7.1 Kategorie błędów

#### Błędy walidacji (4xx)

| Status Code | Error Code            | Scenariusz                              | Handling                          |
|-------------|-----------------------|-----------------------------------------|-----------------------------------|
| 400         | Bad Request           | Nieprawidłowy UUID w path parameter     | Walidacja Zod, formatZodErrors()  |
| 404         | Not Found             | Cel nie istnieje / nie należy do usera  | Check null result from service    |
| 409         | Conflict              | Cel jest priority                       | ValidationError w service         |
| 422         | Unprocessable Entity  | Cel już zarchiwizowany                  | ValidationError w service         |

#### Błędy serwera (5xx)

| Status Code | Error Code            | Scenariusz                              | Handling                          |
|-------------|-----------------------|-----------------------------------------|-----------------------------------|
| 500         | Internal Server Error | Nieoczekiwany błąd DB lub serwera       | try-catch w endpoint, console.error |

### 7.2 Szczegółowa obsługa błędów

#### ValidationError Class
Service używa istniejącej klasy `ValidationError` do reprezentowania błędów biznesowych:

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

#### Mapowanie ValidationError na status codes w endpoint
```typescript
catch (error) {
  if (error instanceof ValidationError) {
    // Determine status code based on message
    const isConflict = error.message.toLowerCase().includes("priority");
    const statusCode = isConflict ? 409 : 422;
    const errorCode = isConflict ? "Conflict" : "Unprocessable Entity";
    
    const errorResponse: ErrorResponseDTO = {
      error: errorCode,
      message: error.message,
      details: error.details,
    };
    return new Response(JSON.stringify(errorResponse), {
      status: statusCode,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  // ... handle 500 errors
}
```

### 7.3 Logging strategia

**Console logging:**
- Wszystkie nieoczekiwane błędy (500) logowane do console.error
- Format: `console.error("Unexpected error in POST /api/v1/goals/:id/archive:", error)`
- Zawiera pełny stack trace dla debugging

**Audit log (automatyczny):**
- Trigger na UPDATE goals zapisuje do audit_log
- Retencja 30 dni
- Zawiera before/after state

**Nie logujemy:**
- Błędów walidacji (400, 422) - to oczekiwane błędy użytkownika
- 404 Not Found - to nie jest błąd, tylko brak zasobu
- 409 Conflict - to reguła biznesowa, nie błąd

---

## 8. Rozważania dotyczące wydajności

### 8.1 Optymalizacje zapytań

**Single query pattern:**
- Operacja wymaga tylko 2 zapytań do bazy:
  1. SELECT (weryfikacja i pobranie danych)
  2. UPDATE (archiwizacja)
- Brak potrzeby transakcji (operacja atomowa)

**Indeksy wykorzystywane:**
- `goals_pkey(id)` - primary key lookup (O(log n))
- `idx_goals_user(user_id)` - weryfikacja ownership
- Partial index `idx_goals_active(user_id) where deleted_at is null and archived_at is null` - nie używany po archiwizacji

**Oczekiwana wydajność:**
- p50 latency: < 50ms (single row update)
- p95 latency: < 100ms
- p99 latency: < 200ms

### 8.2 Brak cache

**Uzasadnienie:**
- Archiwizacja to rzadka operacja (raz na cel)
- Nie ma potrzeby cache'owania
- Natychmiastowe odzwierciedlenie zmiany w bazie jest priorytetem

### 8.3 Nie blokujemy innych operacji

**Concurrent operations:**
- UPDATE z WHERE clause nie blokuje całej tabeli
- Row-level lock tylko na archiwizowanym celu
- Inne użytkownicy mogą normalnie pracować ze swoimi celami

**Trigger overhead:**
- Trigger zapisujący do audit_log dodaje ~5-10ms
- Akceptowalne dla rzadkiej operacji
- Nie wymaga optymalizacji w MVP

### 8.4 Monitoring i alerty

**Metryki do monitorowania:**
- Response time (p50, p95, p99)
- Error rate (4xx vs 5xx)
- Archive operations per day (business metric)

**Alerty:**
- p95 latency > 200ms
- Error rate > 5%
- Spike w operacjach archiwizacji (możliwe nadużycie)

---

## 9. Etapy wdrożenia

### Faza 1: Przygotowanie warstwy walidacji

**1.1 Dodaj schema walidacji do `src/lib/schemas/goal.schema.ts`**

```typescript
/**
 * Zod schema for POST /api/v1/goals/:id/archive path parameter
 * Validates that the goal ID is a valid UUID
 */
export const ArchiveGoalParamsSchema = z.object({
  id: z.string().uuid("Invalid goal ID format"),
});
```

**Lokalizacja:** Na końcu pliku `src/lib/schemas/goal.schema.ts`, po `UpdateGoalSchema`

**Test walidacji:**
- Prawidłowe: `"550e8400-e29b-41d4-a716-446655440000"` → pass
- Nieprawidłowe: `"abc"`, `"123"`, `null` → fail with error message

---

### Faza 2: Implementacja logiki biznesowej w service

**2.1 Dodaj funkcję `archiveGoal()` do `src/lib/services/goal.service.ts`**

**Sygnatura funkcji:**
```typescript
/**
 * Archives a goal for the authenticated user (soft archive)
 *
 * Business logic flow:
 * 1. Fetch goal and verify ownership (RLS + explicit user_id check)
 * 2. Return null if goal doesn't exist or doesn't belong to user
 * 3. Validate goal is not already archived (422)
 * 4. Validate goal is not priority (409 Conflict)
 * 5. UPDATE goals SET archived_at = NOW()
 * 6. Return ArchiveGoalResponseDTO with success message
 *
 * @param supabase - Supabase client instance with user context
 * @param userId - ID of authenticated user (from context.locals.user)
 * @param goalId - UUID of the goal to archive
 * @returns Promise<ArchiveGoalResponseDTO | null> - Archive response with timestamp and message, or null if not found
 * @throws ValidationError - Business validation failed (409 or 422)
 * @throws Error - Database error (will be caught as 500)
 */
export async function archiveGoal(
  supabase: SupabaseClient,
  userId: string,
  goalId: string
): Promise<ArchiveGoalResponseDTO | null> {
  // Implementation here
}
```

**Szczegóły implementacji:**

**Krok 1: Fetch i weryfikacja**
```typescript
const { data: existingGoal, error: fetchError } = await supabase
  .from("goals")
  .select("id, name, archived_at, is_priority")
  .eq("id", goalId)
  .eq("user_id", userId)
  .is("deleted_at", null)
  .maybeSingle();

if (fetchError) {
  throw new Error(`Failed to fetch goal: ${fetchError.message}`);
}

if (!existingGoal) {
  return null; // 404 Not Found
}
```

**Krok 2: Walidacja już zarchiwizowany**
```typescript
if (existingGoal.archived_at !== null) {
  throw new ValidationError("Goal is already archived", {
    archived_at: existingGoal.archived_at,
  });
}
```

**Krok 3: Walidacja priority**
```typescript
if (existingGoal.is_priority) {
  throw new ValidationError(
    "Cannot archive priority goal. Please unset priority flag first.",
    {
      is_priority: "true",
    }
  );
}
```

**Krok 4: UPDATE archiwizacja**
```typescript
const { data: archivedGoal, error: updateError } = await supabase
  .from("goals")
  .update({
    archived_at: new Date().toISOString(),
    updated_by: userId,
  })
  .eq("id", goalId)
  .eq("user_id", userId)
  .select("id, name, archived_at")
  .single();

if (updateError) {
  throw new Error(`Failed to archive goal: ${updateError.message}`);
}

if (!archivedGoal) {
  throw new Error("Goal was not archived");
}
```

**Krok 5: Return response DTO**
```typescript
const response: ArchiveGoalResponseDTO = {
  id: archivedGoal.id,
  name: archivedGoal.name,
  archived_at: archivedGoal.archived_at,
  message: "Cel został zarchiwizowany. Dane historyczne pozostają niezmienione.",
};

return response;
```

**Lokalizacja:** Na końcu pliku `src/lib/services/goal.service.ts`, po funkcji `updateGoal()`

---

### Faza 3: Implementacja endpointu API

**3.1 Dodaj handler POST do pliku endpointu**

**Lokalizacja:** `/src/pages/api/v1/goals/[id].ts`

**Uwaga:** Plik już istnieje i zawiera handlery GET i PATCH. Dodajemy nowy handler POST na końcu pliku.

**Kod handlera:**

```typescript
/**
 * POST /api/v1/goals/:id/archive
 *
 * Archives a goal (soft archive by setting archived_at timestamp).
 *
 * Path parameters:
 * - id (required, UUID): Goal identifier
 *
 * Business rules:
 * - Goal must exist and belong to user (404 Not Found)
 * - Goal cannot be already archived (422 Unprocessable Entity)
 * - Goal cannot be priority (409 Conflict - unset priority first)
 * - Archived goals retain all historical data and events
 *
 * Success response: 200 OK with ArchiveGoalResponseDTO
 * {
 *   id: string,
 *   name: string,
 *   archived_at: string,
 *   message: string
 * }
 *
 * Error responses:
 * - 400: Invalid goal ID format (Zod validation failed)
 * - 404: Goal not found or doesn't belong to user
 * - 409: Cannot archive priority goal (unset priority first)
 * - 422: Goal is already archived
 * - 500: Unexpected server error
 *
 * Note: Authentication is temporarily disabled. Using DEFAULT_USER_ID.
 * Auth will be implemented comprehensively in a future iteration.
 */
export async function POST(context: APIContext) {
  try {
    // Step 1: Validate path parameter (goal ID)
    const paramsValidation = ArchiveGoalParamsSchema.safeParse({ id: context.params.id });

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

    // Step 2: Call service layer to archive goal
    // Note: Using DEFAULT_USER_ID until auth is implemented
    const result = await archiveGoal(supabaseClient, DEFAULT_USER_ID, paramsValidation.data.id);

    // Step 3: Return 404 if goal doesn't exist
    if (!result) {
      const errorResponse: ErrorResponseDTO = {
        error: "Not Found",
        message: "Goal not found",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 4: Return 200 OK with ArchiveGoalResponseDTO
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle ValidationError (409 Conflict or 422 Unprocessable Entity)
    if (error instanceof ValidationError) {
      // Determine status code based on error message
      const isConflict = error.message.toLowerCase().includes("priority");
      const statusCode = isConflict ? 409 : 422;
      const errorCode = isConflict ? "Conflict" : "Unprocessable Entity";

      const errorResponse: ErrorResponseDTO = {
        error: errorCode,
        message: error.message,
        details: error.details,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: statusCode,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle all unexpected errors (500 Internal Server Error)
    // eslint-disable-next-line no-console
    console.error("Unexpected error in POST /api/v1/goals/:id/archive:", error);
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

**3.2 Dodaj import dla nowych funkcji/schematów**

Na początku pliku `src/pages/api/v1/goals/[id].ts`, dodaj do istniejących importów:

```typescript
import {
  // ... existing imports
  ArchiveGoalParamsSchema,
} from "@/lib/schemas/goal.schema";
import {
  // ... existing imports
  archiveGoal,
  ValidationError
} from "@/lib/services/goal.service";
```

---

### Faza 4: Testowanie manualne

**4.1 Testy pozytywne (success path)**

**Test 1: Archiwizacja standardowego celu**
```bash
# Przygotowanie: Utwórz cel testowy (non-priority)
POST /api/v1/goals
{
  "name": "Test Goal for Archive",
  "type_code": "VACATION",
  "target_amount_cents": 100000,
  "is_priority": false
}
# Zapisz ID celu: {goal_id}

# Test: Archiwizuj cel
POST /api/v1/goals/{goal_id}/archive

# Oczekiwany rezultat: 200 OK
{
  "id": "{goal_id}",
  "name": "Test Goal for Archive",
  "archived_at": "2025-01-16T10:30:00.000Z",
  "message": "Cel został zarchiwizowany. Dane historyczne pozostają niezmienione."
}

# Weryfikacja: Sprawdź czy cel jest ukryty w domyślnej liście
GET /api/v1/goals
# Cel nie powinien być widoczny

# Weryfikacja: Sprawdź czy cel jest widoczny z flagą include_archived
GET /api/v1/goals?include_archived=true
# Cel powinien być widoczny z archived_at wypełnionym
```

**4.2 Testy negatywne (error paths)**

**Test 2: Nieprawidłowy UUID**
```bash
POST /api/v1/goals/invalid-uuid/archive

# Oczekiwany rezultat: 400 Bad Request
{
  "error": "Bad Request",
  "message": "Invalid goal ID format",
  "details": {
    "id": "Invalid uuid"
  }
}
```

**Test 3: Nieistniejący cel**
```bash
POST /api/v1/goals/550e8400-e29b-41d4-a716-446655440000/archive

# Oczekiwany rezultat: 404 Not Found
{
  "error": "Not Found",
  "message": "Goal not found"
}
```

**Test 4: Próba archiwizacji priority goal**
```bash
# Przygotowanie: Utwórz cel priority
POST /api/v1/goals
{
  "name": "Priority Goal Test",
  "type_code": "AUTO",
  "target_amount_cents": 200000,
  "is_priority": true
}
# Zapisz ID: {priority_goal_id}

# Test: Próba archiwizacji
POST /api/v1/goals/{priority_goal_id}/archive

# Oczekiwany rezultat: 409 Conflict
{
  "error": "Conflict",
  "message": "Cannot archive priority goal. Please unset priority flag first.",
  "details": {
    "is_priority": "true"
  }
}

# Weryfikacja: Odznacz priorytet i ponów archiwizację
PATCH /api/v1/goals/{priority_goal_id}
{
  "is_priority": false
}

POST /api/v1/goals/{priority_goal_id}/archive
# Teraz powinno się udać: 200 OK
```

**Test 5: Próba ponownej archiwizacji**
```bash
# Przygotowanie: Zarchiwizuj cel (użyj celu z Test 1)
POST /api/v1/goals/{goal_id}/archive
# 200 OK

# Test: Ponowna archiwizacja tego samego celu
POST /api/v1/goals/{goal_id}/archive

# Oczekiwany rezultat: 422 Unprocessable Entity
{
  "error": "Unprocessable Entity",
  "message": "Goal is already archived",
  "details": {
    "archived_at": "2025-01-16T10:30:00.000Z"
  }
}
```

**4.3 Testy integracyjne (audit log)**

**Test 6: Weryfikacja zapisu w audit_log**
```bash
# Przygotowanie: Zarchiwizuj cel
POST /api/v1/goals/{goal_id}/archive
# 200 OK

# Weryfikacja: Sprawdź audit log
GET /api/v1/audit-log

# Oczekiwany rezultat: Powinien istnieć wpis z:
# - entity_type: "goal"
# - entity_id: {goal_id}
# - action: "UPDATE"
# - before: {"archived_at": null, ...}
# - after: {"archived_at": "2025-01-16T10:30:00Z", ...}
```

**Test 7: Weryfikacja zachowania goal_events**
```bash
# Przygotowanie: Utwórz cel i dodaj zdarzenia
POST /api/v1/goals
{
  "name": "Goal with Events",
  "type_code": "VACATION",
  "target_amount_cents": 100000
}
# ID: {goal_id}

POST /api/v1/goal-events
{
  "goal_id": "{goal_id}",
  "type": "DEPOSIT",
  "amount_cents": 50000,
  "occurred_on": "2025-01-15",
  "client_request_id": "test-event-1"
}

# Test: Zarchiwizuj cel
POST /api/v1/goals/{goal_id}/archive
# 200 OK

# Weryfikacja: Sprawdź czy zdarzenia są nadal dostępne
GET /api/v1/goals/{goal_id}?include_archived=true

# Oczekiwany rezultat: Cel powinien zawierać wszystkie events
{
  "id": "{goal_id}",
  "name": "Goal with Events",
  "archived_at": "2025-01-16T10:30:00Z",
  "events": [
    {
      "id": "...",
      "type": "DEPOSIT",
      "amount_cents": 50000,
      "occurred_on": "2025-01-15"
    }
  ]
}
```

---

### Faza 5: Sprawdzenie linter i formatowanie

**5.1 Uruchom linter**
```bash
npm run lint
```

**Oczekiwany rezultat:** Brak błędów i ostrzeżeń

**Typowe problemy:**
- Brak średnika na końcu linii → dodaj średnik
- Single quotes zamiast double quotes → zamień na double quotes
- Unused imports → usuń nieużywane importy

**5.2 Fix automatyczny (jeśli dostępny)**
```bash
npm run lint:fix
```

---

### Faza 6: Code review checklist

**Przed commitem sprawdź:**

- [ ] Funkcja `archiveGoal()` dodana do `goal.service.ts`
- [ ] Schema `ArchiveGoalParamsSchema` dodana do `goal.schema.ts`
- [ ] Handler POST dodany do `[id].ts` endpoint
- [ ] Importy zaktualizowane w pliku endpoint
- [ ] Wszystkie komunikaty błędów po polsku
- [ ] Double quotes używane wszędzie (nie single quotes)
- [ ] Średniki na końcu każdej instrukcji
- [ ] Dokumentacja JSDoc dla nowej funkcji serwisu
- [ ] Dokumentacja komentarzy dla handlera POST
- [ ] Early returns dla błędów (guard clauses)
- [ ] Brak nested if-else (flat structure)
- [ ] ValidationError używany dla błędów biznesowych
- [ ] Console.error dla błędów 500
- [ ] RLS weryfikacja + explicit user_id check
- [ ] NULL handling (maybeSingle(), null checks)
- [ ] Testy manualne wykonane i udokumentowane
- [ ] Linter nie zgłasza błędów

---

### Faza 7: Git commit

**Commit message (format konwencjonalny):**
```
feat(api): implement POST /api/v1/goals/:id/archive endpoint

- Add archiveGoal() service function to goal.service.ts
- Add ArchiveGoalParamsSchema validation to goal.schema.ts
- Implement POST handler in /api/v1/goals/[id] endpoint
- Handle 409 Conflict for priority goals
- Handle 422 for already archived goals
- Preserve goal_events history after archiving
- Automatic audit_log entry via trigger
```

**Pliki zmienione:**
- `src/lib/services/goal.service.ts` (nowa funkcja)
- `src/lib/schemas/goal.schema.ts` (nowa schema)
- `src/pages/api/v1/goals/[id].ts` (nowy handler POST)

**Commit command:**
```bash
git add src/lib/services/goal.service.ts
git add src/lib/schemas/goal.schema.ts
git add src/pages/api/v1/goals/[id].ts
git commit -m "feat(api): implement POST /api/v1/goals/:id/archive endpoint"
```

---

## 10. Checklist końcowy

### Przed wdrożeniem na produkcję

- [ ] Kod zaimplementowany zgodnie z planem
- [ ] Wszystkie testy manualne przeszły pomyślnie
- [ ] Linter nie zgłasza błędów ani ostrzeżeń
- [ ] Kod przeszedł code review
- [ ] Dokumentacja JSDoc jest kompletna
- [ ] Komunikaty błędów są po polsku i zrozumiałe
- [ ] RLS jest włączony na tabeli goals
- [ ] Trigger audit_log jest aktywny
- [ ] Performance jest akceptowalna (< 200ms p95)
- [ ] Git commit z odpowiednim commit message
- [ ] Plan testów został wykonany i udokumentowany

### Kryteria akceptacji

- [ ] Endpoint odpowiada na POST /api/v1/goals/:id/archive
- [ ] Zwraca 200 OK z ArchiveGoalResponseDTO dla prawidłowych żądań
- [ ] Zwraca 400 dla nieprawidłowego UUID
- [ ] Zwraca 404 dla nieistniejącego celu
- [ ] Zwraca 409 dla celu priority (z odpowiednim komunikatem)
- [ ] Zwraca 422 dla już zarchiwizowanego celu
- [ ] Ustawia archived_at na aktualny timestamp
- [ ] Zachowuje wszystkie goal_events po archiwizacji
- [ ] Zapisuje operację w audit_log (automatycznie przez trigger)
- [ ] Zarchiwizowany cel nie pojawia się w GET /api/v1/goals (bez flagi)
- [ ] Zarchiwizowany cel pojawia się w GET /api/v1/goals?include_archived=true

---

## 11. Znane ograniczenia i przyszłe ulepszenia

### Ograniczenia MVP

1. **Brak cofania archiwizacji**
   - Archiwizacja jest nieodwracalna w MVP
   - Przyszłe: Endpoint POST /api/v1/goals/:id/unarchive

2. **Tymczasowo wyłączona autentykacja**
   - Używamy DEFAULT_USER_ID
   - Przyszłe: Integracja z Supabase Auth (JWT tokens)

3. **Brak rate limiting**
   - Możliwe nadużycie endpointu
   - Przyszłe: Rate limiter (np. 100 req/minute per user)

4. **Brak powiadomień**
   - Użytkownik nie dostaje potwierdzenia email o archiwizacji
   - Przyszłe: Email notification (optional)

### Przyszłe ulepszenia

1. **Bulk archive endpoint**
   - POST /api/v1/goals/bulk-archive
   - Body: `{ "goal_ids": ["id1", "id2", ...] }`
   - Przydatne do czyszczenia wielu starych celów

2. **Auto-archive po osiągnięciu celu**
   - Automatyczna archiwizacja gdy current_balance >= target_amount
   - Opcjonalne, konfigurowane przez użytkownika

3. **Powiadomienie przed archiwizacją**
   - Modal z potwierdzeniem i ostrzeżeniem o nieodwracalności
   - Frontend tylko (MVP backend gotowy)

4. **Statystyki archiwizacji**
   - Endpoint GET /api/v1/metrics/archived-goals-summary
   - Ilość zarchiwizowanych celów, suma zaoszczędzonych pieniędzy, etc.

---

**Koniec planu implementacji**

**Wersja:** 1.0  
**Data utworzenia:** 2025-11-23  
**Status:** Gotowy do implementacji

