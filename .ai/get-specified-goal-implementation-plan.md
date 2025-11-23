# API Endpoint Implementation Plan: GET /api/v1/goals/:id

## 1. Przegląd punktu końcowego

Endpoint służy do pobierania szczegółowych informacji o konkretnym celu finansowym użytkownika, wraz z opcjonalną historią wydarzeń (wpłaty/wypłaty) oraz obliczeniami zmian miesięcznych.

**Główne funkcje:**
- Pobieranie pełnych danych celu z bazy danych
- Join z tabelą `goal_types` w celu uzyskania czytelnej etykiety typu celu
- Obliczanie procentu realizacji celu (`progress_percentage`)
- Opcjonalne dołączanie historii wydarzeń celu
- Filtrowanie wydarzeń po miesiącu
- Obliczanie miesięcznej zmiany salda celu (`monthly_change_cents`)

**Zabezpieczenia:**
- Dostęp tylko dla zalogowanych użytkowników z potwierdzonym emailem
- RLS (Row Level Security) zapewnia, że użytkownik widzi tylko swoje cele
- Soft-deleted cele są ukryte

---

## 2. Szczegóły żądania

### Metoda HTTP
`GET`

### Struktura URL
```
/api/v1/goals/:id
```

### Parametry URL (Path Parameters)
- **`id`** (required, UUID) - Identyfikator celu do pobrania

### Query Parameters
- **`include_events`** (optional, boolean) - Czy dołączyć historię wydarzeń celu
  - Default: `true`
  - Wartości: `"true"` lub `"false"` (jako string w query)
  
- **`month`** (optional, string) - Filtruj wydarzenia po miesiącu
  - Format: `YYYY-MM` (np. `"2025-01"`)
  - Walidacja: musi być prawidłową datą, nie może być w przyszłości
  - Działa tylko gdy `include_events=true`

### Request Headers
- **`Authorization`** - Bearer token (zarządzany przez Supabase Auth)
- **`Content-Type`** - `application/json`

### Request Body
Brak (metoda GET)

---

## 3. Wykorzystywane typy

### Typy z `src/types.ts`

**Typ odpowiedzi:**
```typescript
export interface GoalDetailDTO extends GoalDTO {
  events: GoalEventInDetailDTO[];
  monthly_change_cents: number;
}
```

**Typ bazowy GoalDTO:**
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
  type_label: string;
  progress_percentage: number;
}
```

**Typ wydarzenia:**
```typescript
type GoalEventInDetailDTO = Pick<
  GoalEventEntity, 
  "id" | "type" | "amount_cents" | "occurred_on" | "created_at"
>;
```

**Typ błędu:**
```typescript
export interface ErrorResponseDTO {
  error: string;
  message: string;
  details?: Record<string, string>;
}
```

### Nowe schematy Zod (do utworzenia)

**Schema dla query parameters:**
```typescript
// src/lib/schemas/goal.schema.ts

export const getGoalByIdQuerySchema = z.object({
  include_events: z
    .string()
    .optional()
    .default("true")
    .transform((val) => val === "true"),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format")
    .refine(
      (val) => {
        const date = new Date(val + "-01");
        return date <= new Date();
      },
      { message: "Month cannot be in the future" }
    )
    .optional(),
});

