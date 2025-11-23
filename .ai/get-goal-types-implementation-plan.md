# API Endpoint Implementation Plan: GET /api/v1/goal-types

## 1. Przegląd punktu końcowego

**Cel**: Pobranie listy wszystkich aktywnych typów celów oszczędnościowych dostępnych w systemie.

**Funkcjonalność**:
- Zwraca globalny słownik typów celów (np. "Samochód", "Wakacje", "Fundusz awaryjny")
- Filtruje tylko aktywne typy (`is_active = true`)
- Sortuje alfabetycznie według polskiej etykiety (`label_pl`)
- Nie wymaga autentykacji - publiczny słownik dostępny dla wszystkich użytkowników
- Odpowiedź jest cache'owana przez 1 godzinę dla wydajności

**Kontekst biznesowy**:
- Endpoint używany przy tworzeniu nowego celu przez użytkownika (lista wyboru typu celu)
- Używany również w filtrach i kategoryzacji celów w UI
- Słownik jest zarządzany centralnie (tylko przez service role), klienci mają dostęp tylko do odczytu
- Typy celów są stosunkowo statyczne (rzadko dodawane/modyfikowane), więc agresywne cache'owanie jest bezpieczne

**RLS (Row Level Security)**:
- Tabela `goal_types` ma włączony RLS
- Polityki pozwalają na publiczny odczyt zarówno dla zalogowanych, jak i niezalogowanych użytkowników
- Zapisy/modyfikacje tylko przez service role (nie dostępne przez API)

---

## 2. Szczegóły żądania

### Metoda HTTP
`GET`

### Struktura URL
```
/api/v1/goal-types
```

### Parametry

#### Query Parameters
Brak - endpoint nie przyjmuje żadnych parametrów filtrujących.

**Uwaga**: W przyszłości można rozważyć dodanie parametru `include_inactive=true` dla celów administracyjnych, ale nie jest to wymagane w MVP.

#### Headers
```http
Content-Type: application/json
```

**Uwaga dotycząca autentykacji**: 
- Authorization header jest opcjonalny - endpoint działa zarówno dla zalogowanych, jak i niezalogowanych użytkowników
- RLS pozwala na publiczny odczyt tabeli `goal_types`
- Nie ma potrzeby weryfikacji użytkownika (publiczny słownik)

#### Request Body
Brak (metoda GET nie przyjmuje body).

---

## 3. Wykorzystywane typy

### DTOs (już zdefiniowane w `src/types.ts`)

**GoalTypeDTO** - pojedynczy typ celu w odpowiedzi:
```typescript
export type GoalTypeDTO = Pick<GoalTypeEntity, "code" | "label_pl" | "is_active">;
```

Struktura:
- `code` (string) - unikalny kod typu celu, np. "AUTO", "VACATION"
- `label_pl` (string) - polska etykieta do wyświetlenia w UI, np. "Samochód", "Wakacje"
- `is_active` (boolean) - flaga aktywności (zawsze `true` w odpowiedzi, bo filtrujemy po aktywnych)

**GoalTypeListResponseDTO** - odpowiedź endpointa:
```typescript
export interface GoalTypeListResponseDTO {
  data: GoalTypeDTO[];
}
```

**ErrorResponseDTO** - standardowa struktura błędu:
```typescript
export interface ErrorResponseDTO {
  error: string;
  message: string;
  details?: Record<string, string>;
}
```

### Command Modele
Nie wymagane - endpoint tylko do odczytu, nie przyjmuje danych wejściowych do walidacji.

### Schema walidacji (opcjonalnie)
Dla spójności z innymi endpointami można stworzyć pusty schemat:
```typescript
// src/lib/schemas/goal-type.schema.ts
export const getGoalTypesQuerySchema = z.object({});
```

Jednak ze względu na brak parametrów, schema nie jest konieczna.

---

## 4. Szczegóły odpowiedzi

### Success Response: `200 OK`

```json
{
  "data": [
    {
      "code": "AUTO",
      "label_pl": "Samochód",
      "is_active": true
    },
    {
      "code": "EDUCATION",
      "label_pl": "Edukacja",
      "is_active": true
    },
    {
      "code": "EMERGENCY",
      "label_pl": "Fundusz awaryjny",
      "is_active": true
    },
    {
      "code": "HOUSE",
      "label_pl": "Dom/Mieszkanie",
      "is_active": true
    },
    {
      "code": "OTHER",
      "label_pl": "Inne",
      "is_active": true
    },
    {
      "code": "RETIREMENT",
      "label_pl": "Emerytura",
      "is_active": true
    },
    {
      "code": "VACATION",
      "label_pl": "Wakacje",
      "is_active": true
    }
  ]
}
```

