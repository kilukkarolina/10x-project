# API Endpoint Implementation Plan: GET /api/v1/audit-log

## 1. Przegląd punktu końcowego

Endpoint `GET /api/v1/audit-log` umożliwia użytkownikom przeglądanie historii zmian (audit log) swoich danych w systemie FinFlow. Zwraca listę operacji CREATE, UPDATE i DELETE wykonanych na transakcjach, celach i zdarzeniach celów, wraz ze stanami before/after. System automatycznie zachowuje rekordy przez 30 dni, po czym są one usuwane.

**Kluczowe funkcjonalności:**
- Paginacja oparta na kursorach dla wydajnego przeglądania dużych zbiorów danych
- Elastyczne filtrowanie po typie encji, identyfikatorze, akcji i zakresie dat
- Dostęp tylko do własnych rekordów użytkownika (RLS)
- Wymagana weryfikacja email dla dostępu

## 2. Szczegóły żądania

### Metoda HTTP
`GET`

### Struktura URL
```
/api/v1/audit-log
```

### Parametry Query

**Wszystkie parametry są opcjonalne:**

| Parametr | Typ | Opis | Walidacja |
|----------|-----|------|-----------|
| `entity_type` | string | Filtr po typie encji | Enum: `transaction`, `goal`, `goal_event` |
| `entity_id` | string | Filtr po konkretnej encji | Format UUID v4 |
| `action` | string | Filtr po typie akcji | Enum: `CREATE`, `UPDATE`, `DELETE` |
| `from_date` | string | Filtr od daty (włącznie) | ISO 8601 timestamp |
| `to_date` | string | Filtr do daty (włącznie) | ISO 8601 timestamp |
| `cursor` | string | Kursor paginacji | Base64 encoded string |
| `limit` | number | Liczba rekordów na stronę | Min: 1, Max: 100, Default: 50 |

### Przykłady żądań

**Podstawowe żądanie (bez filtrów):**
```
GET /api/v1/audit-log?limit=50
```

**Filtrowanie po typie encji i akcji:**
```
GET /api/v1/audit-log?entity_type=transaction&action=UPDATE&limit=25
```

**Filtrowanie po zakresie dat:**
```
GET /api/v1/audit-log?from_date=2025-01-01T00:00:00Z&to_date=2025-01-31T23:59:59Z
```

**Paginacja (kolejna strona):**
```
GET /api/v1/audit-log?cursor=base64-encoded-cursor&limit=50
```

**Szczegóły konkretnej encji:**
```
GET /api/v1/audit-log?entity_type=goal&entity_id=550e8400-e29b-41d4-a716-446655440000
```

## 3. Wykorzystywane typy

### Istniejące typy (src/types.ts)

**Response DTO:**
```typescript
export interface AuditLogListResponseDTO {
  data: AuditLogEntryDTO[];
  pagination: PaginationDTO;
}

export type AuditLogEntryDTO = Pick<
  AuditLogEntity,
  "id" | "entity_type" | "entity_id" | "action" | "before" | "after" | "performed_at"
>;

export interface PaginationDTO {
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
}
```

**Error Response:**
```typescript
export interface ErrorResponseDTO {
  error: string;
  message: string;
  details?: Record<string, string>;
}
```

**Typy literałowe:**
```typescript
export type AuditLogAction = "CREATE" | "UPDATE" | "DELETE";
export type AuditLogEntityType = "transaction" | "goal" | "goal_event";
```

### Nowy schemat walidacji

**Lokalizacja:** `src/lib/schemas/audit-log.schema.ts`

```typescript
import { z } from "zod";

export const AuditLogQueryParamsSchema = z.object({
  entity_type: z.enum(["transaction", "goal", "goal_event"]).optional(),
  entity_id: z.string().uuid().optional(),
  action: z.enum(["CREATE", "UPDATE", "DELETE"]).optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type AuditLogQueryParams = z.infer<typeof AuditLogQueryParamsSchema>;
```