export const getGoalByIdParamsSchema = z.object({
  id: z.string().uuid("Invalid goal ID format"),
});
```

---

## 4. Szczegóły odpowiedzi

### Success Response: `200 OK`

**Struktura:**
```json
{
  "id": "uuid-string",
  "name": "Wakacje w Grecji",
  "type_code": "VACATION",
  "type_label": "Wakacje",
  "target_amount_cents": 500000,
  "current_balance_cents": 125000,
  "progress_percentage": 25.0,
  "is_priority": true,
  "archived_at": null,
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-15T18:30:00Z",
  "events": [
    {
      "id": "uuid-string",
      "type": "DEPOSIT",
      "amount_cents": 50000,
      "occurred_on": "2025-01-15",
      "created_at": "2025-01-15T18:30:00Z"
    }
  ],
  "monthly_change_cents": 50000
}
```

**Opis pól:**
- `progress_percentage` - Obliczony jako `(current_balance_cents / target_amount_cents) * 100`
- `type_label` - Pobrane z `goal_types.label_pl` przez JOIN
- `events` - Tablica wydarzeń, pusta jeśli `include_events=false`
- `monthly_change_cents` - Suma netto (DEPOSIT - WITHDRAW) dla podanego miesiąca, lub 0 jeśli brak month parameter

### Error Responses

**`400 Bad Request`** - Nieprawidłowe parametry zapytania
```json
{
  "error": "validation_error",
  "message": "Invalid query parameters",
  "details": {
    "month": "Month must be in YYYY-MM format"
  }
}
```

**`401 Unauthorized`** - Brak autoryzacji
```json
{
  "error": "unauthorized",
  "message": "Authentication required"
}
```

**`403 Forbidden`** - Email nie zweryfikowany
```json
{
  "error": "forbidden",
  "message": "Email verification required"
}
```

**`404 Not Found`** - Cel nie istnieje lub nie należy do użytkownika
```json
{
  "error": "not_found",
  "message": "Goal not found"
}
```

**`500 Internal Server Error`** - Błąd serwera
```json
{
  "error": "internal_error",
  "message": "An unexpected error occurred"
}
```

---

## 5. Przepływ danych

### Schemat przepływu

```
1. Client Request
   ↓
2. Astro API Route Handler (/api/v1/goals/[id].ts)
   ↓
3. Walidacja query parameters (Zod schema)
   ↓
4. Walidacja path parameter :id (Zod schema)
   ↓
5. Pobranie supabase client z context.locals
   ↓
6. Wywołanie goal.service.getGoalById()
   ↓
7. Service Layer (goal.service.ts)
   ├─ Query do tabeli goals (JOIN z goal_types)
   ├─ Filtracja: deleted_at IS NULL
   ├─ Sprawdzenie istnienia (zwróć null jeśli nie ma)
   ├─ Obliczenie progress_percentage
   ├─ Jeśli include_events=true:
   │  ├─ Query do goal_events
   │  ├─ Filtracja po goal_id
   │  ├─ Opcjonalnie filtracja po month (WHERE month = ...)
   │  └─ Sortowanie po occurred_on DESC, created_at DESC
   └─ Obliczenie monthly_change_cents
      └─ SUM(CASE WHEN type='DEPOSIT' THEN amount_cents ELSE -amount_cents END)
   ↓
8. Formatowanie odpowiedzi (GoalDetailDTO)
   ↓
9. Return Response (200 OK) lub Error (404/500)
```

### Szczegóły implementacji service layer

**Metoda w `goal.service.ts`:**

```typescript
async getGoalById(
  userId: string,
  goalId: string,
  includeEvents: boolean = true,
  month?: string
): Promise<GoalDetailDTO | null>
```

**Query do pobrania celu:**
```sql
SELECT 
  g.id,
  g.name,
  g.type_code,
  g.target_amount_cents,
  g.current_balance_cents,
  g.is_priority,
  g.archived_at,
  g.created_at,
  g.updated_at,
  gt.label_pl as type_label
FROM goals g
INNER JOIN goal_types gt ON g.type_code = gt.code
WHERE g.id = $1
  AND g.user_id = $2
  AND g.deleted_at IS NULL
```

**Query do pobrania wydarzeń (jeśli includeEvents=true):**
```sql
SELECT 
  id,
  type,
  amount_cents,
  occurred_on,
  created_at
FROM goal_events
WHERE goal_id = $1
  AND user_id = $2
  [AND month = $3]  -- opcjonalnie jeśli month podane