**Uwagi**:
- Lista jest sortowana alfabetycznie według `label_pl`
- Pole `is_active` zawsze ma wartość `true` (filtrujemy po aktywnych)
- Pusta lista `[]` jest prawidłową odpowiedzią (gdy nie ma aktywnych typów)

### Error Response: `500 Internal Server Error`

```json
{
  "error": "internal_error",
  "message": "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później."
}
```

**Przypadki użycia**:
- Błąd połączenia z bazą danych
- Timeout zapytania
- Nieoczekiwany wyjątek w kodzie

---

## 5. Przepływ danych

### Architektura warstw

```
Client Request
     ↓
[Astro API Route: /api/v1/goal-types/index.ts]
     ↓
[Goal Type Service: goal-type.service.ts]
     ↓
[Supabase Client]
     ↓
[PostgreSQL: goal_types table]
     ↓
[Row Level Security check]
     ↓
Response (cached)
```

### Szczegółowy przepływ

1. **Walidacja żądania** (opcjonalna, bo brak parametrów)
   - Sprawdzenie poprawności URL
   - Brak parametrów do walidacji

2. **Wywołanie serwisu**
   ```typescript
   const goalTypes = await getActiveGoalTypes(locals.supabase);
   ```

3. **Zapytanie do bazy danych**
   ```sql
   SELECT code, label_pl, is_active
   FROM goal_types
   WHERE is_active = true
   ORDER BY label_pl ASC;
   ```
   
   Użyty indeks: `idx_gt_active` (partial index na `code WHERE is_active = true`)

4. **Weryfikacja RLS**
   - Supabase automatycznie stosuje polityki RLS
   - Polityki `anon_users_can_read_goal_types` i `authenticated_users_can_read_goal_types` pozwalają na odczyt

5. **Mapowanie do DTO**
   - Dane z bazy już pasują do struktury `GoalTypeDTO`
   - Bezpośrednie zwrócenie `data`

6. **Zwrócenie odpowiedzi**
   - Status: 200 OK
   - Content-Type: application/json
   - Cache-Control: public, max-age=3600 (1 godzina)

### Interakcje z zewnętrznymi systemami

- **Supabase PostgreSQL**: główna baza danych
- **Brak innych systemów**: endpoint jest całkowicie self-contained

---

## 6. Względy bezpieczeństwa

### Autentykacja
- **Nie wymagana** - endpoint dostępny publicznie
- Authorization header jest opcjonalny i nie jest sprawdzany
- Rationale: słownik typów celów nie zawiera danych wrażliwych ani użytkownika-specyficznych

### Autoryzacja
- **Poziom RLS**: Supabase RLS pozwala na publiczny odczyt przez polityki:
  - `anon_users_can_read_goal_types` dla niezalogowanych
  - `authenticated_users_can_read_goal_types` dla zalogowanych
- **Poziom aplikacji**: brak dodatkowych sprawdzeń

### Walidacja danych wejściowych
- Brak parametrów do walidacji
- URL jest weryfikowany przez Astro routing

### SQL Injection
- **Zabezpieczenie**: Używamy Supabase client z parametryzowanymi query
- Zapytanie nie przyjmuje danych od użytkownika, więc ryzyko jest zerowe

### Rate Limiting
- **MVP**: Brak implementacji rate limitingu
- **Mitigacja DoS**: Cache-Control header (public, max-age=3600) redukuje obciążenie bazy danych
- **Przyszłość**: Można rozważyć rate limiting na poziomie CDN/proxy (np. Cloudflare)

### Bezpieczeństwo danych
- **Ekspozycja danych**: Tylko pola publiczne (`code`, `label_pl`, `is_active`)
- **Ukryte pola**: `created_at`, `updated_at` nie są zwracane (nie są potrzebne w UI)
- **Wrażliwe dane**: Brak - słownik jest publiczny

### Content Security Policy
- Response type: `application/json` - brak ryzyka XSS
- Brak HTML/JavaScript w odpowiedzi

---

## 7. Obsługa błędów

### Scenariusze błędów

#### 1. Sukces - 200 OK
**Warunki**:
- Zapytanie do bazy danych się powiodło
- Lista może być pusta (prawidłowy przypadek)

**Odpowiedź**:
```json
{
  "data": [...]
}
```