## 4. Szczegóły odpowiedzi

### Success Response: 200 OK

```json
{
  "data": [
    {
      "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "entity_type": "transaction",
      "entity_id": "550e8400-e29b-41d4-a716-446655440000",
      "action": "UPDATE",
      "before": {
        "amount_cents": 15750,
        "note": "Zakupy w Biedronce"
      },
      "after": {
        "amount_cents": 18000,
        "note": "Kolacja w restauracji"
      },
      "performed_at": "2025-01-16T10:00:00Z"
    },
    {
      "id": "8d0f7780-8536-51ef-a85c-f18gd2g01bf8",
      "entity_type": "goal",
      "entity_id": "660f9511-f30c-52e5-b827-557766551111",
      "action": "CREATE",
      "before": null,
      "after": {
        "name": "Wakacje 2025",
        "target_amount_cents": 500000
      },
      "performed_at": "2025-01-15T14:30:00Z"
    }
  ],
  "pagination": {
    "next_cursor": "eyJwZXJmb3JtZWRfYXQiOiIyMDI1LTAxLTE1VDE0OjMwOjAwWiIsImlkIjoiOGQwZjc3ODAtODUzNi01MWVmLWE4NWMtZjE4Z2QyZzAxYmY4In0=",
    "has_more": true,
    "limit": 50
  }
}
```

### Error Responses

