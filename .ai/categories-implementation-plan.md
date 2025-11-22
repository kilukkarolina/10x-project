# API Endpoint Implementation Plan: GET /api/v1/categories

## 1. Przegląd punktu końcowego

Endpoint `GET /api/v1/categories` służy do pobrania listy aktywnych kategorii transakcji. Jest to zasób tylko do odczytu (słownik globalny), który umożliwia użytkownikom wyświetlenie dostępnych kategorii przy tworzeniu lub edycji transakcji.

**Funkcjonalność:**
- Zwraca wszystkie aktywne kategorie transakcji (`is_active = true`)
- Umożliwia opcjonalne filtrowanie po typie (INCOME/EXPENSE)
- Nie wymaga paginacji (ograniczona liczba rekordów - słownik)
- Wymagana autoryzacja JWT

**Tabela bazodanowa:** `transaction_categories`

**Typ operacji:** Read-only (GET)

---

## 2. Szczegóły żądania

### Metoda HTTP
`GET`

### Struktura URL
```
/api/v1/categories
```

### Parametry

**Wymagane:**
- Brak

**Opcjonalne:**
- `kind` (string) - Filtr po rodzaju kategorii
  - Dozwolone wartości: `"INCOME"`, `"EXPENSE"`
  - Brak wartości = zwróć wszystkie kategorie

**Headers:**
- `Authorization: Bearer <jwt_token>` (wymagany)

**Przykłady zapytań:**
```
GET /api/v1/categories
GET /api/v1/categories?kind=EXPENSE
GET /api/v1/categories?kind=INCOME
```

**Request Body:**
- Brak (metoda GET)

---

## 3. Wykorzystywane typy

### DTOs (z `src/types.ts`)

**TransactionCategoryDTO:**
```typescript
type TransactionCategoryDTO = Pick<
  TransactionCategoryEntity,
  "code" | "kind" | "label_pl" | "is_active"
>;
```

**TransactionCategoryListResponseDTO:**
```typescript
interface TransactionCategoryListResponseDTO {
  data: TransactionCategoryDTO[];
}
```

**ErrorResponseDTO:**
```typescript
interface ErrorResponseDTO {
  error: string;
  message: string;
  details?: Record<string, string>;
  retry_after_seconds?: number;
}
```

### Nowe schematy walidacji (do utworzenia)

**Plik:** `src/lib/schemas/transaction-category.schema.ts`

```typescript
import { z } from "zod";

/**
 * Schema for GET /api/v1/categories query parameters
 */
export const getCategoriesQuerySchema = z.object({
  kind: z.enum(["INCOME", "EXPENSE"]).optional(),
});

export type GetCategoriesQuery = z.infer<typeof getCategoriesQuerySchema>;
```

---

## 4. Szczegóły odpowiedzi

### Success Response (200 OK)

**Format:**
```json
{
  "data": [
    {
      "code": "GROCERIES",
      "kind": "EXPENSE",
      "label_pl": "Zakupy spożywcze",
      "is_active": true
    },
    {
      "code": "SALARY",
      "kind": "INCOME",
      "label_pl": "Wynagrodzenie",
      "is_active": true
    }
  ]
}
```

**Struktura:**
- `data` (array) - Lista kategorii transakcji
  - `code` (string) - Unikalny kod kategorii (PK)
  - `kind` (string) - Typ: "INCOME" lub "EXPENSE"
  - `label_pl` (string) - Polska etykieta do wyświetlenia
  - `is_active` (boolean) - Czy kategoria jest aktywna

**Sortowanie:**
- Alfabetycznie po `label_pl` (rosnąco)

### Error Responses

**400 Bad Request** - Nieprawidłowe parametry
```json
{
  "error": "validation_error",
  "message": "Nieprawidłowe parametry zapytania",
  "details": {
    "kind": "Wartość musi być 'INCOME' lub 'EXPENSE'"
  }
}
```

**401 Unauthorized** - Brak lub nieprawidłowa autoryzacja
```json
{
  "error": "unauthorized",
  "message": "Brak autoryzacji. Zaloguj się ponownie."
}
```