#### 2. Błąd bazy danych - 500 Internal Server Error
**Warunki**:
- Błąd połączenia z Supabase
- Timeout zapytania
- Błąd SQL (np. tabela nie istnieje)

**Logowanie**:
```typescript
console.error("[GET /api/v1/goal-types] Database error:", error);
```

**Odpowiedź**:
```json
{
  "error": "internal_error",
  "message": "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później."
}
```

#### 3. Nieoczekiwany wyjątek - 500 Internal Server Error
**Warunki**:
- Wyjątek JavaScript w kodzie
- Błąd parsowania odpowiedzi
- Inne nieprzewidziane błędy

**Logowanie**:
```typescript
console.error("[GET /api/v1/goal-types] Unexpected error:", error);
```

**Odpowiedź**:
```json
{
  "error": "internal_error",
  "message": "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później."
}
```

### Strategia logowania

1. **Błędy techniczne**: `console.error` z prefiksem `[GET /api/v1/goal-types]`
2. **Kontekst**: Logowanie pełnego obiektu błędu dla debugowania
3. **Brak PII**: Błędy nie zawierają danych użytkownika (endpoint publiczny)

### Retry Strategy (Client-side)

Endpoint jest idempotentny i bezpieczny do ponowienia:
- Klient może bezpiecznie powtórzyć żądanie w przypadku błędu 500
- Zalecane: exponential backoff (1s, 2s, 4s)
- Cache po stronie klienta po sukcesie

---

## 8. Rozważania dotyczące wydajności

### Optymalizacje bazy danych

1. **Indeks częściowy**:
   - Index: `idx_gt_active ON goal_types(code) WHERE is_active = true`
   - Przyspiesza filtrowanie po `is_active = true`
   - Zajmuje mniej miejsca niż pełny indeks

2. **Selekcja kolumn**:
   - SELECT tylko niezbędne pola: `code, label_pl, is_active`
   - Nie pobieramy `created_at`, `updated_at` (nie są potrzebne)

3. **Rozmiar wyniku**:
   - Typowo 5-10 rekordów w tabeli
   - Wielkość odpowiedzi: ~500-1000 bytes
   - Brak potrzeby paginacji

### Cache'owanie

1. **HTTP Cache (Browser)**:
   - Header: `Cache-Control: public, max-age=3600` (1 godzina)
   - Rationale: dane bardzo rzadko się zmieniają
   - Użytkownicy widzą aktualne dane z max. 1h opóźnieniem

2. **CDN Cache** (opcjonalnie w produkcji):
   - Cloudflare/DigitalOcean może cache'ować response
   - Dodatkowa warstwa cache'owania

3. **Invalidation strategy**:
   - Automatyczna invalidacja po 1 godzinie
   - Manualna invalidacja nie jest wymagana (dane statyczne)
   - W razie potrzeby: hard refresh lub wersjonowanie URL

### Monitoring wydajności

**Metryki do śledzenia**:
- Czas odpowiedzi (target: <100ms z cache, <500ms bez cache)
- Częstotliwość żądań (cache hit ratio)
- Błędy 500 (target: <0.1%)

**Potencjalne wąskie gardła**:
- Połączenie z Supabase (mitigacja: cache)
- Cold start Astro endpoint (mitigacja: keep-alive, pre-warming)

### Skalowalność

- **Obecne obciążenie**: Niskie (kilka żądań na użytkownika podczas sesji)
- **Cache hit ratio**: Oczekiwane >95% dzięki długiemu TTL
- **Bottleneck**: Brak przy obecnym ruchu
- **Scaling strategy**: Zwiększenie TTL cache jeśli potrzeba, dodanie CDN

---

## 9. Etapy wdrożenia

### Krok 1: Utworzenie serwisu `goal-type.service.ts`

**Lokalizacja**: `src/lib/services/goal-type.service.ts`

**Zawartość**:
```typescript
import type { SupabaseClient } from "@/db/supabase.client";
import type { GoalTypeDTO } from "@/types";

/**
 * Get all active goal types
 * 
 * @param supabase - Supabase client from context.locals
 * @returns List of active goal types sorted by label_pl
 * @throws Error if database query fails
 */
export async function getActiveGoalTypes(
  supabase: SupabaseClient
): Promise<GoalTypeDTO[]> {
  // Build query for active goal types only
  const query = supabase
    .from("goal_types")
    .select("code, label_pl, is_active")
    .eq("is_active", true)
    .order("label_pl", { ascending: true });

  // Execute query
  const { data, error } = await query;

  // Handle database errors
  if (error) {
    console.error("[getActiveGoalTypes] Database error:", error);
    throw new Error(`Failed to fetch goal types: ${error.message}`);
  }

  // Return data (already matches GoalTypeDTO structure)
  return data;
}
```

