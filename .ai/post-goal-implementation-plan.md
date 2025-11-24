# API Endpoint Implementation Plan: POST /api/v1/goals

## 1. Przegląd punktu końcowego

Endpoint `POST /api/v1/goals` umożliwia tworzenie nowego celu oszczędnościowego dla zalogowanego użytkownika. Cel reprezentuje docelową kwotę, którą użytkownik chce zaoszczędzić (np. "Wakacje w Grecji" za 5000 PLN). Każdy cel ma typ (np. VACATION, AUTO, EMERGENCY), aktualny stan salda (początkowo 0) oraz opcjonalną flagę priorytetu (tylko jeden cel może być priorytetowy jednocześnie).

**Kluczowe cechy:**
- Tworzenie nowego celu oszczędnościowego
- Walidacja typu celu względem słownika `goal_types`
- Wsparcie dla flagi priorytetu z ograniczeniem do jednego priorytetu na użytkownika
- Automatyczne ustawianie salda początkowego na 0
- Zwracanie pełnych danych celu wraz z joinowaną etykietą typu i wyliczonym procentem postępu

## 2. Szczegóły żądania

### Metoda HTTP
`POST`

### Struktura URL
```
/api/v1/goals
```

### Nagłówki
```
Content-Type: application/json
Authorization: Bearer <jwt-token>  // Tymczasowo nieużywane - implementacja auth w przyszłości
```

### Parametry

#### Wymagane (Request Body):
- **`name`** (string)
  - Nazwa celu oszczędnościowego
  - Długość: 1-100 znaków
  - Przykład: `"Wakacje w Grecji"`

- **`type_code`** (string)
  - Kod typu celu z tabeli `goal_types`
  - Musi istnieć w słowniku i być aktywny (`is_active = true`)
  - Przykłady: `"VACATION"`, `"AUTO"`, `"EMERGENCY"`

- **`target_amount_cents`** (integer)
  - Docelowa kwota w groszach
  - Musi być > 0
  - Przykład: `500000` (5000 PLN)

#### Opcjonalne (Request Body):
- **`is_priority`** (boolean)
  - Czy cel jest priorytetem
  - Domyślnie: `false`
  - Ograniczenie: tylko jeden aktywny cel może mieć `is_priority = true`
  - Przykład: `true`

### Przykład Request Body
```json
{
  "name": "Wakacje w Grecji",
  "type_code": "VACATION",
  "target_amount_cents": 500000,
  "is_priority": false
}
```

## 3. Wykorzystywane typy

### Command Model (Input)
Wykorzystywany typ z `src/types.ts`:

```typescript
export interface CreateGoalCommand 
  extends Pick<GoalEntity, "name" | "type_code" | "target_amount_cents"> {
  is_priority?: boolean; // Optional, default false
}
```

### DTO (Output)
Wykorzystywany typ z `src/types.ts`:

```typescript
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
```

### Validation Schema (Zod)
Do stworzenia w `src/lib/schemas/goal.schema.ts`:

```typescript
export const CreateGoalSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name cannot exceed 100 characters"),
  
  type_code: z
    .string()
    .min(1, "Goal type code is required"),
  
  target_amount_cents: z
    .number({
      required_error: "Target amount is required",
      invalid_type_error: "Target amount must be a number",
    })
    .int("Target amount must be an integer")
    .positive("Target amount must be greater than 0"),
  
  is_priority: z
    .boolean()
    .optional()
    .default(false),
});
```

## 4. Szczegóły odpowiedzi