**500 Internal Server Error** - Błąd serwera
```json
{
  "error": "internal_error",
  "message": "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później."
}
```

---

## 5. Przepływ danych

### Diagram przepływu:

```
1. Klient → GET /api/v1/categories?kind=EXPENSE
                ↓
2. Astro API route (/api/v1/categories/index.ts)
                ↓
3. Walidacja JWT (middleware) → sprawdzenie auth.uid()
                ↓
4. Walidacja query params (Zod schema)
                ↓
5. TransactionCategoryService.getActiveCategories(supabase, kind)
                ↓
6. Supabase query:
   SELECT code, kind, label_pl, is_active
   FROM transaction_categories
   WHERE is_active = true
   [AND kind = $1]  -- jeśli kind podany
   ORDER BY label_pl ASC
                ↓
7. Mapowanie do TransactionCategoryDTO[]
                ↓
8. Response 200 OK + TransactionCategoryListResponseDTO
```

### Szczegóły zapytania bazodanowego:

**Tabela:** `transaction_categories`

**Kolumny zwracane:**
- `code` (text, PK)
- `kind` (text, CHECK: INCOME|EXPENSE)
- `label_pl` (text)
- `is_active` (boolean)

**Warunki WHERE:**
- `is_active = true` (zawsze)
- `kind = :kind` (opcjonalnie, jeśli parametr podany)

**Indeksy wykorzystywane:**
- PK: `transaction_categories_pkey(code)`
- Opcjonalnie: `idx_tc_kind_active(kind) WHERE is_active`

**Polityki RLS:**
- `SELECT: USING (true)` - publiczny odczyt dla uwierzytelnionych użytkowników

---

## 6. Względy bezpieczeństwa

### 6.1 Autoryzacja i uwierzytelnianie

**JWT Token:**
- Wymagany header: `Authorization: Bearer <token>`
- Sprawdzenie przez middleware Astro (`context.locals.supabase`)
- Weryfikacja `auth.uid()` istnieje

**Polityka RLS:**
- Tabela `transaction_categories` ma politykę `SELECT: USING (true)`
- Dostęp dla wszystkich uwierzytelnionych użytkowników (słownik globalny)

### 6.2 Walidacja wejścia

**Query parameters:**
- Walidacja przez Zod schema: `getCategoriesQuerySchema`
- Parametr `kind` ograniczony do enum: `["INCOME", "EXPENSE"]`
- Inne wartości = błąd 400

**Zabezpieczenia:**
- SQL Injection: chronione przez Supabase client (parametryzowane zapytania)
- XSS: Brak możliwości (endpoint zwraca tylko dane ze słownika)

### 6.3 Rate limiting

**Nie wymagane dla tego endpointa:**
- Endpoint read-only
- Niskokosztowa operacja
- Ograniczona liczba rekordów (słownik)
- Brak wpływu na stan systemu

### 6.4 Wrażliwe dane

**Brak danych wrażliwych:**
- Endpoint zwraca tylko publiczny słownik kategorii
- Brak informacji o użytkowniku
- Brak danych finansowych

---

## 7. Obsługa błędów

### 7.1 Błędy walidacji (400)

**Przyczyny:**
- Nieprawidłowa wartość parametru `kind`

**Przykład:**
```typescript
// Request: GET /api/v1/categories?kind=INVALID

// Response: 400 Bad Request
{
  "error": "validation_error",
  "message": "Nieprawidłowe parametry zapytania",
  "details": {
    "kind": "Wartość musi być 'INCOME' lub 'EXPENSE'"
  }
}
```

**Obsługa:**
- Walidacja przez Zod przed wywołaniem service
- Zwróć szczegóły błędu walidacji w polu `details`
- Log błędu walidacji (level: warn)

### 7.2 Błędy autoryzacji (401)

**Przyczyny:**
- Brak tokenu JWT
- Token wygasły
- Token nieprawidłowy

**Przykład:**
```typescript
// Response: 401 Unauthorized
{
  "error": "unauthorized",
  "message": "Brak autoryzacji. Zaloguj się ponownie."
}
```

