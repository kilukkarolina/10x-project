# Przewodnik testowania: GET /api/v1/categories

## Przygotowanie do testów

### Krok 1: Uruchomienie migracji Supabase

```bash
# Sprawdź status migracji
npx supabase migration list

# Uruchom wszystkie migracje
npx supabase db reset

# Lub zastosuj tylko nowe migracje
npx supabase migration up
```

**Ważne migracje dla testów**:
- `20251109120100_create_business_tables.sql` - tworzy tabelę transaction_categories
- `20251109120500_seed_test_user.sql` - dodaje test usera do profiles
- `20251111090000_disable_rls_for_development.sql` - wyłącza RLS tymczasowo

### Krok 2: Sprawdź zmienne środowiskowe

W pliku `.env`:

```env
PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

✅ **Informacja**: 
- Prefix `PUBLIC_` oznacza, że zmienne są dostępne zarówno na serwerze jak i kliencie
- RLS jest tymczasowo wyłączony dla development, więc wystarczy anon key

⚠️ **Przypomnienie**: Przed production trzeba będzie:
- Włączyć ponownie RLS (migracja do stworzenia)
- Zaimplementować pełen auth middleware
- Przełączyć na autentykowane requesty

### Krok 3: Sprawdź dane kategorii w bazie

W Supabase Studio lub przez SQL:

```sql
-- Sprawdź czy kategorie istnieją
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

**Oczekiwany wynik**:
- ✅ Kategorie INCOME: minimum 1 aktywna kategoria (np. SALARY)
- ✅ Kategorie EXPENSE: minimum kilka aktywnych kategorii (np. GROCERIES, TRANSPORT)

**Jeśli brak danych testowych, dodaj:**
```sql
INSERT INTO transaction_categories (code, kind, label_pl, is_active) VALUES
  ('SALARY', 'INCOME', 'Wynagrodzenie', true),
  ('FREELANCE', 'INCOME', 'Zlecenia', true),
  ('GROCERIES', 'EXPENSE', 'Zakupy spożywcze', true),
  ('TRANSPORT', 'EXPENSE', 'Transport', true),
  ('BILLS', 'EXPENSE', 'Rachunki', true),
  ('ENTERTAINMENT', 'EXPENSE', 'Rozrywka', true);
```

### Krok 4: Uzyskaj token JWT

**Opcja A: Zaloguj się przez frontend** (jeśli masz)

**Opcja B: Użyj Supabase CLI do wygenerowania tokenu**

```bash
# W Supabase Studio → Settings → API
# Skopiuj anon key i użyj jako Bearer token
```

**Opcja C: Użyj test usera do wygenerowania tokenu**

Dla uproszczenia testów w development, możesz użyć anon key jako tokenu (RLS wyłączony).

```bash
# Zapisz anon key do zmiennej
export SUPABASE_ANON_KEY="twój_anon_key_tutaj"
```

### Krok 5: Uruchom dev server

```bash
npm run dev
```

Server powinien być dostępny pod `http://localhost:3004`

💡 **Tip**: Script `predev` automatycznie zwalnia port 3004 przed uruchomieniem.

---

## Scenariusze testowe

### Test 1: ✅ Sukces - Lista wszystkich kategorii