### Sukces: 201 Created

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Wakacje w Grecji",
  "type_code": "VACATION",
  "type_label": "Wakacje",
  "target_amount_cents": 500000,
  "current_balance_cents": 0,
  "progress_percentage": 0.0,
  "is_priority": false,
  "archived_at": null,
  "created_at": "2025-01-15T18:30:00Z",
  "updated_at": "2025-01-15T18:30:00Z"
}
```

### Błędy

#### 400 Bad Request - Nieprawidłowy format danych
```json
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "name": "Name cannot exceed 100 characters",
    "target_amount_cents": "Target amount must be greater than 0"
  }
}
```

#### 409 Conflict - Konflikt priorytetu
```json
{
  "error": "Conflict",
  "message": "Another goal is already marked as priority",
  "details": {
    "is_priority": "Only one goal can be marked as priority at a time"
  }
}
```

#### 422 Unprocessable Entity - Błędy walidacji biznesowej
```json
{
  "error": "Unprocessable Entity",
  "message": "Goal type code does not exist or is inactive",
  "details": {
    "type_code": "VACATION"
  }
}
```

#### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred. Please try again later."
}
```

## 5. Przepływ danych

### Architektura warstwowa
```
API Route (index.ts)
    ↓
Zod Validation (CreateGoalSchema)
    ↓
Service Layer (goal.service.ts → createGoal)
    ↓
Business Validation
    ├─→ Check goal_types existence and active status
    └─→ Check priority conflict (if is_priority=true)
    ↓
Database Insert (Supabase)
    ↓
Fetch with Joins (goal + goal_types.label_pl)
    ↓
Transform to DTO (compute progress_percentage)
    ↓
Return 201 with GoalDTO
```

### Szczegółowy przepływ w Service Layer

1. **Walidacja typu celu:**
   ```sql
   SELECT is_active 
   FROM goal_types 
   WHERE code = :type_code
   ```
   - Sprawdź czy `type_code` istnieje
   - Sprawdź czy `is_active = true`
   - Jeśli nie: rzuć `ValidationError` (422)

2. **Walidacja priorytetu (jeśli is_priority=true):**
   ```sql
   SELECT id 
   FROM goals 
   WHERE user_id = :user_id 
     AND is_priority = true 
     AND archived_at IS NULL 
     AND deleted_at IS NULL
   ```
   - Jeśli znaleziono: rzuć `ValidationError` z kodem 409
   - Jeśli brak: kontynuuj

3. **Wstawienie celu:**
   ```sql
   INSERT INTO goals (
     user_id, name, type_code, target_amount_cents, 
     is_priority, created_by, updated_by
   ) VALUES (...)
   RETURNING *
   ```
   - RLS automatycznie weryfikuje `user_id = auth.uid()`
   - Baza ustawia domyślnie: `current_balance_cents = 0`, `id`, `created_at`, `updated_at`

4. **Pobranie z joinami:**
   ```sql
   SELECT 
     goals.*,
     goal_types.label_pl
   FROM goals
   INNER JOIN goal_types ON goals.type_code = goal_types.code
   WHERE goals.id = :inserted_id
   ```

5. **Transformacja do DTO:**
   - Mapuj kolumny z bazy na `GoalDTO`
   - Oblicz `progress_percentage = (current_balance_cents / target_amount_cents) * 100`
   - Dla nowo utworzonego celu: `progress_percentage = 0.0`

### Interakcje z bazą danych

**Tabele:**
- `goals` - tabela główna (INSERT, SELECT)
- `goal_types` - słownik typów celów (SELECT, JOIN)

**Indeksy wykorzystywane:**
- `goals_pkey(id)` - dla SELECT po INSERT
- `idx_goals_user(user_id)` - dla walidacji priorytetu i RLS
- `uniq_goals_priority(user_id) where is_priority and archived_at is null` - constraint priorytetu
- `goal_types_pkey(code)` - dla walidacji typu i JOIN

**RLS Policies:**
- INSERT policy na `goals`: weryfikacja `user_id = auth.uid()` i `profiles.email_confirmed`

## 6. Względy bezpieczeństwa

### Uwierzytelnianie
- **Status:** Tymczasowo wyłączone dla MVP
- **Implementacja docelowa:** JWT token w nagłówku `Authorization: Bearer <token>`
- **Fallback:** Użycie `DEFAULT_USER_ID` z `supabase.client.ts`

### Autoryzacja
- **RLS (Row Level Security):** Włączony na tabeli `goals`
- **Polityka INSERT:**
  ```sql
  USING (
    user_id = auth.uid() 
    AND EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.email_confirmed
    )
  )
  ```