**Obsługa:**
- Sprawdzenie `context.locals.supabase.auth.getUser()`
- Jeśli błąd autoryzacji = 401
- Log próby dostępu (level: warn)

### 7.3 Błędy bazodanowe (500)

**Przyczyny:**
- Błąd połączenia z Supabase
- Timeout zapytania
- Nieoczekiwany błąd PostgreSQL

**Przykład:**
```typescript
// Response: 500 Internal Server Error
{
  "error": "internal_error",
  "message": "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później."
}
```

**Obsługa:**
- Try-catch w service
- Log pełnego błędu (level: error) z stack trace
- Zwróć ogólny komunikat (nie ujawniaj szczegółów DB)

### 7.4 Scenariusze edge case

**Pusta lista kategorii:**
- Zwróć 200 OK z pustą tablicą `data: []`
- Nie jest to błąd (może wystąpić w testach)

**Brak aktywnych kategorii dla danego `kind`:**
- Zwróć 200 OK z pustą tablicą `data: []`
- To prawidłowy stan (nie błąd)

---

## 8. Rozważania dotyczące wydajności

### 8.1 Optymalizacje zapytań

**Indeksy:**
- PK na `code` (automatyczny)
- Opcjonalny: `idx_tc_kind_active(kind) WHERE is_active`

**Query plan:**
- Index scan na PK lub częściowym indeksie
- Filtr `is_active = true` = częściowy indeks
- Sort po `label_pl` = niewielki koszt (mała tabela)

**Szacowany czas:**
- < 10ms (słownik ~20-50 rekordów)

### 8.2 Caching

**Strategia cachowania:**
- Odpowiedź może być cachowana przez klienta
- Cache-Control header: `public, max-age=3600` (1 godzina)
- Słownik rzadko się zmienia (aktualizacje przez admina)

**Implementacja (opcjonalna dla MVP):**
```typescript
// W route handler
return new Response(JSON.stringify(response), {
  status: 200,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=3600",
  },
});
```

### 8.3 Potencjalne wąskie gardła

**Brak zidentyfikowanych bottleneck:**
- Tabela mała (~20-50 rekordów)
- Query prosty (SELECT + WHERE + ORDER BY)
- Brak JOIN-ów
- Brak agregacji

**Monitoring:**
- Loguj czas wykonania query (jeśli > 100ms)
- Alert jeśli średni czas > 50ms

---

## 9. Kroki implementacji

### Krok 1: Utworzenie Zod schema dla walidacji

**Plik:** `src/lib/schemas/transaction-category.schema.ts`

```typescript
import { z } from "zod";

/**
 * Schema for GET /api/v1/categories query parameters
 * Validates optional 'kind' filter
 */
export const getCategoriesQuerySchema = z.object({
  kind: z.enum(["INCOME", "EXPENSE"], {
    errorMap: () => ({ message: "Wartość musi być 'INCOME' lub 'EXPENSE'" }),
  }).optional(),
});

export type GetCategoriesQuery = z.infer<typeof getCategoriesQuerySchema>;
```

**Testy jednostkowe (opcjonalne):**
- Test poprawnej walidacji: `kind=INCOME`, `kind=EXPENSE`, brak `kind`
- Test błędnej walidacji: `kind=INVALID`, `kind=123`

---

### Krok 2: Utworzenie service dla kategorii transakcji

**Plik:** `src/lib/services/transaction-category.service.ts`

```typescript
import type { SupabaseClient } from "@/db/supabase.client";
import type { TransactionCategoryDTO } from "@/types";

/**
 * Get active transaction categories with optional filtering by kind
 * 
 * @param supabase - Supabase client from context.locals
 * @param kind - Optional filter: "INCOME" or "EXPENSE"
 * @returns List of active transaction categories sorted by label_pl
 * @throws Error if database query fails
 */
export async function getActiveCategories(
  supabase: SupabaseClient,
  kind?: "INCOME" | "EXPENSE"
): Promise<TransactionCategoryDTO[]> {
  // Build query
  let query = supabase
    .from("transaction_categories")
    .select("code, kind, label_pl, is_active")
    .eq("is_active", true);

  // Apply optional kind filter
  if (kind) {
    query = query.eq("kind", kind);
  }

  // Execute query with sorting
  const { data, error } = await query.order("label_pl", { ascending: true });

  // Handle database errors
  if (error) {
    console.error("[getActiveCategories] Database error:", error);
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  // Map to DTO (already matches TransactionCategoryDTO structure)
  return data;
}
```