**400 Bad Request - Nieprawidłowe parametry:**
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid query parameters",
  "details": {
    "limit": "Must be between 1 and 100",
    "entity_id": "Must be a valid UUID"
  }
}
```

**401 Unauthorized - Brak autoryzacji:**
```json
{
  "error": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

**401 Unauthorized - Niezweryfikowany email:**
```json
{
  "error": "EMAIL_NOT_VERIFIED",
  "message": "Email verification required to access this resource"
}
```

**500 Internal Server Error:**
```json
{
  "error": "INTERNAL_SERVER_ERROR",
  "message": "An unexpected error occurred"
}
```

## 5. Przepływ danych

### Diagram przepływu

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ GET /api/v1/audit-log?entity_type=transaction&limit=50
       ▼
┌──────────────────────────────────────────────────────┐
│  Astro API Route: src/pages/api/v1/audit-log/index.ts│
└──────┬───────────────────────────────────────────────┘
       │ 1. Parse & validate query params (Zod)
       │ 2. Extract user from context.locals.supabase
       │ 3. Check auth & email verification
       ▼
┌──────────────────────────────────────────────────────┐
│  Service: src/lib/services/audit-log.service.ts      │
└──────┬───────────────────────────────────────────────┘
       │ 4. Decode cursor (if provided)
       │ 5. Build Supabase query with filters
       │ 6. Apply RLS (automatic via Supabase client)
       ▼
┌──────────────────────────────────────────────────────┐
│  Supabase Database: audit_log table                  │
│  - RLS: owner_user_id = auth.uid()                   │
│  - Indexes: idx_al_owner_time, idx_al_owner_entity   │
└──────┬───────────────────────────────────────────────┘
       │ 6. Return results (max limit + 1 for has_more)
       ▼
┌──────────────────────────────────────────────────────┐
│  Service: audit-log.service.ts                       │
└──────┬───────────────────────────────────────────────┘
       │ 7. Map results to AuditLogEntryDTO[]
       │ 8. Generate next cursor (if has_more)
       │ 9. Build pagination metadata
       ▼
┌──────────────────────────────────────────────────────┐
│  API Route: index.ts                                 │
└──────┬───────────────────────────────────────────────┘
       │ 10. Return 200 OK with AuditLogListResponseDTO
       ▼
┌─────────────┐
│   Client    │
└─────────────┘
```

### Szczegółowy opis kroków

**1. Walidacja parametrów wejściowych:**
- Użycie Zod schema `AuditLogQueryParamsSchema`
- Automatyczne parsowanie typów (coerce dla `limit`)
- Wczesny return 400 przy błędach walidacji

**2. Uwierzytelnianie i autoryzacja:**
- Pobranie Supabase client z `context.locals.supabase`
- Sprawdzenie `auth.uid()` - return 401 jeśli brak
- Weryfikacja `email_confirmed` z tabeli `profiles` - return 401 jeśli false

**3. Dekodowanie kursora:**
- Cursor zawiera: `{ performed_at: string, id: string }`
- Base64 decode + JSON parse
- Walidacja struktury (try-catch, return 400 przy błędzie)

**4. Budowanie zapytania:**
- Start z `select('id, entity_type, entity_id, action, before, after, performed_at')`
- Dodanie filtrów dynamicznie (if provided):
  - `entity_type`: `.eq('entity_type', value)`
  - `entity_id`: `.eq('entity_id', value)`
  - `action`: `.eq('action', value)`
  - `from_date`: `.gte('performed_at', value)`
  - `to_date`: `.lte('performed_at', value)`
- Cursor: `.or(`performed_at.lt.${cursor.performed_at},and(performed_at.eq.${cursor.performed_at},id.lt.${cursor.id})`)`
- Order: `.order('performed_at', { ascending: false }).order('id', { ascending: false })`
- Limit: `.limit(limit + 1)` (fetch one extra to determine has_more)

**5. Wykonanie zapytania:**
- RLS automatycznie filtruje po `owner_user_id = auth.uid()`
- Użycie indeksu `idx_al_owner_time(owner_user_id, performed_at desc)` dla wydajności
- Jeśli są dodatkowe filtry, użycie `idx_al_owner_entity`

**6. Przetwarzanie wyników:**
- Sprawdzenie `error` z Supabase - return 500 przy błędzie
- Określenie `has_more`: `results.length > limit`
- Przycięcie wyników do `limit` jeśli `has_more`
- Mapowanie do `AuditLogEntryDTO[]`

**7. Generowanie next_cursor:**
- Jeśli `has_more`, wziąć ostatni element
- Utworzyć obiekt: `{ performed_at: lastItem.performed_at, id: lastItem.id }`
- JSON.stringify + Base64 encode

**8. Zwrócenie odpowiedzi:**
- 200 OK z `AuditLogListResponseDTO`

## 6. Względy bezpieczeństwa

### 6.1 Uwierzytelnianie i autoryzacja

**Wymagania:**
- Użytkownik MUSI być zalogowany (auth.uid() !== null)
- Email MUSI być zweryfikowany (profiles.email_confirmed = true)
- RLS automatycznie ogranicza dostęp tylko do własnych rekordów

**Implementacja w API route:**
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  return new Response(
    JSON.stringify({
      error: "UNAUTHORIZED",
      message: "Authentication required"
    }),
    { status: 401 }
  );
}

// Check email verification
const { data: profile } = await supabase
  .from("profiles")
  .select("email_confirmed")
  .eq("user_id", user.id)
  .single();

if (!profile?.email_confirmed) {
  return new Response(
    JSON.stringify({
      error: "EMAIL_NOT_VERIFIED",
      message: "Email verification required to access this resource"
    }),
    { status: 401 }
  );
}
```

### 6.2 Row Level Security (RLS)

**Polityka SELECT na tabeli audit_log:**
```sql
CREATE POLICY "Users can view own audit log"
  ON audit_log
  FOR SELECT
  USING (owner_user_id = auth.uid());
```

**Dodatkowa ochrona:**
- Brak polityk INSERT/UPDATE/DELETE dla użytkowników
- Tylko triggery mogą wstawiać rekordy
- Service role ma pełny dostęp (do czyszczenia 30+ dni)

### 6.3 Walidacja danych wejściowych

**Zagrożenia i mitigacje:**

1. **SQL Injection:**
   - Mitigacja: Supabase używa parametryzowanych zapytań
   - Dodatkowa walidacja przez Zod przed przekazaniem do DB

2. **Cursor Manipulation:**
   - Zagrożenie: Użytkownik może próbować zmodyfikować cursor do dostępu do cudzych danych
   - Mitigacja: RLS automatycznie filtruje wyniki, nawet przy zmodyfikowanym cursorze
   - Dodatkowo: Walidacja struktury cursora (try-catch przy dekodowaniu)

3. **DoS przez duże limity:**
   - Zagrożenie: Żądanie limit=1000000
   - Mitigacja: Zod walidacja max(100)

4. **Enumeration Attack:**
   - Zagrożenie: Sprawdzanie istnienia entity_id innych użytkowników
   - Mitigacja: RLS zwraca puste wyniki bez ujawniania czy encja istnieje

### 6.4 Ochrona danych wrażliwych

**Dane w before/after JSONB:**
- Zawierają pełne stany encji (np. kwoty, notatki)
- Już filtrowane przez RLS (tylko własne dane)
- Brak dodatkowej sanityzacji (użytkownik widzi własne dane)

**Uwaga:** Dane są przechowywane przez 30 dni przed automatycznym usunięciem.

### 6.5 Rate Limiting

**Rekomendacje:**
- Rozważyć dodanie rate limiting na poziomie Edge Function/Middleware
- Sugerowany limit: 100 żądań/minutę per użytkownik
- Obecnie brak wymogu w PRD, ale warto rozważyć na przyszłość

## 7. Obsługa błędów

### 7.1 Mapa błędów

| Kod | Error Code | Opis | Przyczyna | Akcja użytkownika |
|-----|-----------|------|-----------|-------------------|
| 400 | VALIDATION_ERROR | Nieprawidłowe parametry | Zły format UUID, limit poza zakresem, zła data | Poprawić parametry zapytania |
| 400 | INVALID_CURSOR | Nieprawidłowy cursor | Zmodyfikowany/uszkodzony cursor | Rozpocząć od pierwszej strony (bez cursor) |
| 401 | UNAUTHORIZED | Brak autoryzacji | Brak tokena auth lub sesja wygasła | Zalogować się ponownie |
| 401 | EMAIL_NOT_VERIFIED | Email niezweryfikowany | Konto istnieje ale email nie został zweryfikowany | Zweryfikować email |
| 500 | INTERNAL_SERVER_ERROR | Błąd serwera | Błąd bazy danych, błąd aplikacji | Spróbować ponownie, kontakt z supportem |

### 7.2 Implementacja obsługi błędów

**Struktura try-catch w API route:**

```typescript
export const GET: APIRoute = async (context) => {
  try {
    // 1. Validate query params
    const params = AuditLogQueryParamsSchema.safeParse(
      Object.fromEntries(context.url.searchParams)
    );
    
    if (!params.success) {
      return new Response(
        JSON.stringify({
          error: "VALIDATION_ERROR",
          message: "Invalid query parameters",
          details: params.error.flatten().fieldErrors
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Auth & email verification (jak wyżej)
    
    // 3. Call service
    const result = await AuditLogService.list(supabase, params.data);
    
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    // Handle cursor decode errors
    if (error instanceof CursorDecodeError) {
      return new Response(
        JSON.stringify({
          error: "INVALID_CURSOR",
          message: "Invalid pagination cursor"
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Generic server error
    console.error("Error in GET /api/v1/audit-log:", error);
    return new Response(
      JSON.stringify({
        error: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred"
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
```

**Custom error class dla cursor:**

```typescript
export class CursorDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CursorDecodeError";
  }
}
```

### 7.3 Logowanie błędów

**Co logować:**
- Wszystkie 500 errors z pełnym stack trace
- 400 errors tylko basic info (bez PII)
- Nie logować 401 (standardowe security events)

**Format logu:**
```typescript
console.error("Error in GET /api/v1/audit-log:", {
  error: error.message,
  stack: error.stack,
  user_id: user?.id, // jeśli dostępny
  params: params.data, // dla context
  timestamp: new Date().toISOString()
});
```

## 8. Wydajność

### 8.1 Strategie optymalizacji

**1. Indeksy bazy danych (już w db-plan.md):**

Główne indeksy wykorzystywane przez ten endpoint:
- `idx_al_owner_time(owner_user_id, performed_at desc)` - dla podstawowych query
- `idx_al_owner_entity(owner_user_id, entity_type, entity_id, performed_at desc)` - dla filtrów po encji

**2. Cursor-based pagination:**
- Wydajniejsza niż offset-based dla dużych zbiorów
- Stabilna kolejność nawet przy dodawaniu nowych rekordów
- Keyset: `(performed_at DESC, id DESC)` - unique ordering

**3. Limit query (+1 trick):**
- Fetch `limit + 1` rekordów
- Jeśli otrzymano `limit + 1`, znaczy że są kolejne strony
- Zwróć tylko `limit` rekordów + `has_more: true`
- Unika dodatkowego COUNT query

**4. Selective field projection:**
- SELECT tylko potrzebne kolumny, nie `SELECT *`
- Oszczędność bandwidth szczególnie dla dużych JSONB (before/after)

### 8.2 Potencjalne wąskie gardła

**1. Duże JSONB payloads:**
- Problem: `before` i `after` mogą być duże dla goal events z wieloma polami
- Mitigacja: Limit 100 rekordów max + pagination
- Monitoring: Średni rozmiar response

**2. Filtry po zakresie dat bez innych filtrów:**
- Problem: Zakres dat może zwrócić tysiące rekordów
- Mitigacja: Cursor pagination + RLS (tylko własne dane użytkownika)
- Indeks `idx_al_owner_time` wspiera sortowanie po dacie

**3. Queries bez cursor (pierwsza strona):**
- Problem: Może być wolniejsze przy dużej liczbie rekordów
- Mitigacja: Index scan od końca (DESC order)
- RLS ogranicza zakres do jednego użytkownika

### 8.3 Metryki do monitorowania

**Query performance:**
- P50, P95, P99 response time
- Liczba query per minute
- Slow query threshold: > 500ms

**Database:**
- Index hit ratio (powinien być > 95%)
- Query execution time z `pg_stat_statements`
- Locks i wait events

**Application:**
- Error rate (target < 1%)
- 400 rate (może wskazywać na problemy z clientem)
- Cursor decode failures

## 9. Etapy wdrożenia

### Krok 1: Utworzenie schematu walidacji

**Lokalizacja:** `src/lib/schemas/audit-log.schema.ts`

**Zadania:**
- Utworzyć nowy plik schematu
- Zdefiniować `AuditLogQueryParamsSchema` używając Zod
- Walidować wszystkie query params zgodnie ze specyfikacją
- Wyeksportować typ `AuditLogQueryParams`

**Walidacje:**
```typescript
import { z } from "zod";

export const AuditLogQueryParamsSchema = z.object({
  entity_type: z.enum(["transaction", "goal", "goal_event"]).optional(),
  entity_id: z.string().uuid().optional(),
  action: z.enum(["CREATE", "UPDATE", "DELETE"]).optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type AuditLogQueryParams = z.infer<typeof AuditLogQueryParamsSchema>;
```

**Testy:**
- Valid params z wszystkimi filtrami
- Valid params bez filtrów
- Invalid UUID w entity_id
- Limit poza zakresem (0, 101)
- Invalid enum values

### Krok 2: Utworzenie serwisu audit-log

**Lokalizacja:** `src/lib/services/audit-log.service.ts`

**Zadania:**
- Utworzyć klasę lub obiekt `AuditLogService`
- Zaimplementować metodę `list()` przyjmującą Supabase client i params
- Obsługiwać dekodowanie i walidację cursora
- Budować zapytanie z dynamicznymi filtrami
- Generować next_cursor dla paginacji
- Mapować wyniki do `AuditLogEntryDTO[]`

**Struktura serwisu:**
```typescript
import type { SupabaseClient } from "@/db/supabase.client";
import type { AuditLogQueryParams } from "@/lib/schemas/audit-log.schema";
import type { AuditLogListResponseDTO, AuditLogEntryDTO } from "@/types";

export class CursorDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CursorDecodeError";
  }
}

interface DecodedCursor {
  performed_at: string;
  id: string;
}

export const AuditLogService = {
  /**
   * List audit log entries with filtering and pagination
   */
  async list(
    supabase: SupabaseClient,
    params: AuditLogQueryParams
  ): Promise<AuditLogListResponseDTO> {
    const { entity_type, entity_id, action, from_date, to_date, cursor, limit } = params;

    // Decode cursor if provided
    let decodedCursor: DecodedCursor | null = null;
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, "base64").toString("utf-8");
        decodedCursor = JSON.parse(decoded);
        
        // Validate cursor structure
        if (!decodedCursor?.performed_at || !decodedCursor?.id) {
          throw new Error("Invalid cursor structure");
        }
      } catch (error) {
        throw new CursorDecodeError("Failed to decode pagination cursor");
      }
    }

    // Build query
    let query = supabase
      .from("audit_log")
      .select("id, entity_type, entity_id, action, before, after, performed_at");

    // Apply filters
    if (entity_type) {
      query = query.eq("entity_type", entity_type);
    }
    if (entity_id) {
      query = query.eq("entity_id", entity_id);
    }
    if (action) {
      query = query.eq("action", action);
    }
    if (from_date) {
      query = query.gte("performed_at", from_date);
    }
    if (to_date) {
      query = query.lte("performed_at", to_date);
    }

    // Apply cursor pagination
    if (decodedCursor) {
      query = query.or(
        `performed_at.lt.${decodedCursor.performed_at},and(performed_at.eq.${decodedCursor.performed_at},id.lt.${decodedCursor.id})`
      );
    }

    // Order and limit
    query = query
      .order("performed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1); // Fetch one extra to check has_more

    // Execute query
    const { data, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // Determine pagination
    const has_more = data.length > limit;
    const results = has_more ? data.slice(0, limit) : data;

    // Generate next cursor
    let next_cursor: string | null = null;
    if (has_more && results.length > 0) {
      const lastItem = results[results.length - 1];
      const cursorObj = {
        performed_at: lastItem.performed_at,
        id: lastItem.id,
      };
      next_cursor = Buffer.from(JSON.stringify(cursorObj)).toString("base64");
    }

    // Map to DTOs
    const entries: AuditLogEntryDTO[] = results.map((row) => ({
      id: row.id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action: row.action,
      before: row.before,
      after: row.after,
      performed_at: row.performed_at,
    }));

    return {
      data: entries,
      pagination: {
        next_cursor,
        has_more,
        limit,
      },
    };
  },
};
```

**Testy:**
- List bez filtrów (pierwsza strona)
- List z filtrami (entity_type, action)
- List z zakresem dat
- Paginacja (next page z cursor)
- Dekodowanie nieprawidłowego cursora (powinien rzucić CursorDecodeError)
- Pusta lista wyników

### Krok 3: Utworzenie API route

**Lokalizacja:** `src/pages/api/v1/audit-log/index.ts`

**Zadania:**
- Utworzyć Astro API route z eksportem `GET`
- Dodać `export const prerender = false`
- Zaimplementować walidację query params
- Sprawdzić uwierzytelnianie i weryfikację email
- Wywołać `AuditLogService.list()`
- Obsłużyć wszystkie scenariusze błędów
- Zwrócić odpowiedź z odpowiednimi headerami

**Implementacja:**
```typescript
import type { APIRoute } from "astro";
import { AuditLogQueryParamsSchema } from "@/lib/schemas/audit-log.schema";
import { AuditLogService, CursorDecodeError } from "@/lib/services/audit-log.service";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    // 1. Get Supabase client from context
    const supabase = context.locals.supabase;
    if (!supabase) {
      return new Response(
        JSON.stringify({
          error: "INTERNAL_SERVER_ERROR",
          message: "Supabase client not available",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Validate query parameters
    const params = AuditLogQueryParamsSchema.safeParse(
      Object.fromEntries(context.url.searchParams)
    );

    if (!params.success) {
      return new Response(
        JSON.stringify({
          error: "VALIDATION_ERROR",
          message: "Invalid query parameters",
          details: params.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({
          error: "UNAUTHORIZED",
          message: "Authentication required",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Check email verification
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email_confirmed")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile?.email_confirmed) {
      return new Response(
        JSON.stringify({
          error: "EMAIL_NOT_VERIFIED",
          message: "Email verification required to access this resource",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5. Call service to get audit log entries
    const result = await AuditLogService.list(supabase, params.data);

    // 6. Return success response
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Handle cursor decode errors
    if (error instanceof CursorDecodeError) {
      return new Response(
        JSON.stringify({
          error: "INVALID_CURSOR",
          message: "Invalid pagination cursor",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log unexpected errors
    console.error("Error in GET /api/v1/audit-log:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Generic server error
    return new Response(
      JSON.stringify({
        error: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
```

**Testy:**
- 200: Pomyślne pobranie listy
- 400: Nieprawidłowe parametry (zły UUID, limit > 100)
- 400: Nieprawidłowy cursor
- 401: Brak tokena auth
- 401: Niezweryfikowany email
- 500: Błąd bazy danych (mock)

### Krok 4: Testowanie integracyjne

**Scenariusze do przetestowania:**

1. **Happy path - lista bez filtrów:**
   - Request: `GET /api/v1/audit-log`
   - Expected: 200 OK, lista do 50 rekordów

2. **Filtrowanie po typie encji:**
   - Request: `GET /api/v1/audit-log?entity_type=transaction`
   - Expected: 200 OK, tylko rekordy typu transaction

3. **Filtrowanie po akcji:**
   - Request: `GET /api/v1/audit-log?action=UPDATE`
   - Expected: 200 OK, tylko rekordy UPDATE

4. **Filtrowanie po zakresie dat:**
   - Request: `GET /api/v1/audit-log?from_date=2025-01-01T00:00:00Z&to_date=2025-01-31T23:59:59Z`
   - Expected: 200 OK, tylko rekordy z stycznia 2025

5. **Paginacja:**
   - Request 1: `GET /api/v1/audit-log?limit=10`
   - Expected: 200 OK, 10 rekordów, cursor w pagination
   - Request 2: `GET /api/v1/audit-log?limit=10&cursor={cursor_from_request_1}`
   - Expected: 200 OK, kolejne 10 rekordów

6. **Kombinacja filtrów:**
   - Request: `GET /api/v1/audit-log?entity_type=goal&action=CREATE&limit=5`
   - Expected: 200 OK, tylko CREATE dla goal, max 5 rekordów

7. **Nieprawidłowy limit:**
   - Request: `GET /api/v1/audit-log?limit=200`
   - Expected: 400 Bad Request

8. **Nieprawidłowy UUID:**
   - Request: `GET /api/v1/audit-log?entity_id=invalid-uuid`
   - Expected: 400 Bad Request

9. **Niezalogowany użytkownik:**
   - Request: `GET /api/v1/audit-log` (bez tokena)
   - Expected: 401 Unauthorized

10. **Niezweryfikowany email:**
    - Request: `GET /api/v1/audit-log` (user z email_confirmed=false)
    - Expected: 401 Unauthorized

### Krok 5: Weryfikacja RLS i bezpieczeństwa

**Testy bezpieczeństwa:**

1. **RLS - izolacja danych użytkowników:**
   - Utworzyć 2 użytkowników (User A, User B)
   - User A wykonuje akcje generujące audit log
   - User B próbuje pobrać audit log
   - Expected: User B widzi tylko swoje rekordy (pusta lista jeśli nie ma)

2. **Cursor manipulation:**
   - User A uzyskuje cursor ze swojego zapytania
   - User A modyfikuje cursor próbując dostać się do danych User B
   - Expected: RLS filtruje wyniki, User A nadal widzi tylko swoje dane

3. **Entity_id enumeration:**
   - User A próbuje różne UUID w entity_id
   - Expected: Zwraca puste wyniki dla cudzych entity_id bez ujawniania istnienia

4. **Email verification bypass attempt:**
   - User z email_confirmed=false próbuje różne kombinacje tokenów
   - Expected: 401 dla wszystkich prób

**Weryfikacja indeksów:**
- Sprawdzić EXPLAIN ANALYZE dla głównych queries
- Potwierdzić użycie indeksów `idx_al_owner_time` i `idx_al_owner_entity`
- Index scan (nie Seq Scan) dla queries z filtrami

### Krok 6: Monitoring i logowanie

**Metryki do zbierania:**
- Response time (P50, P95, P99)
- Error rate per endpoint
- 400/401/500 breakdown
- Queries per minute
- Cursor decode failures

**Logi do implementacji:**
- Error logs: wszystkie 500 z context
- Info logs: slow queries > 500ms (opcjonalne)
- Nie logować: 401 (standardowe security events)

**Dashboardy (przyszłość):**
- Grafana/CloudWatch z alertami dla:
  - Error rate > 1%
  - P95 latency > 1s
  - 500 errors spike

### Krok 7: Dokumentacja

**Aktualizacje dokumentacji:**

1. **API documentation:**
   - Dodać przykłady request/response do api-plan.md
   - Dokumentować wszystkie error codes
   - Przykłady curl commands

2. **Code comments:**
   - JSDoc dla funkcji serwisu
   - Komentarze dla skomplikowanych części (cursor logic)
   - Examples w komentarzach

3. **README updates:**
   - Dodać info o audit log do głównego README (jeśli istnieje)
   - Link do api-plan.md

### Krok 8: Code review checklist

**Przed PR:**
- [ ] Wszystkie testy przechodzą
- [ ] Kod zgodny z coding style (double quotes, semicolons)
- [ ] Brak linter errors
- [ ] Error handling dla wszystkich edge cases
- [ ] RLS policies zweryfikowane
- [ ] Indeksy używane przez queries
- [ ] Security considerations addressed
- [ ] JSDoc comments dla public APIs
- [ ] Integration tests passed
- [ ] Manual testing completed

**Review focuses:**
- Security: RLS, auth checks, input validation
- Performance: index usage, query efficiency
- Error handling: all scenarios covered
- Code quality: readability, maintainability
- Testing: coverage, edge cases

---

## 10. Dodatkowe uwagi

### 10.1 Retencja 30 dni

Endpoint automatycznie będzie widział tylko rekordy z ostatnich 30 dni dzięki jobowi czyszczącemu (scheduled przez GitHub Actions lub Supabase Functions). Nie wymaga dodatkowej logiki w endpoincie.

### 10.2 Przyszłe usprawnienia

**Możliwe optymalizacje:**
- Cache dla często używanych queries (Redis)
- GraphQL subscription dla real-time updates
- Bulk export do CSV/JSON
- Advanced search po JSONB fields (GIN indexes)

**Nowe funkcjonalności:**
- Filtrowanie po actor_user_id (kto wykonał akcję)
- Rollback functionality (restore from before state)
- Diff view między before/after

### 10.3 Zależności

**Przed rozpoczęciem implementacji:**
- Tabela `audit_log` musi istnieć w bazie
- Triggery dla INSERT do audit_log muszą być skonfigurowane
- RLS policies muszą być utworzone
- Indeksy muszą być utworzone (`idx_al_owner_time`, `idx_al_owner_entity`)
- Tabela `profiles` z kolumną `email_confirmed`

**Pakiety npm:**
- `zod` - do walidacji
- `@supabase/supabase-js` - client
- Buffer (Node.js built-in) - do Base64 encoding/decoding