- **Weryfikacja:** Użytkownik może tworzyć cele tylko dla siebie
- **Email confirmation:** Wymóg potwierdzenia email przed tworzeniem celów

### Walidacja danych wejściowych

#### Warstwa 1: Zod Schema (Format i typy)
- Walidacja formatu `name` (1-100 znaków)
- Walidacja typu i wartości `target_amount_cents` (positive integer)
- Walidacja typu `is_priority` (boolean)
- Walidacja obecności wymaganych pól

#### Warstwa 2: Business Logic (Service Layer)
- Weryfikacja istnienia `type_code` w `goal_types`
- Weryfikacja `is_active = true` dla wybranego typu
- Weryfikacja braku konfliktów priorytetu (jeśli `is_priority=true`)

#### Warstwa 3: Database Constraints
- CHECK: `target_amount_cents > 0`
- CHECK: `char_length(name) between 1 and 100`
- CHECK: `NOT (is_priority AND archived_at IS NOT NULL)`
- UNIQUE: tylko jeden priorytet na użytkownika
- FK: `type_code` musi istnieć w `goal_types`

### Ochrona przed atakami

**SQL Injection:**
- ✅ Chronione przez Supabase Client (parametryzowane zapytania)

**XSS:**
- ⚠️ Pole `name` może zawierać znaki specjalne
- 🛡️ Sanityzacja po stronie UI (przed renderowaniem)
- ℹ️ Brak walidacji w API - zgodnie z zasadą "store raw, sanitize on display"

**Business Logic Abuse:**
- 🛡️ Ograniczenie jednego priorytetu przez UNIQUE constraint
- 🛡️ Walidacja typu celu przed insertem

## 7. Obsługa błędów

### Kod 400 Bad Request
**Przyczyna:** Nieprawidłowy format danych wejściowych (Zod validation)

**Kiedy:**
- Brak wymaganych pól (`name`, `type_code`, `target_amount_cents`)
- Nieprawidłowy typ danych (np. string zamiast number)
- `name` dłuższy niż 100 znaków lub pusty
- `target_amount_cents` nie jest dodatnią liczbą całkowitą
- `is_priority` nie jest boolean

**Obsługa:**
```typescript
catch (error) {
  if (error instanceof z.ZodError) {
    const errorResponse: ErrorResponseDTO = {
      error: "Bad Request",
      message: "Invalid request body",
      details: formatZodErrors(error),
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

### Kod 409 Conflict
**Przyczyna:** Próba ustawienia priorytetu gdy inny cel już jest priorytetem

**Kiedy:**
- `is_priority = true` w request
- Użytkownik ma już inny aktywny cel z `is_priority = true`

**Obsługa:**
```typescript
// W service layer:
if (command.is_priority) {
  const { data: existingPriority } = await supabase
    .from("goals")
    .select("id")
    .eq("user_id", userId)
    .eq("is_priority", true)
    .is("archived_at", null)
    .is("deleted_at", null)
    .maybeSingle();
  
  if (existingPriority) {
    throw new ValidationError(
      "Another goal is already marked as priority",
      { is_priority: "Only one goal can be marked as priority at a time" }
    );
  }
}