**Testy jednostkowe (opcjonalne):**
- Mock Supabase client
- Test bez filtra `kind`
- Test z `kind=INCOME`
- Test z `kind=EXPENSE`
- Test obsługi błędu bazodanowego

---

### Krok 3: Utworzenie Astro API route

**Plik:** `src/pages/api/v1/categories/index.ts`

```typescript
import type { APIRoute } from "astro";
import { getCategoriesQuerySchema } from "@/lib/schemas/transaction-category.schema";
import { getActiveCategories } from "@/lib/services/transaction-category.service";
import type { TransactionCategoryListResponseDTO, ErrorResponseDTO } from "@/types";

// Disable prerendering for API routes
export const prerender = false;

/**
 * GET /api/v1/categories
 * List all active transaction categories with optional kind filter
 */
export const GET: APIRoute = async ({ request, locals }) => {
  try {
    // 1. Check authentication
    const { data: { user }, error: authError } = await locals.supabase.auth.getUser();

    if (authError || !user) {
      const errorResponse: ErrorResponseDTO = {
        error: "unauthorized",
        message: "Brak autoryzacji. Zaloguj się ponownie.",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Parse and validate query parameters
    const url = new URL(request.url);
    const queryParams = {
      kind: url.searchParams.get("kind") ?? undefined,
    };

    const validation = getCategoriesQuerySchema.safeParse(queryParams);

    if (!validation.success) {
      const errorResponse: ErrorResponseDTO = {
        error: "validation_error",
        message: "Nieprawidłowe parametry zapytania",
        details: validation.error.flatten().fieldErrors as Record<string, string>,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Fetch categories from service
    const { kind } = validation.data;
    const categories = await getActiveCategories(locals.supabase, kind);

    // 4. Build and return success response
    const response: TransactionCategoryListResponseDTO = {
      data: categories,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });

  } catch (error) {
    // 5. Handle unexpected errors
    console.error("[GET /api/v1/categories] Unexpected error:", error);
    
    const errorResponse: ErrorResponseDTO = {
      error: "internal_error",
      message: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.",
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
```

**Kluczowe elementy:**
- `export const prerender = false` - wymaga SSR dla API route
- Autoryzacja przez `locals.supabase.auth.getUser()`
- Walidacja przez Zod schema
- Wywołanie service z `locals.supabase`
- Obsługa wszystkich scenariuszy błędów
- Cache-Control header dla optymalizacji

---

### Krok 4: Testowanie manualne

**Przygotowanie:**
- Uruchom projekt: `npm run dev`
- Uzyskaj JWT token (zaloguj się przez frontend lub Postmark)

**Test case 1: Lista wszystkich kategorii**
```bash
curl -X GET "http://localhost:4321/api/v1/categories" \
  -H "Authorization: Bearer <JWT_TOKEN>"

# Oczekiwany wynik: 200 OK + wszystkie aktywne kategorie
```

**Test case 2: Filtrowanie po EXPENSE**
```bash
curl -X GET "http://localhost:4321/api/v1/categories?kind=EXPENSE" \
  -H "Authorization: Bearer <JWT_TOKEN>"

# Oczekiwany wynik: 200 OK + tylko kategorie EXPENSE
```

**Test case 3: Filtrowanie po INCOME**
```bash
curl -X GET "http://localhost:4321/api/v1/categories?kind=INCOME" \
  -H "Authorization: Bearer <JWT_TOKEN>"

# Oczekiwany wynik: 200 OK + tylko kategorie INCOME
```