ORDER BY occurred_on DESC, created_at DESC
```

**Query do obliczenia monthly_change_cents (jeśli month podane):**
```sql
SELECT 
  COALESCE(
    SUM(
      CASE 
        WHEN type = 'DEPOSIT' THEN amount_cents 
        ELSE -amount_cents 
      END
    ),
    0
  ) as monthly_change
FROM goal_events
WHERE goal_id = $1
  AND user_id = $2
  AND month = $3
```

---

## 6. Względy bezpieczeństwa

### 1. Uwierzytelnianie (Authentication)
- Endpoint wymaga aktywnej sesji użytkownika (Bearer token w headerze Authorization)
- Middleware Astro (`src/middleware/index.ts`) powinno weryfikować token przed dotarciem do handlera
- Jeśli brak tokenu → `401 Unauthorized`

### 2. Autoryzacja (Authorization)
- **RLS (Row Level Security)** na tabeli `goals`:
  ```sql
  USING (user_id = auth.uid() AND EXISTS(
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.email_confirmed
  ))
  ```
- Supabase automatycznie filtruje wyniki według `user_id`
- Dodatkowa walidacja w service: zawsze przekazuj `userId` z auth context

### 3. Weryfikacja Email
- RLS wymaga `email_confirmed = true` w tabeli `profiles`
- Jeśli email nie zweryfikowany, RLS zwróci pusty wynik → traktuj jako `403 Forbidden`

### 4. Walidacja Input
- **UUID validation**: Waliduj format UUID dla `:id` przed query (zapobiega SQL injection)
- **Month format**: Regex `/^\d{4}-\d{2}$/` + walidacja czy data nie jest w przyszłości
- **Boolean coercion**: Przekształć string "true"/"false" na boolean

### 5. Soft-Delete
- Zawsze filtruj `deleted_at IS NULL` w queries
- Cele soft-deleted powinny zwracać `404 Not Found`

### 6. Information Disclosure
- Nie ujawniaj różnicy między "cel nie istnieje" a "cel należy do innego użytkownika"
- Oba przypadki zwracają `404 Not Found` z tym samym komunikatem

### 7. Rate Limiting
- Rozważ implementację rate limitingu dla tego endpointu (np. 100 req/min per user)
- Można użyć middleware lub Edge Function Supabase

---

## 7. Obsługa błędów

### Scenariusze błędów i ich obsługa

| Scenariusz | Kod HTTP | Error Code | Message | Akcja |
|------------|----------|------------|---------|-------|
| Nieprawidłowy format UUID w `:id` | 400 | `validation_error` | `"Invalid goal ID format"` | Walidacja Zod, zwróć szczegóły |
| Nieprawidłowy format `month` | 400 | `validation_error` | `"Month must be in YYYY-MM format"` | Walidacja Zod, zwróć szczegóły |
| Miesiąc w przyszłości | 400 | `validation_error` | `"Month cannot be in the future"` | Walidacja Zod |
| Brak tokenu auth | 401 | `unauthorized` | `"Authentication required"` | Middleware zwraca 401 |
| Nieprawidłowy token | 401 | `unauthorized` | `"Invalid or expired token"` | Supabase zwraca błąd auth |
| Email nie zweryfikowany | 403 | `forbidden` | `"Email verification required"` | Sprawdź profiles.email_confirmed |
| Cel nie istnieje | 404 | `not_found` | `"Goal not found"` | Service zwraca null → 404 |
| Cel jest soft-deleted | 404 | `not_found` | `"Goal not found"` | Service zwraca null → 404 |
| Cel należy do innego użytkownika | 404 | `not_found` | `"Goal not found"` | RLS filtruje → null → 404 |
| Błąd połączenia z bazą | 500 | `internal_error` | `"An unexpected error occurred"` | Loguj błąd, zwróć 500 |
| Nieoczekiwany błąd w service | 500 | `internal_error` | `"An unexpected error occurred"` | Loguj błąd, zwróć 500 |

### Implementacja obsługi błędów w route handler

```typescript
try {
  // 1. Walidacja parametrów
  const paramsValidation = getGoalByIdParamsSchema.safeParse({ id });
  if (!paramsValidation.success) {
    return new Response(
      JSON.stringify({
        error: "validation_error",
        message: "Invalid goal ID format",
        details: paramsValidation.error.flatten().fieldErrors,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 2. Walidacja query
  const queryValidation = getGoalByIdQuerySchema.safeParse(url.searchParams);
  if (!queryValidation.success) {
    return new Response(
      JSON.stringify({
        error: "validation_error",
        message: "Invalid query parameters",
        details: queryValidation.error.flatten().fieldErrors,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. Pobranie użytkownika
  const user = await supabase.auth.getUser();
  if (!user.data.user) {
    return new Response(
      JSON.stringify({
        error: "unauthorized",
        message: "Authentication required",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // 4. Sprawdzenie weryfikacji email (opcjonalnie, jeśli nie jest w RLS)
  const { data: profile } = await supabase
    .from("profiles")
    .select("email_confirmed")
    .eq("user_id", user.data.user.id)
    .single();

  if (!profile?.email_confirmed) {
    return new Response(
      JSON.stringify({
        error: "forbidden",
        message: "Email verification required",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // 5. Wywołanie service
  const goal = await goalService.getGoalById(
    user.data.user.id,
    paramsValidation.data.id,
    queryValidation.data.include_events,
    queryValidation.data.month
  );

  // 6. Sprawdzenie czy cel istnieje
  if (!goal) {
    return new Response(
      JSON.stringify({
        error: "not_found",
        message: "Goal not found",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // 7. Zwrócenie wyniku
  return new Response(JSON.stringify(goal), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
} catch (error) {
  // 8. Obsługa nieoczekiwanych błędów
  console.error("Error fetching goal:", error);
  return new Response(
    JSON.stringify({
      error: "internal_error",
      message: "An unexpected error occurred",
    }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}
```

---

## 8. Rozważania dotyczące wydajności

### Potencjalne wąskie gardła

1. **JOIN z goal_types**
   - Ryzyko: JOIN może być kosztowny przy dużej liczbie zapytań
   - Mitigacja: Indeks na `goals.type_code` i `goal_types.code` (już istnieje jako PK)

2. **Pobieranie wszystkich wydarzeń dla celu**
   - Ryzyko: Cel z wieloma wydarzeniami może zwracać dużo danych
   - Mitigacja: 
     - Limituj liczbę zwracanych wydarzeń (np. ostatnie 100)
     - Użyj parametru `month` do filtrowania
     - Rozważ paginację w przyszłości

3. **Obliczanie monthly_change_cents**
   - Ryzyko: Agregacja może być kosztowna
   - Mitigacja: 
     - Użyj indeksu `idx_ge_goal_month(goal_id, month)`
     - Agregacja SUM jest szybka dla małych zbiorów danych

4. **Wielokrotne zapytania SQL**
   - Ryzyko: 3 osobne zapytania (goal, events, monthly_change)
   - Mitigacja:
     - Rozważ połączenie w jedno zapytanie z CTEs
     - Lub użyj Postgres JSON aggregation dla events

### Strategie optymalizacji

#### 1. Cache na poziomie aplikacji
- Nie zalecane dla tego endpointu (dane mogą się często zmieniać)
- Jeśli potrzebne, użyj krótkiego TTL (np. 30 sekund)

#### 2. Optymalizacja zapytań SQL

**Połączone zapytanie z CTEs:**
```sql
WITH goal_data AS (
  SELECT 
    g.id, g.name, g.type_code, g.target_amount_cents,
    g.current_balance_cents, g.is_priority, g.archived_at,
    g.created_at, g.updated_at,
    gt.label_pl as type_label
  FROM goals g
  INNER JOIN goal_types gt ON g.type_code = gt.code
  WHERE g.id = $1 AND g.user_id = $2 AND g.deleted_at IS NULL
),
events_data AS (
  SELECT 
    json_agg(
      json_build_object(
        'id', id,
        'type', type,
        'amount_cents', amount_cents,
        'occurred_on', occurred_on,
        'created_at', created_at
      ) ORDER BY occurred_on DESC, created_at DESC
    ) as events
  FROM goal_events
  WHERE goal_id = $1 AND user_id = $2
    [AND month = $3]  -- opcjonalnie
),
monthly_change AS (
  SELECT 
    COALESCE(
      SUM(CASE WHEN type = 'DEPOSIT' THEN amount_cents ELSE -amount_cents END),
      0
    ) as change
  FROM goal_events
  WHERE goal_id = $1 AND user_id = $2 AND month = $3
)
SELECT 
  gd.*,
  COALESCE(ed.events, '[]'::json) as events,
  COALESCE(mc.change, 0) as monthly_change_cents
FROM goal_data gd
LEFT JOIN events_data ed ON true
LEFT JOIN monthly_change mc ON true;
```

#### 3. Indeksy (już zdefiniowane w db-plan.md)
- ✅ `idx_goals_user_month(user_id, id desc)` - dla podstawowego filtrowania
- ✅ `idx_ge_goal_month(goal_id, month)` - dla agregacji wydarzeń
- ✅ `idx_goals_active(user_id) where deleted_at is null` - dla aktywnych celów

#### 4. Connection pooling
- Supabase ma wbudowany connection pooling
- Używaj Supabase client z connection pooling (już domyślnie)

#### 5. Limitowanie danych
```typescript
// W service: limit wydarzeń do ostatnich 100
const { data: events } = await supabase
  .from("goal_events")
  .select("id, type, amount_cents, occurred_on, created_at")
  .eq("goal_id", goalId)
  .eq("user_id", userId)
  .order("occurred_on", { ascending: false })
  .order("created_at", { ascending: false })
  .limit(100); // Dodaj limit
```

---

## 9. Etapy wdrożenia

### Krok 1: Rozszerzenie schematów Zod
**Plik:** `src/lib/schemas/goal.schema.ts`

1.1. Dodaj schemat dla query parameters:
```typescript
export const getGoalByIdQuerySchema = z.object({
  include_events: z
    .string()
    .optional()
    .default("true")
    .transform((val) => val === "true"),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format")
    .refine(
      (val) => {
        const date = new Date(val + "-01");
        return date <= new Date();
      },
      { message: "Month cannot be in the future" }
    )
    .optional(),
});
```

1.2. Dodaj schemat dla path parameters:
```typescript
export const getGoalByIdParamsSchema = z.object({
  id: z.string().uuid("Invalid goal ID format"),
});
```

### Krok 2: Rozszerzenie goal.service.ts
**Plik:** `src/lib/services/goal.service.ts`

2.1. Dodaj metodę `getGoalById`:
```typescript
async getGoalById(
  userId: string,
  goalId: string,
  includeEvents: boolean = true,
  month?: string
): Promise<GoalDetailDTO | null> {
  // Implementacja zgodnie z sekcją "Przepływ danych"
}
```

2.2. Implementuj logikę:
- Query do pobrania celu z JOIN do goal_types
- Sprawdzenie czy cel istnieje (deleted_at IS NULL)
- Obliczenie progress_percentage
- Jeśli includeEvents=true: pobierz wydarzenia (opcjonalnie filtrowane po month)
- Oblicz monthly_change_cents dla podanego miesiąca
- Zwróć GoalDetailDTO lub null

### Krok 3: Utworzenie route handler
**Plik:** `src/pages/api/v1/goals/[id].ts`

3.1. Utwórz plik z exportem `GET` funkcji:
```typescript
export const prerender = false;

import type { APIRoute } from "astro";
import { getGoalByIdParamsSchema, getGoalByIdQuerySchema } from "@/lib/schemas/goal.schema";
import { GoalService } from "@/lib/services/goal.service";

export const GET: APIRoute = async ({ params, url, locals }) => {
  const supabase = locals.supabase;
  const goalService = new GoalService(supabase);

  try {
    // Implementacja zgodnie z sekcją "Obsługa błędów"
  } catch (error) {
    // Error handling
  }
};
```

3.2. Implementuj pełną logikę według sekcji "Obsługa błędów"

### Krok 4: Testowanie manualne

4.1. **Test pozytywny - podstawowy:**
```bash
curl -X GET "http://localhost:4321/api/v1/goals/{goal-id}" \
  -H "Authorization: Bearer {token}"
```
Oczekiwany wynik: 200 OK z pełnymi danymi celu

4.2. **Test pozytywny - bez wydarzeń:**
```bash
curl -X GET "http://localhost:4321/api/v1/goals/{goal-id}?include_events=false" \
  -H "Authorization: Bearer {token}"
```
Oczekiwany wynik: 200 OK, events = []

4.3. **Test pozytywny - filtr po miesiącu:**
```bash
curl -X GET "http://localhost:4321/api/v1/goals/{goal-id}?month=2025-01" \
  -H "Authorization: Bearer {token}"
```
Oczekiwany wynik: 200 OK, tylko wydarzenia z stycznia 2025

4.4. **Test negatywny - nieprawidłowy UUID:**
```bash
curl -X GET "http://localhost:4321/api/v1/goals/invalid-id" \
  -H "Authorization: Bearer {token}"
```
Oczekiwany wynik: 400 Bad Request

4.5. **Test negatywny - nieprawidłowy format month:**
```bash
curl -X GET "http://localhost:4321/api/v1/goals/{goal-id}?month=2025-1" \
  -H "Authorization: Bearer {token}"
```
Oczekiwany wynik: 400 Bad Request

4.6. **Test negatywny - brak autoryzacji:**
```bash
curl -X GET "http://localhost:4321/api/v1/goals/{goal-id}"
```
Oczekiwany wynik: 401 Unauthorized

4.7. **Test negatywny - cel nie istnieje:**
```bash
curl -X GET "http://localhost:4321/api/v1/goals/{non-existent-uuid}" \
  -H "Authorization: Bearer {token}"
```
Oczekiwany wynik: 404 Not Found

4.8. **Test negatywny - cel należy do innego użytkownika:**
```bash
curl -X GET "http://localhost:4321/api/v1/goals/{other-user-goal-id}" \
  -H "Authorization: Bearer {token}"
```
Oczekiwany wynik: 404 Not Found (dzięki RLS)

### Krok 5: Walidacja działania RLS

5.1. Sprawdź w pgAdmin/Supabase Dashboard, że polityka RLS dla `goals` jest aktywna:
```sql
SELECT * FROM pg_policies WHERE tablename = 'goals';
```

5.2. Przetestuj query bezpośrednio w SQL Editor z `auth.uid()`:
```sql
SELECT * FROM goals WHERE id = '{goal-id}';
-- Powinno zwrócić tylko cele zalogowanego użytkownika
```

### Krok 6: Sprawdzenie wydajności

6.1. Użyj `EXPLAIN ANALYZE` dla głównego query:
```sql
EXPLAIN ANALYZE
SELECT 
  g.id, g.name, g.type_code, g.target_amount_cents,
  g.current_balance_cents, g.is_priority, g.archived_at,
  g.created_at, g.updated_at,
  gt.label_pl as type_label
FROM goals g
INNER JOIN goal_types gt ON g.type_code = gt.code
WHERE g.id = '{goal-id}'
  AND g.user_id = '{user-id}'
  AND g.deleted_at IS NULL;
```

6.2. Sprawdź czy używane są odpowiednie indeksy:
- Index Scan na `goals_pkey` lub `idx_goals_active`
- Index Scan na `goal_types_pkey`

6.3. Zmierz czas odpowiedzi:
```bash
time curl -X GET "http://localhost:4321/api/v1/goals/{goal-id}" \
  -H "Authorization: Bearer {token}"
```
Oczekiwany czas: < 200ms

### Krok 7: Obsługa edge cases

7.1. **Cel bez wydarzeń:**
- events powinno być pustą tablicą `[]`
- monthly_change_cents powinno być `0`

7.2. **Cel z archived_at:**
- Powinien być zwrócony normalnie (200 OK)
- archived_at nie null w odpowiedzi

7.3. **Cel z bardzo dużą liczbą wydarzeń:**
- Rozważ dodanie limitu (np. 100 ostatnich)
- Sprawdź czy czas odpowiedzi pozostaje akceptowalny

7.4. **Miesiąc bez wydarzeń:**
- events = []
- monthly_change_cents = 0

### Krok 8: Dokumentacja

8.1. Dodaj komentarze JSDoc do metody w service:
```typescript
/**
 * Retrieves detailed information about a specific goal
 * 
 * @param userId - ID of the authenticated user
 * @param goalId - UUID of the goal to retrieve
 * @param includeEvents - Whether to include goal events history (default: true)
 * @param month - Optional month filter in YYYY-MM format
 * @returns Goal details with events and monthly change, or null if not found
 */
async getGoalById(...)
```

8.2. Aktualizuj `api-plan.md` jeśli wprowadzono zmiany w specyfikacji

### Krok 9: Code review checklist

- [ ] Wszystkie schematy Zod są poprawnie zdefiniowane
- [ ] Walidacja parametrów jest kompletna (UUID, month format)
- [ ] Service zwraca `null` dla nieistniejących celów
- [ ] Route handler obsługuje wszystkie kody błędów (400, 401, 403, 404, 500)
- [ ] RLS jest aktywne i działa poprawnie
- [ ] Progress percentage jest obliczany poprawnie
- [ ] Monthly change cents jest obliczany poprawnie (DEPOSIT - WITHDRAW)
- [ ] Wydarzenia są sortowane poprawnie (DESC)
- [ ] Kod używa podwójnych cudzysłowów dla stringów
- [ ] Kod używa średników na końcu instrukcji
- [ ] Obsługa błędów loguje szczegóły do konsoli
- [ ] Response headers zawierają `Content-Type: application/json`
- [ ] Brak SQL injection (używamy Supabase prepared statements)
- [ ] Soft-deleted cele są filtrowane (`deleted_at IS NULL`)

### Krok 10: Integracja z frontendem (opcjonalnie)

10.1. Utwórz TypeScript client function:
```typescript
// src/lib/api/goals.ts
export async function getGoalById(
  goalId: string,
  options?: {
    includeEvents?: boolean;
    month?: string;
  }
): Promise<GoalDetailDTO> {
  const params = new URLSearchParams();
  if (options?.includeEvents !== undefined) {
    params.set("include_events", String(options.includeEvents));
  }
  if (options?.month) {
    params.set("month", options.month);
  }

  const response = await fetch(
    `/api/v1/goals/${goalId}?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

---

## 10. Podsumowanie

Ten plan wdrożenia obejmuje wszystkie aspekty implementacji endpointu `GET /api/v1/goals/:id`:

✅ **Bezpieczeństwo**: RLS, autoryzacja, walidacja input, soft-delete  
✅ **Wydajność**: Optymalizacja zapytań, indeksy, limitowanie danych  
✅ **Obsługa błędów**: Wszystkie scenariusze błędów z odpowiednimi kodami HTTP  
✅ **Zgodność**: Następuje guidelines projektu (Astro, TypeScript, Zod, Supabase)  
✅ **Testowanie**: Szczegółowe kroki testowania manualnego  
✅ **Dokumentacja**: JSDoc, komentarze, checklist code review  

Po wykonaniu wszystkich kroków endpoint będzie gotowy do użycia w środowisku produkcyjnym.