**Request:**
```bash
curl -X GET "http://localhost:3004/api/v1/categories" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

**Oczekiwana odpowiedź:** `200 OK`
```json
{
  "data": [
    {
      "code": "BILLS",
      "kind": "EXPENSE",
      "label_pl": "Rachunki",
      "is_active": true
    },
    {
      "code": "ENTERTAINMENT",
      "kind": "EXPENSE",
      "label_pl": "Rozrywka",
      "is_active": true
    },
    {
      "code": "TRANSPORT",
      "kind": "EXPENSE",
      "label_pl": "Transport",
      "is_active": true
    },
    {
      "code": "GROCERIES",
      "kind": "EXPENSE",
      "label_pl": "Zakupy spożywcze",
      "is_active": true
    },
    {
      "code": "FREELANCE",
      "kind": "INCOME",
      "label_pl": "Zlecenia",
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

**Weryfikacja:**
- ✅ Status: 200 OK
- ✅ Wszystkie kategorie gdzie `is_active = true`
- ✅ Sortowanie alfabetyczne po `label_pl` (rosnąco)
- ✅ Każdy element ma: `code`, `kind`, `label_pl`, `is_active`
- ✅ Header: `Cache-Control: public, max-age=3600`

---

### Test 2: ✅ Sukces - Filtrowanie po EXPENSE

**Request:**
```bash
curl -X GET "http://localhost:3004/api/v1/categories?kind=EXPENSE" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

**Oczekiwana odpowiedź:** `200 OK`
```json
{
  "data": [
    {
      "code": "BILLS",
      "kind": "EXPENSE",
      "label_pl": "Rachunki",
      "is_active": true
    },
    {
      "code": "ENTERTAINMENT",
      "kind": "EXPENSE",
      "label_pl": "Rozrywka",
      "is_active": true
    },
    {
      "code": "TRANSPORT",
      "kind": "EXPENSE",
      "label_pl": "Transport",
      "is_active": true
    },
    {
      "code": "GROCERIES",
      "kind": "EXPENSE",
      "label_pl": "Zakupy spożywcze",
      "is_active": true
    }
  ]
}
```

**Weryfikacja:**
- ✅ Status: 200 OK
- ✅ Tylko kategorie gdzie `kind = "EXPENSE"`
- ✅ Sortowanie alfabetyczne po `label_pl`
- ✅ Brak kategorii INCOME

---

### Test 3: ✅ Sukces - Filtrowanie po INCOME

**Request:**
```bash
curl -X GET "http://localhost:3004/api/v1/categories?kind=INCOME" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

**Oczekiwana odpowiedź:** `200 OK`
```json
{
  "data": [
    {
      "code": "FREELANCE",
      "kind": "INCOME",
      "label_pl": "Zlecenia",
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

**Weryfikacja:**
- ✅ Status: 200 OK
- ✅ Tylko kategorie gdzie `kind = "INCOME"`
- ✅ Sortowanie alfabetyczne po `label_pl`
- ✅ Brak kategorii EXPENSE

---

### Test 4: ❌ Błąd 400 - Nieprawidłowa wartość kind

**Request:**
```bash
curl -X GET "http://localhost:3004/api/v1/categories?kind=INVALID" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

**Oczekiwana odpowiedź:** `400 Bad Request`
```json
{
  "error": "validation_error",
  "message": "Nieprawidłowe parametry zapytania",
  "details": {
    "kind": "Wartość musi być 'INCOME' lub 'EXPENSE'"
  }
}
```

**Weryfikacja:**
- ✅ Status: 400 Bad Request
- ✅ Komunikat błędu walidacji
- ✅ Pole `details` zawiera szczegóły błędu dla `kind`

---

### Test 5: ❌ Błąd 400 - Nieprawidłowy typ kind (liczba)

**Request:**
```bash
curl -X GET "http://localhost:3004/api/v1/categories?kind=123" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

**Oczekiwana odpowiedź:** `400 Bad Request`
```json
{
  "error": "validation_error",
  "message": "Nieprawidłowe parametry zapytania",
  "details": {
    "kind": "Wartość musi być 'INCOME' lub 'EXPENSE'"
  }
}
```

**Weryfikacja:**
- ✅ Status: 400 Bad Request
- ✅ Walidacja typu parametru działa

---

### Test 6: ❌ Błąd 401 - Brak autoryzacji

**Request:**
```bash
curl -X GET "http://localhost:3004/api/v1/categories"
```

**Oczekiwana odpowiedź:** `401 Unauthorized`
```json
{
  "error": "unauthorized",
  "message": "Brak autoryzacji. Zaloguj się ponownie."
}
```

**Weryfikacja:**
- ✅ Status: 401 Unauthorized
- ✅ Endpoint wymaga autoryzacji
- ✅ Brak headera `Authorization` = błąd 401

---

### Test 7: ❌ Błąd 401 - Nieprawidłowy token

**Request:**
```bash
curl -X GET "http://localhost:3004/api/v1/categories" \
  -H "Authorization: Bearer invalid_token_here"
```

**Oczekiwana odpowiedź:** `401 Unauthorized`
```json
{
  "error": "unauthorized",
  "message": "Brak autoryzacji. Zaloguj się ponownie."
}
```

**Weryfikacja:**
- ✅ Status: 401 Unauthorized
- ✅ Walidacja tokenu JWT działa

---

### Test 8: ✅ Edge case - Parametr kind (lowercase)

**Request:**
```bash
curl -X GET "http://localhost:3004/api/v1/categories?kind=expense" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

**Oczekiwana odpowiedź:** `400 Bad Request`
```json
{
  "error": "validation_error",
  "message": "Nieprawidłowe parametry zapytania",
  "details": {
    "kind": "Wartość musi być 'INCOME' lub 'EXPENSE'"
  }
}
```

**Weryfikacja:**
- ✅ Status: 400 Bad Request
- ✅ Walidacja case-sensitive działa (wymaga wielkich liter)

---

### Test 9: ✅ Edge case - Pusta lista (wszystkie kategorie nieaktywne)

**Przygotowanie:**
```sql
-- Tymczasowo dezaktywuj wszystkie kategorie
UPDATE transaction_categories SET is_active = false;
```

**Request:**
```bash
curl -X GET "http://localhost:3004/api/v1/categories" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

**Oczekiwana odpowiedź:** `200 OK`
```json
{
  "data": []
}
```

**Weryfikacja:**
- ✅ Status: 200 OK (nie błąd!)
- ✅ Pusta tablica `data`
- ✅ To prawidłowy stan, nie error case

**Cleanup:**
```sql
-- Przywróć aktywne kategorie
UPDATE transaction_categories SET is_active = true;
```

---

### Test 10: ✅ Edge case - Filtr kind bez wyników

**Przygotowanie:**
```sql
-- Tymczasowo dezaktywuj tylko INCOME
UPDATE transaction_categories SET is_active = false WHERE kind = 'INCOME';
```

**Request:**
```bash
curl -X GET "http://localhost:3004/api/v1/categories?kind=INCOME" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

**Oczekiwana odpowiedź:** `200 OK`
```json
{
  "data": []
}
```

**Weryfikacja:**
- ✅ Status: 200 OK
- ✅ Pusta tablica dla INCOME (wszystkie nieaktywne)
- ✅ To prawidłowy stan

**Cleanup:**
```sql
-- Przywróć aktywne INCOME
UPDATE transaction_categories SET is_active = true WHERE kind = 'INCOME';
```

---

### Test 11: ✅ Weryfikacja Cache-Control header

**Request:**
```bash
curl -X GET "http://localhost:3004/api/v1/categories" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -i
```

**Weryfikacja w odpowiedzi:**
```
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: public, max-age=3600
...
```

**Weryfikacja:**
- ✅ Header `Cache-Control` obecny
- ✅ Wartość: `public, max-age=3600` (1 godzina)
- ✅ Odpowiedź może być cachowana przez klienta

---

## Weryfikacja w bazie danych

Po testach, sprawdź dane w bazie:

```sql
-- 1. Sprawdź wszystkie aktywne kategorie
SELECT code, kind, label_pl, is_active
FROM transaction_categories
WHERE is_active = true
ORDER BY label_pl;

-- 2. Sprawdź podział po typach
SELECT 
  kind,
  COUNT(*) as active_count,
  COUNT(*) FILTER (WHERE is_active = false) as inactive_count
FROM transaction_categories
GROUP BY kind;

-- 3. Sprawdź czy istnieją nieaktywne kategorie
SELECT code, kind, label_pl, is_active
FROM transaction_categories
WHERE is_active = false;

-- 4. Sprawdź sortowanie alfabetyczne
SELECT label_pl
FROM transaction_categories
WHERE is_active = true
ORDER BY label_pl;
```

**Oczekiwane wyniki:**
- ✅ Minimum 2-3 kategorie INCOME (aktywne)
- ✅ Minimum 4-5 kategorii EXPENSE (aktywne)
- ✅ Sortowanie alfabetyczne działa poprawnie
- ✅ Pole `is_active` prawidłowo filtruje

---

## Checklist testów

### Testy podstawowe:
- [ ] Test 1: Lista wszystkich kategorii (200 OK)
- [ ] Test 2: Filtr `kind=EXPENSE` (200 OK)
- [ ] Test 3: Filtr `kind=INCOME` (200 OK)
- [ ] Test 11: Weryfikacja Cache-Control header

### Testy walidacji:
- [ ] Test 4: Nieprawidłowa wartość kind (400)
- [ ] Test 5: Kind jako liczba (400)
- [ ] Test 8: Kind lowercase (400)

### Testy autoryzacji:
- [ ] Test 6: Brak tokenu (401)
- [ ] Test 7: Nieprawidłowy token (401)

### Testy edge cases:
- [ ] Test 9: Pusta lista - wszystkie nieaktywne (200 OK)
- [ ] Test 10: Filtr bez wyników (200 OK)

### Weryfikacja w bazie:
- [ ] Sprawdzenie aktywnych kategorii
- [ ] Sprawdzenie podziału INCOME/EXPENSE
- [ ] Weryfikacja sortowania alfabetycznego
- [ ] Sprawdzenie nieaktywnych kategorii

---

## Troubleshooting

### Problem: 500 Internal Server Error

**Diagnostyka**: Sprawdź console.error w terminalu gdzie działa dev server.

**Częste przyczyny**:
1. Brak połączenia z Supabase - sprawdź `PUBLIC_SUPABASE_URL` i `PUBLIC_SUPABASE_ANON_KEY`
2. Błędne dane w `.env` - upewnij się, że nie ma spacji wokół wartości
3. Dev server wymaga restartu po zmianie `.env`

**Rozwiązanie**:
```bash
# Zatrzymaj dev server (Ctrl+C)
# Sprawdź .env
cat .env | grep SUPABASE

# Uruchom ponownie
npm run dev
```

---

### Problem: Pusta lista kategorii (200 OK z data: [])

**Diagnostyka**:
```sql
-- Sprawdź czy kategorie istnieją w bazie
SELECT * FROM transaction_categories;

-- Sprawdź aktywne kategorie
SELECT * FROM transaction_categories WHERE is_active = true;
```

**Rozwiązanie**: Kategorie nie zostały załadowane lub są nieaktywne.

1. Uruchom migracje:
```bash
npx supabase db reset
```

2. Jeśli nadal brak danych, dodaj manualnie:
```sql
INSERT INTO transaction_categories (code, kind, label_pl, is_active) VALUES
  ('SALARY', 'INCOME', 'Wynagrodzenie', true),
  ('FREELANCE', 'INCOME', 'Zlecenia', true),
  ('GROCERIES', 'EXPENSE', 'Zakupy spożywcze', true),
  ('TRANSPORT', 'EXPENSE', 'Transport', true),
  ('BILLS', 'EXPENSE', 'Rachunki', true);
```

---

### Problem: 401 Unauthorized mimo prawidłowego tokenu

**Diagnostyka**:
```bash
# Sprawdź czy token jest prawidłowy
echo $SUPABASE_ANON_KEY

# Sprawdź czy middleware działa
# W src/middleware/index.ts powinno być:
# - Konfiguracja Supabase client
# - Export context.locals.supabase
```

**Rozwiązanie**:

1. Sprawdź czy middleware jest poprawnie skonfigurowany:
```typescript
// src/middleware/index.ts
export const onRequest = sequence(/* ... */);
```

2. Sprawdź czy token nie wygasł:
- Anon key nie wygasa (publiczny)
- User token wygasa (wymaga refresh)

3. Sprawdź konfigurację Supabase:
```typescript
// Upewnij się że locals.supabase istnieje
const { data: { user }, error } = await locals.supabase.auth.getUser();
```

---

### Problem: RLS blokuje dostęp (pomimo wyłączonego RLS)

**Diagnostyka**:
```sql
-- Sprawdź status RLS dla tabeli
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'transaction_categories';
```

**Oczekiwany wynik**: `rowsecurity = false`

**Rozwiązanie**:

1. Jeśli `rowsecurity = true`, wyłącz RLS:
```sql
ALTER TABLE transaction_categories DISABLE ROW LEVEL SECURITY;
```

2. Lub uruchom migrację:
```bash
npx supabase migration up
```

3. Sprawdź czy polityka SELECT istnieje:
```sql
SELECT * FROM pg_policies 
WHERE tablename = 'transaction_categories';
```

---

### Problem: Sortowanie nie działa alfabetycznie

**Diagnostyka**:
```sql
-- Sprawdź aktualne sortowanie
SELECT label_pl
FROM transaction_categories
WHERE is_active = true
ORDER BY label_pl;
```

**Weryfikacja**: Czy kolejność jest alfabetyczna (polskie znaki)?

**Rozwiązanie**: PostgreSQL powinno domyślnie sortować poprawnie. Jeśli nie:
```sql
-- Sprawdź collation
SHOW LC_COLLATE;

-- Alternatywnie użyj explicit collation
ORDER BY label_pl COLLATE "pl_PL";
```

---

### Problem: Cache-Control header nie jest zwracany

**Diagnostyka**: Sprawdź response headers w curl z flagą `-i`:
```bash
curl -X GET "http://localhost:3004/api/v1/categories" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -i | grep -i cache
```

**Rozwiązanie**: 

1. Sprawdź route handler czy header jest ustawiony:
```typescript
return new Response(JSON.stringify(response), {
  status: 200,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=3600",
  },
});
```

2. Sprawdź czy middleware nie nadpisuje headerów

---

## Metryki sukcesu

### Funkcjonalność:
- [ ] Wszystkie testy podstawowe przechodzą (200 OK)
- [ ] Filtrowanie po `kind` działa poprawnie
- [ ] Sortowanie alfabetyczne działa
- [ ] Walidacja query params działa
- [ ] Autoryzacja jest wymuszana

### Wydajność:
- [ ] Czas odpowiedzi < 100ms (średnio)
- [ ] Czas odpowiedzi < 50ms dla większości requestów
- [ ] Brak timeoutów

### Bezpieczeństwo:
- [ ] Endpoint wymaga autoryzacji (401 bez tokenu)
- [ ] Walidacja parametrów działa (400 dla błędnych wartości)
- [ ] Brak SQL injection (parametryzowane zapytania)

### Cache:
- [ ] Cache-Control header obecny
- [ ] Wartość: `public, max-age=3600`

---

## Następne kroki po testach

1. ✅ Wszystkie testy przeszły → Endpoint gotowy do użycia

2. 🎨 **Integracja z frontendem:**
   - Utworzenie React hook do pobierania kategorii
   - Użycie w formularzu tworzenia/edycji transakcji
   - Implementacja cache po stronie klienta

3. 📊 **Monitoring (opcjonalnie):**
   - Dodaj metryki czasu odpowiedzi
   - Monitoruj popularność filtrów (INCOME vs EXPENSE)
   - Śledź cache hit rate

4. 🚀 **Kolejne endpointy:**
   - Implementacja pozostałych endpointów z api-plan.md
   - GET /api/v1/transactions
   - POST /api/v1/transactions
   - itd.

---

## Pomocne komendy

### Szybki test wszystkich scenariuszy:

```bash
# Ustaw zmienną z tokenem
export TOKEN="$SUPABASE_ANON_KEY"

# Test 1: Wszystkie kategorie
curl -s -X GET "http://localhost:3004/api/v1/categories" \
  -H "Authorization: Bearer $TOKEN" | jq

# Test 2: Tylko EXPENSE
curl -s -X GET "http://localhost:3004/api/v1/categories?kind=EXPENSE" \
  -H "Authorization: Bearer $TOKEN" | jq

# Test 3: Tylko INCOME
curl -s -X GET "http://localhost:3004/api/v1/categories?kind=INCOME" \
  -H "Authorization: Bearer $TOKEN" | jq

# Test 4: Błąd walidacji
curl -s -X GET "http://localhost:3004/api/v1/categories?kind=INVALID" \
  -H "Authorization: Bearer $TOKEN" | jq

# Test 5: Błąd autoryzacji
curl -s -X GET "http://localhost:3004/api/v1/categories" | jq
```

💡 **Tip**: Używaj `jq` do ładnego formatowania JSON w terminalu.

---

## Podsumowanie

Endpoint `GET /api/v1/categories` to prosty read-only endpoint, który:
- ✅ Zwraca aktywne kategorie transakcji
- ✅ Obsługuje opcjonalne filtrowanie po `kind`
- ✅ Wymaga autoryzacji JWT
- ✅ Implementuje caching (1 godzina)
- ✅ Zwraca dane posortowane alfabetycznie

**Estimated testing time: 30-45 minut** (wszystkie testy + weryfikacja w bazie)