**Test case 4: Nieprawidłowy kind**
```bash
curl -X GET "http://localhost:4321/api/v1/categories?kind=INVALID" \
  -H "Authorization: Bearer <JWT_TOKEN>"

# Oczekiwany wynik: 400 Bad Request + validation error
```

**Test case 5: Brak autoryzacji**
```bash
curl -X GET "http://localhost:4321/api/v1/categories"

# Oczekiwany wynik: 401 Unauthorized
```

---

### Krok 5: Weryfikacja w bazie danych

**Sprawdzenie danych testowych:**
```sql
-- Sprawdź czy istnieją aktywne kategorie
SELECT code, kind, label_pl, is_active
FROM transaction_categories
WHERE is_active = true
ORDER BY label_pl;

-- Sprawdź podział po typach
SELECT kind, COUNT(*) as count
FROM transaction_categories
WHERE is_active = true
GROUP BY kind;
```

**Jeśli brak danych testowych, dodaj:**
```sql
INSERT INTO transaction_categories (code, kind, label_pl, is_active) VALUES
  ('SALARY', 'INCOME', 'Wynagrodzenie', true),
  ('GROCERIES', 'EXPENSE', 'Zakupy spożywcze', true),
  ('TRANSPORT', 'EXPENSE', 'Transport', true);
```

---

### Krok 6: Sprawdzenie linterów i formatowania

```bash
# Uruchom linter
npm run lint

# Napraw automatycznie formatowanie
npm run format

# Sprawdź TypeScript errors
npx tsc --noEmit
```

**Sprawdź:**
- Brak błędów TypeScript
- Wszystkie stringi w double quotes (`"`)
- Średniki na końcu każdej linii
- Brak nieużywanych importów

---

### Krok 7: Dokumentacja i cleanup

**Dodaj komentarze JSDoc:**
- Nad funkcją service
- Nad schematem Zod
- Nad route handlerem

**Sprawdź zgodność z regułami:**
- ✅ Double quotes dla stringów
- ✅ Semicolons
- ✅ Error handling na początku funkcji
- ✅ Early returns
- ✅ Supabase client z `locals.supabase`
- ✅ Walidacja przez Zod
- ✅ Logika w service
- ✅ `export const prerender = false`

---

## 10. Checklist implementacji

### Przed rozpoczęciem:
- [ ] Przeczytaj cały plan implementacji
- [ ] Zrozum strukturę projektu
- [ ] Sprawdź dostępność bazy danych (Supabase)
- [ ] Przygotuj środowisko testowe

### Implementacja:
- [ ] Utwórz `src/lib/schemas/transaction-category.schema.ts`
- [ ] Utwórz `src/lib/services/transaction-category.service.ts`
- [ ] Utwórz `src/pages/api/v1/categories/index.ts`
- [ ] Dodaj dane testowe do bazy (jeśli potrzebne)

### Testowanie:
- [ ] Test: Lista wszystkich kategorii (200 OK)
- [ ] Test: Filtr `kind=EXPENSE` (200 OK)
- [ ] Test: Filtr `kind=INCOME` (200 OK)
- [ ] Test: Nieprawidłowy `kind` (400 Bad Request)
- [ ] Test: Brak autoryzacji (401 Unauthorized)
- [ ] Test: Sortowanie alfabetyczne po `label_pl`

### Jakość kodu:
- [ ] Uruchom `npm run lint` (brak błędów)
- [ ] Uruchom `npx tsc --noEmit` (brak błędów TypeScript)
- [ ] Sprawdź code style (double quotes, semicolons)
- [ ] Dodaj JSDoc comments
- [ ] Sprawdź error handling

### Weryfikacja zgodności:
- [ ] Zgodność z `api-plan.md`
- [ ] Zgodność z `db-plan.md`
- [ ] Zgodność z `types.ts`
- [ ] Zgodność z cursor rules (coding practices)

### Dokumentacja:
- [ ] Zaktualizuj README (jeśli potrzebne)
- [ ] Dodaj przykłady użycia w komentarzach
- [ ] Sprawdź kompletność JSDoc

---

## 11. Potencjalne problemy i rozwiązania