**Testy jednostkowe** (opcjonalnie, poza zakresem MVP):
- Test sukcesu: zwraca listę posortowanych typów
- Test pustej listy: gdy brak aktywnych typów
- Test błędu bazy: throw Error z odpowiednim message

---

### Krok 2: Utworzenie endpointa API

**Lokalizacja**: `src/pages/api/v1/goal-types/index.ts`

**Zawartość**:
```typescript
import type { APIRoute } from "astro";
import { getActiveGoalTypes } from "@/lib/services/goal-type.service";
import type { GoalTypeListResponseDTO, ErrorResponseDTO } from "@/types";

// Disable prerendering for API routes
export const prerender = false;

/**
 * GET /api/v1/goal-types
 * List all active goal types
 * 
 * Public endpoint - no authentication required
 * Response is cached for 1 hour
 */
export const GET: APIRoute = async ({ locals }) => {
  try {
    // 1. Fetch goal types from service
    const goalTypes = await getActiveGoalTypes(locals.supabase);

    // 2. Build and return success response
    const response: GoalTypeListResponseDTO = {
      data: goalTypes,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    // 3. Handle unexpected errors
    console.error("[GET /api/v1/goal-types] Unexpected error:", error);

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

**Uwagi implementacyjne**:
- Brak walidacji parametrów (nie są wymagane)
- Brak sprawdzania autentykacji (publiczny endpoint)
- Minimalna logika - delegacja do serwisu
- Spójność z innymi endpointami (np. `/api/v1/categories`)

---

### Krok 3: Weryfikacja typów TypeScript

**Sprawdzenie**:
1. Typy `GoalTypeDTO` i `GoalTypeListResponseDTO` już istnieją w `src/types.ts`
2. Import `SupabaseClient` z `@/db/supabase.client.ts`
3. Kompatybilność z typami generowanymi przez Supabase

**Testy kompilacji**:
```bash
npm run build
# lub
npm run check
```

Upewnić się, że:
- Brak błędów TypeScript
- Typy są poprawnie inferowane
- IDE pokazuje poprawne autocomplete

---

### Krok 4: Testy manualne

**Test 1: Podstawowe wywołanie**
```bash
curl -X GET http://localhost:4321/api/v1/goal-types
```

Oczekiwana odpowiedź:
```json
{
  "data": [
    { "code": "AUTO", "label_pl": "Samochód", "is_active": true },
    { "code": "EDUCATION", "label_pl": "Edukacja", "is_active": true },
    ...
  ]
}
```

**Test 2: Sprawdzenie cache'owania**
```bash
curl -X GET http://localhost:4321/api/v1/goal-types -I
```

Oczekiwany header:
```
Cache-Control: public, max-age=3600
```

**Test 3: Sprawdzenie sortowania**
- Zweryfikować, że lista jest posortowana alfabetycznie po `label_pl`

**Test 4: Wywołanie z tokenem (opcjonalnie)**
```bash
curl -X GET http://localhost:4321/api/v1/goal-types \
  -H "Authorization: Bearer <token>"
```

Powinno działać tak samo jak bez tokena.

---

### Krok 5: Weryfikacja RLS w Supabase

**Sprawdzenie polityk**:
1. Zalogować się do Supabase Dashboard
2. Sprawdzić tabele > `goal_types` > RLS
3. Zweryfikować aktywne polityki:
   - `anon_users_can_read_goal_types` (SELECT dla roli anon)
   - `authenticated_users_can_read_goal_types` (SELECT dla roli authenticated)

**Test RLS w SQL Editor**:
```sql
-- Test jako anon
SET ROLE anon;
SELECT * FROM goal_types WHERE is_active = true;
-- Powinno zwrócić wszystkie aktywne typy