// W API route:
catch (error) {
  if (error instanceof ValidationError && 
      error.details?.is_priority) {
    const errorResponse: ErrorResponseDTO = {
      error: "Conflict",
      message: error.message,
      details: error.details,
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

### Kod 422 Unprocessable Entity
**Przyczyna:** Błędy walidacji biznesowej

**Kiedy:**
- `type_code` nie istnieje w tabeli `goal_types`
- `type_code` istnieje ale `is_active = false`

**Obsługa:**
```typescript
// W service layer:
const { data: goalType, error: typeError } = await supabase
  .from("goal_types")
  .select("is_active")
  .eq("code", command.type_code)
  .single();

if (typeError || !goalType) {
  throw new ValidationError(
    "Goal type code does not exist or is inactive",
    { type_code: command.type_code }
  );
}

if (!goalType.is_active) {
  throw new ValidationError(
    "Goal type is not active",
    { type_code: command.type_code }
  );
}

// W API route:
catch (error) {
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
}
```

### Kod 500 Internal Server Error
**Przyczyna:** Nieoczekiwane błędy serwera

**Kiedy:**
- Błędy bazy danych (connection timeout, constraint violations)
- Nieobsłużone wyjątki w kodzie

**Obsługa:**
```typescript
catch (error) {
  // Log error for debugging
  console.error("Unexpected error in POST /api/v1/goals:", error);
  
  const errorResponse: ErrorResponseDTO = {
    error: "Internal Server Error",
    message: "An unexpected error occurred. Please try again later.",
  };
  return new Response(JSON.stringify(errorResponse), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
```

### Hierarchia obsługi błędów
```
1. ZodError (400) → Invalid input format
2. ValidationError with is_priority (409) → Priority conflict
3. ValidationError (422) → Business validation failed
4. Any other error (500) → Unexpected server error
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje zapytań

**1. Walidacja typu celu - Single Query**
```sql
-- Jedna kwerenda zamiast dwóch
SELECT is_active 
FROM goal_types 
WHERE code = :type_code
```
- Wykorzystuje indeks `goal_types_pkey(code)`
- Czas: ~1ms (index lookup)

**2. Sprawdzenie priorytetu - Conditional Query**
```sql
-- Wykonywane TYLKO jeśli is_priority = true
SELECT id 
FROM goals 
WHERE user_id = :user_id 
  AND is_priority = true 
  AND archived_at IS NULL 
  AND deleted_at IS NULL
LIMIT 1
```
- Wykorzystuje częściowy indeks `uniq_goals_priority(user_id)`
- Czas: ~1ms (partial index scan)
- **Optymalizacja:** Zapytanie pomijane gdy `is_priority = false` (90% przypadków)

**3. Insert + Select z JOIN - Single Round-Trip**
```typescript
const { data } = await supabase
  .from("goals")
  .insert({ ... })
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
  .single();
```
- Jedna podróż do bazy zamiast dwóch (INSERT + SELECT)
- JOIN wykonywany na poziomie bazy danych
- Czas: ~5-10ms (zależy od latencji sieci)

### Potencjalne wąskie gardła

**1. Latencja sieci do Supabase**
- **Problem:** Każde zapytanie to round-trip do chmury
- **Mitigation:** 
  - Łączenie zapytań (INSERT + SELECT w jednym)
  - Pomijanie opcjonalnych sprawdzeń (walidacja priorytetu)
  - Wykorzystanie connection pooling w Supabase

**2. Walidacja priorytetu przy dużej liczbie celów**
- **Problem:** Skanowanie wielu celów użytkownika
- **Mitigation:**
  - Częściowy indeks `uniq_goals_priority` (tylko gdy is_priority=true)
  - Early termination z `LIMIT 1`
  - Database-level constraint jako backup

**3. Serializacja JSON response**
- **Problem:** Transformacja danych do JSON może być kosztowna
- **Mitigation:** 
  - Native JSON support w Astro Response
  - Małe payloady (single goal, ~200 bytes)

### Prognozowane czasy odpowiedzi

**Optymistyczny scenariusz** (is_priority = false):
```
Zod validation:        ~1ms
Goal type check:       ~2ms  (single query)
Insert + select:       ~5ms  (with join)
Transform to DTO:      ~1ms
JSON serialization:    ~1ms
─────────────────────────────
Total:                ~10ms
```

**Pesymistyczny scenariusz** (is_priority = true):
```
Zod validation:        ~1ms
Goal type check:       ~2ms
Priority check:        ~3ms  (additional query)
Insert + select:       ~5ms
Transform to DTO:      ~1ms
JSON serialization:    ~1ms
─────────────────────────────
Total:                ~13ms
```

### Strategie optymalizacji dla przyszłości

**Jeśli wydajność stanie się problemem:**

1. **Caching słowników** (`goal_types`)
   - Redis/In-memory cache dla `goal_types` (rzadko się zmieniają)
   - TTL: 1 godzina
   - Redukcja: -2ms na request

2. **Batch validation**
   - Jeśli frontend wysyła wiele celów naraz
   - Pojedyncze zapytanie dla wszystkich typów
   - `WHERE type_code IN (:codes)`

3. **Database Function**
   - Przeniesienie całej logiki do funkcji PL/pgSQL
   - Redukcja round-trips z 2-3 do 1
   - Trade-off: trudniejsze debugowanie i testowanie

4. **Optimistic UI**
   - Frontend natychmiast pokazuje nowy cel (przed response)
   - Rollback w przypadku błędu
   - Perceived performance: instant

## 9. Etapy wdrożenia

### Krok 1: Utworzenie Zod schema (goal.schema.ts)
**Lokalizacja:** `src/lib/schemas/goal.schema.ts`

**Zadania:**
- [ ] Utworzyć nowy plik `goal.schema.ts`
- [ ] Zdefiniować `CreateGoalSchema` z validacją:
  - `name`: min 1, max 100 znaków
  - `type_code`: niepusty string
  - `target_amount_cents`: positive integer
  - `is_priority`: optional boolean, default false
- [ ] Dodać pomocnicze funkcje (jeśli potrzebne)
- [ ] Dodać JSDoc komentarze opisujące reguły walidacji

**Zależności:**
- `zod` package (już zainstalowany)

**Przykładowa implementacja:**
```typescript
import { z } from "zod";

/**
 * Zod schema for CreateGoalCommand
 * Validates incoming request data for POST /api/v1/goals
 *
 * Validation rules:
 * - name: Required, 1-100 characters
 * - type_code: Required, non-empty string
 * - target_amount_cents: Required, positive integer
 * - is_priority: Optional boolean, defaults to false
 */
export const CreateGoalSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name cannot exceed 100 characters"),
  
  type_code: z
    .string()
    .min(1, "Goal type code is required"),
  
  target_amount_cents: z
    .number({
      required_error: "Target amount is required",
      invalid_type_error: "Target amount must be a number",
    })
    .int("Target amount must be an integer")
    .positive("Target amount must be greater than 0"),
  
  is_priority: z
    .boolean()
    .optional()
    .default(false),
});
```

### Krok 2: Utworzenie Service Layer (goal.service.ts)
**Lokalizacja:** `src/lib/services/goal.service.ts`

**Zadania:**
- [ ] Utworzyć nowy plik `goal.service.ts`
- [ ] Zdefiniować klasę `ValidationError` (export lub import z transaction.service)
- [ ] Zaimplementować funkcję `createGoal(supabase, userId, command)`
- [ ] Zaimplementować walidację typu celu (sprawdzenie w `goal_types`)
- [ ] Zaimplementować walidację priorytetu (jeśli `is_priority = true`)
- [ ] Zaimplementować insert do tabeli `goals`
- [ ] Zaimplementować fetch z joinami (`goal_types.label_pl`)
- [ ] Zaimplementować transformację do `GoalDTO` (compute `progress_percentage`)
- [ ] Dodać szczegółowe JSDoc komentarze
- [ ] Dodać obsługę błędów z odpowiednimi komunikatami

**Zależności:**
- `@/db/supabase.client` - SupabaseClient type
- `@/types` - CreateGoalCommand, GoalDTO

**Struktura funkcji:**
```typescript
export async function createGoal(
  supabase: SupabaseClient,
  userId: string,
  command: CreateGoalCommand
): Promise<GoalDTO> {
  // Step 1: Validate goal type exists and is active
  // Step 2: Validate priority conflict (if is_priority=true)
  // Step 3: Insert goal into database
  // Step 4: Fetch goal with joined type_label
  // Step 5: Transform to DTO with computed progress_percentage
  // Step 6: Return GoalDTO
}
```

### Krok 3: Utworzenie API Route (goals/index.ts)
**Lokalizacja:** `src/pages/api/v1/goals/index.ts`

**Zadania:**
- [ ] Utworzyć katalog `src/pages/api/v1/goals/` (jeśli nie istnieje)
- [ ] Utworzyć plik `index.ts`
- [ ] Dodać `export const prerender = false`
- [ ] Zaimplementować funkcję `POST(context: APIContext)`
- [ ] Dodać parsowanie request body (`context.request.json()`)
- [ ] Dodać walidację z `CreateGoalSchema.parse()`
- [ ] Wywołać `createGoal()` z service layer
- [ ] Zwrócić odpowiedź `201 Created` z GoalDTO
- [ ] Dodać helper `formatZodErrors()` (lub zaimportować)
- [ ] Zaimplementować hierarchię obsługi błędów:
  1. ZodError → 400
  2. ValidationError (priority) → 409
  3. ValidationError (inne) → 422
  4. Inne błędy → 500
- [ ] Dodać JSDoc komentarze dla funkcji POST
- [ ] Dodać logowanie błędów (`console.error`)

**Zależności:**
- `astro` - APIContext type
- `zod` - ZodError handling
- `@/db/supabase.client` - supabaseClient, DEFAULT_USER_ID
- `@/lib/schemas/goal.schema` - CreateGoalSchema
- `@/lib/services/goal.service` - createGoal, ValidationError
- `@/types` - ErrorResponseDTO

**Wzorzec z istniejącego kodu:**
- Wzorować się na `src/pages/api/v1/transactions/index.ts`
- Użyć tego samego stylu obsługi błędów
- Użyć tego samego formatu odpowiedzi

### Krok 4: Testowanie manualne
**Po implementacji:**

1. **Test 1: Pomyślne utworzenie celu**
   ```bash
   curl -X POST http://localhost:4321/api/v1/goals \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Wakacje w Grecji",
       "type_code": "VACATION",
       "target_amount_cents": 500000,
       "is_priority": false
     }'
   ```
   **Oczekiwany rezultat:** 201 Created z GoalDTO

2. **Test 2: Walidacja Zod - brak wymaganych pól**
   ```bash
   curl -X POST http://localhost:4321/api/v1/goals \
     -H "Content-Type: application/json" \
     -d '{"name": "Test"}'
   ```
   **Oczekiwany rezultat:** 400 Bad Request

3. **Test 3: Walidacja typu celu - nieistniejący kod**
   ```bash
   curl -X POST http://localhost:4321/api/v1/goals \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test Goal",
       "type_code": "NONEXISTENT",
       "target_amount_cents": 100000
     }'
   ```
   **Oczekiwany rezultat:** 422 Unprocessable Entity

4. **Test 4: Konflikt priorytetu**
   ```bash
   # Najpierw utwórz cel z priorytetem
   curl -X POST http://localhost:4321/api/v1/goals \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Priority Goal 1",
       "type_code": "VACATION",
       "target_amount_cents": 100000,
       "is_priority": true
     }'
   
   # Następnie spróbuj utworzyć drugi priorytetowy
   curl -X POST http://localhost:4321/api/v1/goals \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Priority Goal 2",
       "type_code": "AUTO",
       "target_amount_cents": 200000,
       "is_priority": true
     }'
   ```
   **Oczekiwany rezultat:** 409 Conflict

5. **Test 5: Długa nazwa (>100 znaków)**
   ```bash
   curl -X POST http://localhost:4321/api/v1/goals \
     -H "Content-Type: application/json" \
     -d '{
       "name": "'"$(printf 'A%.0s' {1..101})"'",
       "type_code": "VACATION",
       "target_amount_cents": 100000
     }'
   ```
   **Oczekiwany rezultat:** 400 Bad Request

### Krok 5: Weryfikacja w bazie danych
**Po testach:**

1. **Sprawdź utworzone rekordy:**
   ```sql
   SELECT 
     g.id, 
     g.name, 
     g.type_code, 
     gt.label_pl,
     g.target_amount_cents,
     g.current_balance_cents,
     g.is_priority,
     g.created_at
   FROM goals g
   JOIN goal_types gt ON g.type_code = gt.code
   WHERE g.user_id = '[DEFAULT_USER_ID]'
   ORDER BY g.created_at DESC;
   ```

2. **Zweryfikuj constraint priorytetu:**
   ```sql
   SELECT COUNT(*) as priority_count
   FROM goals
   WHERE user_id = '[DEFAULT_USER_ID]'
     AND is_priority = true
     AND archived_at IS NULL
     AND deleted_at IS NULL;
   ```
   **Oczekiwany rezultat:** `priority_count = 0 lub 1` (nigdy więcej)

3. **Sprawdź domyślne wartości:**
   ```sql
   SELECT 
     current_balance_cents,
     archived_at,
     deleted_at
   FROM goals
   WHERE id = '[INSERTED_GOAL_ID]';
   ```
   **Oczekiwane wartości:**
   - `current_balance_cents = 0`
   - `archived_at = NULL`
   - `deleted_at = NULL`

### Krok 6: Code Review Checklist
**Przed mergem:**

- [ ] **Code Style:**
  - [ ] Używane podwójne cudzysłowy (`"`)
  - [ ] Średniki na końcu linii
  - [ ] Zgodność z ESLint rules