### Problem 1: Brak danych w bazie

**Symptom:**
- Endpoint zwraca pustą tablicę `data: []`

**Diagnoza:**
```sql
SELECT * FROM transaction_categories WHERE is_active = true;
```

**Rozwiązanie:**
- Dodaj dane testowe (seed) do bazy
- Sprawdź czy migracje zostały uruchomione
- Sprawdź wartość `is_active`

### Problem 2: RLS blokuje dostęp

**Symptom:**
- Endpoint zwraca puste dane pomimo istniejących rekordów w bazie

**Diagnoza:**
```sql
-- Sprawdź polityki RLS
SELECT * FROM pg_policies 
WHERE tablename = 'transaction_categories';
```

**Rozwiązanie:**
- Upewnij się że polityka SELECT: `USING (true)` istnieje
- Sprawdź czy użytkownik jest uwierzytelniony
- Sprawdź logi Supabase

### Problem 3: Błąd autoryzacji mimo prawidłowego tokenu

**Symptom:**
- 401 Unauthorized pomimo poprawnego JWT

**Diagnoza:**
- Sprawdź `locals.supabase.auth.getUser()`
- Sprawdź czy token nie wygasł
- Sprawdź konfigurację middleware

**Rozwiązanie:**
- Odśwież token
- Sprawdź konfigurację Supabase w `src/middleware/index.ts`
- Sprawdź czy middleware jest włączony

### Problem 4: TypeScript errors

**Symptom:**
- Błędy kompilacji TypeScript

**Diagnoza:**
```bash
npx tsc --noEmit
```

**Rozwiązanie:**
- Sprawdź import typów z `@/types`
- Sprawdź import `SupabaseClient` z `@/db/supabase.client`
- Sprawdź zgodność z `database.types.ts`

---

## 12. Metryki sukcesu

### Wydajność:
- [ ] Czas odpowiedzi < 100ms (p95)
- [ ] Czas odpowiedzi < 50ms (p50)
- [ ] Brak timeoutów

### Funkcjonalność:
- [ ] Wszystkie testy przechodzą
- [ ] Filtrowanie działa poprawnie
- [ ] Sortowanie alfabetyczne działa

### Jakość:
- [ ] Brak błędów linter
- [ ] Brak błędów TypeScript
- [ ] Code coverage > 80% (jeśli testy jednostkowe)

### Bezpieczeństwo:
- [ ] Autoryzacja wymuszana
- [ ] Walidacja inputu działa
- [ ] Brak SQL injection
- [ ] Brak ujawniania wrażliwych danych

---

## 13. Następne kroki po implementacji

1. **Integracja z frontendem:**
   - Dodaj hook do pobierania kategorii
   - Użyj w formularzu tworzenia transakcji
   - Dodaj cache po stronie klienta

2. **Monitoring:**
   - Dodaj metryki czasu odpowiedzi
   - Monitoruj błędy 500
   - Śledź popularność filtrów

3. **Optymalizacje (opcjonalne):**
   - Dodaj server-side caching (Redis)
   - Rozważ cache w Edge (Cloudflare)
   - Pre-fetch na froncie przy zalogowaniu

4. **Dokumentacja API:**
   - Dodaj do Swagger/OpenAPI (jeśli używane)
   - Zaktualizuj dokumentację dla frontend devs
   - Dodaj przykłady w Postman collection

---

## Podsumowanie

Endpoint `GET /api/v1/categories` jest prostym, read-only endpointem do pobierania słownika kategorii transakcji. Implementacja składa się z trzech głównych plików:

1. **Schema** (`transaction-category.schema.ts`) - walidacja query params
2. **Service** (`transaction-category.service.ts`) - logika biznesowa
3. **Route** (`categories/index.ts`) - handler HTTP

Kluczowe jest:
- Prawidłowa walidacja przez Zod
- Obsługa autoryzacji
- Wyodrębnienie logiki do service
- Kompletna obsługa błędów
- Zgodność z coding practices (double quotes, semicolons)

Estimated implementation time: **2-3 godziny** (włącznie z testami)