-- Test jako authenticated
SET ROLE authenticated;
SELECT * FROM goal_types WHERE is_active = true;
-- Powinno zwrócić wszystkie aktywne typy
```

---

### Krok 6: Dokumentacja i komentarze

**Aktualizacja dokumentacji**:
1. Zweryfikować, że endpoint jest udokumentowany w `.ai/api-plan.md`
2. Dodać komentarze JSDoc do funkcji serwisu
3. Dodać komentarze do endpointa API

**Przykład JSDoc**:
```typescript
/**
 * Get all active goal types
 * 
 * Returns a list of goal types that users can choose from when creating
 * a new savings goal. Only active types (is_active = true) are returned,
 * sorted alphabetically by Polish label.
 * 
 * @param supabase - Supabase client from context.locals
 * @returns Promise with array of goal type DTOs
 * @throws Error if database query fails
 * 
 * @example
 * const types = await getActiveGoalTypes(locals.supabase);
 * // Returns: [{ code: "AUTO", label_pl: "Samochód", is_active: true }, ...]
 */
```

---

### Krok 7: Integracja z frontendem (poza zakresem tego planu)

**Endpoint gotowy do użycia**:
- URL: `GET /api/v1/goal-types`
- Użycie w React componencie formularza tworzenia celu
- Fetch przy montowaniu komponentu
- Cache po stronie klienta (React Query, SWR, lub podobne)

**Przykład użycia** (dla informacji):
```typescript
// React component
const { data } = useFetch<GoalTypeListResponseDTO>('/api/v1/goal-types');
const goalTypes = data?.data || [];

// Render dropdown
<select name="type_code">
  {goalTypes.map(type => (
    <option key={type.code} value={type.code}>
      {type.label_pl}
    </option>
  ))}
</select>
```

---

### Krok 8: Deployment i monitoring

**Pre-deployment checklist**:
- [ ] Kod przeszedł review
- [ ] Testy manualne wykonane lokalnie
- [ ] TypeScript kompiluje się bez błędów
- [ ] RLS policies są aktywne w Supabase
- [ ] Cache-Control header jest ustawiony

**Post-deployment monitoring**:
- Sprawdzić logi na serwerze produkcyjnym
- Zweryfikować response time (powinien być <100ms z cache)
- Monitorować błędy 500 (powinny być bliskie zeru)
- Sprawdzić metryki cache hit ratio

**Rollback plan**:
- W przypadku problemów: usunąć endpoint (delete file)
- Endpoint nie modyfikuje danych, więc rollback jest bezpieczny
- Brak migracji bazy danych do cofnięcia

---

## 10. Podsumowanie

### Kluczowe decyzje architektoniczne

1. **Publiczny dostęp**: Endpoint nie wymaga autentykacji
2. **Agresywne cache'owanie**: 1 godzina TTL (dane statyczne)
3. **Minimalna walidacja**: Brak parametrów do walidacji
4. **Delegacja do serwisu**: Oddzielenie logiki biznesowej od routingu
5. **Spójność**: Wzorzec identyczny z `/api/v1/categories`

### Zgodność z PRD i regułami

- ✅ **Stack technologiczny**: Astro 5, TypeScript, Supabase
- ✅ **Struktura projektu**: `src/lib/services`, `src/pages/api/v1`
- ✅ **Code style**: Double quotes, semicolons, early returns
- ✅ **Bezpieczeństwo**: RLS, parametryzowane query
- ✅ **Wydajność**: Cache, indeksy, minimalna selekcja kolumn
- ✅ **Error handling**: Standardowy format błędów, logowanie

### Następne kroki po implementacji

1. **Frontend integration**: Użycie endpointa w formularzu tworzenia celu
2. **E2E tests**: Dodanie testów automatycznych (Playwright/Cypress)
3. **Rate limiting**: Rozważenie dodania w przyszłości (opcjonalnie)
4. **Metrics**: Monitoring użycia i wydajności
5. **Documentation**: Dodanie do dokumentacji API publicznej (jeśli planowana)

---

## 11. Referencje

### Pliki do utworzenia
1. `src/lib/services/goal-type.service.ts` - serwis pobierania typów celów
2. `src/pages/api/v1/goal-types/index.ts` - endpoint API

### Pliki do referencji (istniejące)
1. `src/types.ts` - typy DTO (GoalTypeDTO, GoalTypeListResponseDTO)
2. `src/pages/api/v1/categories/index.ts` - podobny wzorzec implementacji
3. `src/lib/services/transaction-category.service.ts` - podobna logika serwisu
4. `.ai/db-plan.md` - schemat bazy danych i RLS policies
5. `.ai/api-plan.md` - specyfikacja API

### Migracje bazy danych (istniejące, brak zmian)
1. `supabase/migrations/20251109120000_create_base_schema.sql` - tabela goal_types
2. `supabase/migrations/20251109120400_create_rls_policies.sql` - polityki RLS dla goal_types

---

**Koniec planu implementacji**