- [ ] **TypeScript:**
  - [ ] Brak `any` types
  - [ ] Wszystkie typy importowane z `@/types`
  - [ ] Proper use of `SupabaseClient` type

- [ ] **Error Handling:**
  - [ ] Obsługa ZodError (400)
  - [ ] Obsługa ValidationError z rozróżnieniem 409 vs 422
  - [ ] Catch-all dla 500
  - [ ] Logging błędów z `console.error`

- [ ] **Documentation:**
  - [ ] JSDoc komentarze dla wszystkich funkcji
  - [ ] Opisane parametry i return types
  - [ ] Przykłady użycia w komentarzach API route

- [ ] **Business Logic:**
  - [ ] Walidacja typu celu przed insertem
  - [ ] Walidacja priorytetu (jeśli applicable)
  - [ ] Proper transformation do DTO
  - [ ] Correct calculation of `progress_percentage`

- [ ] **Database:**
  - [ ] Użycie `.single()` dla single record queries
  - [ ] Użycie `.select()` po `.insert()` dla fetching
  - [ ] Proper JOIN syntax dla `goal_types`
  - [ ] RLS działa poprawnie (test w Supabase Dashboard)

- [ ] **Security:**
  - [ ] No SQL injection vulnerabilities (parametrized queries)
  - [ ] RLS enabled and tested
  - [ ] Input validation on all fields

### Krok 7: Dokumentacja
**Po implementacji:**

1. **Zaktualizuj testing guide:**
   - [ ] Stwórz `.ai/testing-guide-create-goal.md`
   - [ ] Dodaj przykłady cURL dla wszystkich scenariuszy
   - [ ] Udokumentuj expected responses

2. **Zaktualizuj README (jeśli istnieje):**
   - [ ] Dodaj endpoint do listy zaimplementowanych API

3. **Dodaj komentarze TODO (jeśli potrzebne):**
   - [ ] Oznacz miejsca wymagające uwagi przy implementacji auth
   - [ ] Oznacz potencjalne optymalizacje

## Podsumowanie implementacji

**Nowe pliki do utworzenia:**
1. `src/lib/schemas/goal.schema.ts` - Zod validation
2. `src/lib/services/goal.service.ts` - Business logic
3. `src/pages/api/v1/goals/index.ts` - API endpoint

**Szacowany czas implementacji:**
- Krok 1 (Schema): ~30 min
- Krok 2 (Service): ~1.5h
- Krok 3 (API Route): ~45 min
- Krok 4-5 (Testing): ~1h
- Krok 6-7 (Review + Docs): ~30 min
- **Total: ~4-5 godzin**

**Główne wyzwania:**
1. Poprawna obsługa konfliktu priorytetu (409 vs 422)
2. Prawidłowe obliczenie `progress_percentage` (będzie 0 dla nowych celów)
3. Zgodność z istniejącym stylem kodu (transactions pattern)

