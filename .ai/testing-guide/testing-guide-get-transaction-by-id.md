# Przewodnik testowania: GET /api/v1/transactions/:id

## Przegląd endpointa

Endpoint `GET /api/v1/transactions/:id` pobiera szczegóły pojedynczej transakcji na podstawie jej UUID.

**Funkcjonalność:**

- Zwraca pełne dane transakcji z dołączoną etykietą kategorii
- Filtruje soft-deleted transakcje (tylko aktywne)
- Weryfikuje właściciela transakcji (RLS + explicit check)

---

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

### Krok 3: Sprawdź test usera w bazie

W Supabase Studio lub przez SQL:

```sql
-- Sprawdź czy test user istnieje w profiles
SELECT * FROM profiles
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e';

-- Sprawdź czy user istnieje w auth.users
SELECT id, email, confirmed_at FROM auth.users
WHERE id = '4eef0567-df09-4a61-9219-631def0eb53e';
```

**Oczekiwany wynik**:

- ✅ User w `auth.users`: `hareyo4707@wivstore.com` (confirmed_at not null)
- ✅ User w `profiles`: `email_confirmed = true`

### Krok 4: Przygotuj dane testowe (transakcje)

Przed testowaniem GET potrzebujesz istniejących transakcji. Użyj POST endpoint:

```bash
# Stwórz transakcję EXPENSE
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "GROCERIES",
    "amount_cents": 15750,
    "occurred_on": "2025-11-10",
    "note": "Zakupy w Biedronce",
    "client_request_id": "550e8400-e29b-41d4-a716-446655440001"
  }'

# Zapisz ID transakcji z response dla dalszych testów!
```

**Zapisz UUID transakcji** - będziesz go potrzebować do testów GET.

Alternatywnie, pobierz istniejące ID z bazy:

```sql
SELECT id, type, category_code, amount_cents, note
FROM transactions
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 5;
```

### Krok 5: Uruchom dev server

```bash
npm run dev
```

Server powinien być dostępny pod `http://localhost:3004`

💡 **Tip**: Script `predev` automatycznie zwalnia port 3004 przed uruchomieniem.

---

## Scenariusze testowe

### Test 1: ✅ Sukces - Pobranie istniejącej transakcji EXPENSE

**Warunek wstępny:** Potrzebujesz UUID istniejącej transakcji (z Kroku 4)

**Request:**

```bash
# Zamień {TRANSACTION_ID} na rzeczywisty UUID transakcji
curl http://localhost:3004/api/v1/transactions/{TRANSACTION_ID}
```

**Przykład z konkretnym UUID:**

```bash
curl http://localhost:3004/api/v1/transactions/550e8400-e29b-41d4-a716-446655440001
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "type": "EXPENSE",
  "category_code": "GROCERIES",
  "category_label": "Zakupy spożywcze",
  "amount_cents": 15750,
  "occurred_on": "2025-11-10",
  "note": "Zakupy w Biedronce",
  "created_at": "2025-11-22T10:30:00.123456+00:00",
  "updated_at": "2025-11-22T10:30:00.123456+00:00"
}
```

**Weryfikacja:**

- ✅ Status: 200
- ✅ Wszystkie pola obecne (id, type, category_code, category_label, amount_cents, occurred_on, note, created_at, updated_at)
- ✅ `category_label` jest po polsku (JOIN działa poprawnie)
- ✅ `amount_cents` jest liczbą całkowitą > 0
- ✅ `occurred_on` w formacie YYYY-MM-DD
- ✅ `created_at` i `updated_at` w formacie ISO 8601

---

### Test 2: ✅ Sukces - Pobranie transakcji INCOME

**Warunek wstępny:** Stwórz transakcję INCOME:

```bash
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INCOME",
    "category_code": "SALARY",
    "amount_cents": 500000,
    "occurred_on": "2025-11-01",
    "note": "Wypłata listopad",
    "client_request_id": "550e8400-e29b-41d4-a716-446655440002"
  }'
```

**Request:** (użyj zwróconego ID)

```bash
curl http://localhost:3004/api/v1/transactions/{INCOME_TRANSACTION_ID}
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "id": "...",
  "type": "INCOME",
  "category_code": "SALARY",
  "category_label": "Wynagrodzenie",
  "amount_cents": 500000,
  "occurred_on": "2025-11-01",
  "note": "Wypłata listopad",
  "created_at": "...",
  "updated_at": "..."
}
```

**Weryfikacja:**

- ✅ `category_label` dla SALARY to "Wynagrodzenie" (sprawdź czy JOIN działa dla INCOME)

---

### Test 3: ✅ Sukces - Transakcja bez notatki (null)

**Warunek wstępny:** Stwórz transakcję bez note:

```bash
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "TRANSPORT",
    "amount_cents": 1200,
    "occurred_on": "2025-11-15",
    "note": null,
    "client_request_id": "550e8400-e29b-41d4-a716-446655440003"
  }'
```

**Request:**

```bash
curl http://localhost:3004/api/v1/transactions/{TRANSACTION_ID}
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "id": "...",
  "type": "EXPENSE",
  "category_code": "TRANSPORT",
  "category_label": "Transport",
  "amount_cents": 1200,
  "occurred_on": "2025-11-15",
  "note": null,
  "created_at": "...",
  "updated_at": "..."
}
```

**Weryfikacja:**

- ✅ `note` jest `null` (nie brak pola, ale explicit null)

---

### Test 4: ❌ Błąd 400 - Nieprawidłowy UUID (za krótki)

**Request:**

```bash
curl http://localhost:3004/api/v1/transactions/invalid-uuid
```

**Oczekiwana odpowiedź:** `400 Bad Request`

```json
{
  "error": "Bad Request",
  "message": "Invalid transaction ID format",
  "details": {
    "id": "Transaction ID must be a valid UUID"
  }
}
```

**Weryfikacja:**

- ✅ Status: 400
- ✅ Error structure zgodna z `ErrorResponseDTO`
- ✅ Czytelny komunikat błędu w `details.id`

---

### Test 5: ❌ Błąd 400 - Nieprawidłowy UUID (nieprawidłowe znaki)

**Request:**

```bash
curl http://localhost:3004/api/v1/transactions/not-a-valid-uuid-format-here
```

**Oczekiwana odpowiedź:** `400 Bad Request`

```json
{
  "error": "Bad Request",
  "message": "Invalid transaction ID format",
  "details": {
    "id": "Transaction ID must be a valid UUID"
  }
}
```

---

### Test 6: ❌ Błąd 400 - Brak ID w ścieżce

**Request:**

```bash
curl http://localhost:3004/api/v1/transactions/
```

**Oczekiwana odpowiedź:** `400 Bad Request` lub `404 Not Found` (zależnie od routingu Astro)

💡 **Uwaga**: Ten request może trafić do `GET /api/v1/transactions` (lista) zamiast do `GET /api/v1/transactions/:id`. To prawidłowe zachowanie.

---

### Test 7: ❌ Błąd 404 - Nieistniejący UUID (valid format)

**Request:** (użyj prawidłowego formatu UUID, ale nieistniejącego w bazie)

```bash
curl http://localhost:3004/api/v1/transactions/00000000-0000-0000-0000-000000000000
```

**Oczekiwana odpowiedź:** `404 Not Found`

```json
{
  "error": "Not Found",
  "message": "Transaction not found or has been deleted"
}
```

**Weryfikacja:**

- ✅ Status: 404
- ✅ Ten sam komunikat dla nieistniejących i soft-deleted (bezpieczeństwo)
- ✅ Brak `details` (nie ujawniamy dodatkowych informacji)

---

### Test 8: ❌ Błąd 404 - UUID losowy (brute force test)

**Request:**

```bash
curl http://localhost:3004/api/v1/transactions/123e4567-e89b-12d3-a456-426614174000
```

**Oczekiwana odpowiedź:** `404 Not Found`

```json
{
  "error": "Not Found",
  "message": "Transaction not found or has been deleted"
}
```

**Weryfikacja:**

- ✅ Query jest szybkie (index PK działa)
- ✅ RLS + explicit user_id check blokują dostęp do cudzych transakcji

---

### Test 9: ❌ Błąd 404 - Soft-deleted transakcja

**Warunek wstępny:** Ten test będzie działać dopiero po implementacji DELETE endpoint.

**Przygotowanie:** Soft-delete transakcję bezpośrednio w bazie:

```sql
UPDATE transactions
SET deleted_at = NOW(), updated_by = '4eef0567-df09-4a61-9219-631def0eb53e'
WHERE id = '{TRANSACTION_ID}'
  AND user_id = '4eef0567-df09-4a61-9219-631def0eb53e';
```

**Request:**

```bash
curl http://localhost:3004/api/v1/transactions/{SOFT_DELETED_ID}
```

**Oczekiwana odpowiedź:** `404 Not Found`

```json
{
  "error": "Not Found",
  "message": "Transaction not found or has been deleted"
}
```

**Weryfikacja:**

- ✅ Soft-deleted transakcje są ukryte (`.is("deleted_at", null)` działa)
- ✅ Ten sam komunikat co dla nieistniejących (security)

---

### Test 10: 🔐 Security - Transakcja innego użytkownika

**Warunek wstępny:** Ten test wymaga drugiego usera w bazie lub tymczasowej modyfikacji `DEFAULT_USER_ID`.

**Przygotowanie (opcjonalnie):**

1. Stwórz transakcję dla test usera
2. Tymczasowo zmień `DEFAULT_USER_ID` w `supabase.client.ts` na inny UUID
3. Spróbuj pobrać transakcję poprzedniego usera

**Oczekiwana odpowiedź:** `404 Not Found`

```json
{
  "error": "Not Found",
  "message": "Transaction not found or has been deleted"
}
```

**Weryfikacja:**

- ✅ Explicit `user_id` check blokuje dostęp
- ✅ Ten sam komunikat (nie ujawniamy, że transakcja istnieje)

💡 **Uwaga**: W production RLS będzie dodatkowo blokował na poziomie bazy.

---

### Test 11: 🔍 Weryfikacja JOIN - Różne kategorie

**Cel:** Sprawdzić, czy `category_label` jest poprawnie pobierana dla różnych kategorii.

**Przygotowanie:** Stwórz transakcje z różnymi kategoriami:

```bash
# GROCERIES
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "GROCERIES",
    "amount_cents": 1000,
    "occurred_on": "2025-11-15",
    "client_request_id": "test-groceries-001"
  }'

# UTILITIES
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "UTILITIES",
    "amount_cents": 2000,
    "occurred_on": "2025-11-15",
    "client_request_id": "test-utilities-001"
  }'

# SALARY
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INCOME",
    "category_code": "SALARY",
    "amount_cents": 5000,
    "occurred_on": "2025-11-15",
    "client_request_id": "test-salary-001"
  }'
```

**Request:** Pobierz każdą transakcję i sprawdź `category_label`:

```bash
curl http://localhost:3004/api/v1/transactions/{GROCERIES_ID}
curl http://localhost:3004/api/v1/transactions/{UTILITIES_ID}
curl http://localhost:3004/api/v1/transactions/{SALARY_ID}
```

**Oczekiwane wartości `category_label`:**

- GROCERIES → "Zakupy spożywcze"
- UTILITIES → "Rachunki"
- SALARY → "Wynagrodzenie"

**Weryfikacja:**

- ✅ Każda kategoria ma poprawną polską etykietę
- ✅ INNER JOIN działa dla wszystkich kategorii
- ✅ Brak przypadków `null` lub `undefined` w `category_label`

---

## Weryfikacja w bazie danych

### Sprawdzenie danych transakcji

```sql
-- Pobierz wszystkie aktywne transakcje test usera
SELECT
  id,
  type,
  category_code,
  amount_cents,
  occurred_on,
  note,
  created_at,
  updated_at,
  deleted_at
FROM transactions
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
ORDER BY created_at DESC;
```

### Sprawdzenie JOIN z category_label

```sql
-- Query podobne do tego w service
SELECT
  t.id,
  t.type,
  t.category_code,
  tc.label_pl as category_label,
  t.amount_cents,
  t.occurred_on,
  t.note,
  t.created_at,
  t.updated_at
FROM transactions t
INNER JOIN transaction_categories tc ON t.category_code = tc.code
WHERE t.user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND t.deleted_at IS NULL
ORDER BY t.created_at DESC;
```

**Weryfikacja:**

- ✅ INNER JOIN zwraca tylko transakcje z istniejącymi kategoriami
- ✅ `label_pl` jest zawsze not null

### Sprawdzenie soft-deleted transakcji

```sql
-- Znajdź soft-deleted transakcje
SELECT id, deleted_at
FROM transactions
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND deleted_at IS NOT NULL;
```

---

## Performance Testing

### Test wydajności - Response time

**Cel:** Sprawdzić, czy endpoint odpowiada w < 100ms (local dev).

**Request z timing:**

```bash
curl -w "\nTime total: %{time_total}s\n" \
  -o /dev/null -s \
  http://localhost:3004/api/v1/transactions/{TRANSACTION_ID}
```

**Oczekiwany wynik:**

- ✅ Time total < 0.100s (100ms) dla local development
- ✅ Time total < 0.050s (50ms) po drugim request (warm)

**Diagnostyka jeśli wolne:**

1. Sprawdź czy indeksy istnieją (PK, FK)
2. Sprawdź EXPLAIN ANALYZE w bazie
3. Sprawdź Supabase connection pool

### Test obciążenia (opcjonalnie)

**Narzędzie:** Apache Bench (ab) lub wrk

```bash
# 100 requestów, 10 concurrent
ab -n 100 -c 10 http://localhost:3004/api/v1/transactions/{TRANSACTION_ID}
```

**Oczekiwane metryki:**

- Requests per second: > 100 req/s (local)
- Mean response time: < 100ms
- Failed requests: 0

---

## Checklist testów

### Podstawowe testy funkcjonalne

- [ ] Test 1: Sukces - EXPENSE (200)
- [ ] Test 2: Sukces - INCOME (200)
- [ ] Test 3: Sukces - note null (200)
- [ ] Test 4: Błąd - nieprawidłowy UUID krótki (400)
- [ ] Test 5: Błąd - nieprawidłowy UUID znaki (400)
- [ ] Test 7: Błąd - nieistniejący UUID (404)
- [ ] Test 8: Błąd - losowy UUID (404)
- [ ] Test 9: Błąd - soft-deleted (404)

### Testy bezpieczeństwa

- [ ] Test 10: Security - cudza transakcja (404)
- [ ] Verify: Ten sam error message dla 404 (nie ujawnia info)
- [ ] Verify: RLS + explicit user_id check działa

### Testy JOIN i data integrity

- [ ] Test 11: JOIN - różne kategorie mają label_pl
- [ ] Verify: INNER JOIN wyklucza nieistniejące kategorie
- [ ] Verify: Wszystkie pola TransactionDTO obecne

### Testy wydajności

- [ ] Performance: Response time < 100ms (local)
- [ ] Performance: Query używa PK index
- [ ] Performance: Brak N+1 queries

### Weryfikacja w bazie

- [ ] Verify: Query w service odpowiada rzeczywistym danym
- [ ] Verify: Soft-deleted są ukryte
- [ ] Verify: JOIN zwraca label_pl

---

## Troubleshooting

### Problem: 500 Internal Server Error

**Diagnostyka:** Sprawdź console.error w terminalu gdzie działa dev server.

**Częste przyczyny:**

1. Brak połączenia z Supabase - sprawdź `SUPABASE_URL` i `SUPABASE_KEY`
2. Błędne dane w `.env` - upewnij się, że nie ma spacji wokół wartości
3. Dev server wymaga restartu po zmianie `.env`
4. Błąd w JOIN query - sprawdź czy `transaction_categories` ma dane

**Diagnostyka query:**

```sql
-- Sprawdź czy JOIN działa
SELECT t.*, tc.label_pl
FROM transactions t
INNER JOIN transaction_categories tc ON t.category_code = tc.code
WHERE t.user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
LIMIT 1;
```

### Problem: 404 dla istniejącej transakcji

**Przyczyny:**

1. Transakcja jest soft-deleted (`deleted_at IS NOT NULL`)
2. Transakcja należy do innego usera
3. RLS blokuje dostęp (powinno być wyłączone w dev)
4. Nieprawidłowy `DEFAULT_USER_ID` w kodzie

**Diagnostyka:**

```sql
-- Sprawdź czy transakcja istnieje
SELECT id, user_id, deleted_at
FROM transactions
WHERE id = '{TRANSACTION_ID}';
```

**Rozwiązanie:**

- Jeśli `deleted_at` nie jest NULL → transakcja soft-deleted (prawidłowe 404)
- Jeśli `user_id` ≠ `DEFAULT_USER_ID` → cudza transakcja (prawidłowe 404)
- Jeśli brak rekordu → UUID nie istnieje (prawidłowe 404)

### Problem: `category_label` jest null lub undefined

**Przyczyny:**

1. INNER JOIN nie działa (błąd w query)
2. `transaction_categories` nie ma danych
3. `category_code` w transakcji nie istnieje w słowniku

**Diagnostyka:**

```sql
-- Sprawdź czy kategorie są załadowane
SELECT * FROM transaction_categories;

-- Sprawdź transakcję z nieprawidłowym category_code
SELECT t.category_code, tc.label_pl
FROM transactions t
LEFT JOIN transaction_categories tc ON t.category_code = tc.code
WHERE t.id = '{TRANSACTION_ID}';
```

**Rozwiązanie:**

1. Jeśli `transaction_categories` pusta → uruchom migracje
2. Jeśli LEFT JOIN pokazuje NULL → category_code nieprawidłowy (data integrity issue)

### Problem: RLS error mimo wyłączonego RLS

**Diagnostyka:**

```sql
-- Sprawdź status RLS
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'transactions';
```

**Rozwiązanie:** Jeśli `rowsecurity = true`:

```bash
npx supabase migration up
```

### Problem: Wolny response time (> 200ms)

**Diagnostyka:**

```sql
-- Sprawdź EXPLAIN ANALYZE
EXPLAIN ANALYZE
SELECT t.*, tc.label_pl
FROM transactions t
INNER JOIN transaction_categories tc ON t.category_code = tc.code
WHERE t.user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND t.id = '{TRANSACTION_ID}'
  AND t.deleted_at IS NULL;
```

**Oczekiwany plan:**

- Index Scan using transactions_pkey (PK lookup)
- Nested Loop join (fast dla małej tabeli słownikowej)

**Rozwiązanie:**

1. Sprawdź czy indeksy istnieją (PK, FK)
2. Supabase cold start może dodać 50-200ms (pierwsze zapytanie)
3. Connection pool saturation (sprawdź Supabase metrics)

---

## Następne kroki po testach

1. ✅ Wszystkie testy przeszły → Endpoint gotowy do użycia
2. 🔄 Implementacja PATCH /api/v1/transactions/:id (update)
3. 🗑️ Implementacja DELETE /api/v1/transactions/:id (soft-delete)
4. 🔐 Implementacja pełnego auth middleware (przyszła iteracja)
5. 📝 Aktualizacja dokumentacji API (opcjonalnie Swagger/OpenAPI)

---

## Quick Reference - Przykładowe komendy

### Szybki test flow

```bash
# 1. Stwórz transakcję
RESPONSE=$(curl -s -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "GROCERIES",
    "amount_cents": 15750,
    "occurred_on": "2025-11-10",
    "note": "Test transaction",
    "client_request_id": "test-'$(uuidgen)'"
  }')

# 2. Wyciągnij ID z response (wymaga jq)
TRANSACTION_ID=$(echo $RESPONSE | jq -r '.id')
echo "Created transaction: $TRANSACTION_ID"

# 3. Pobierz transakcję
curl http://localhost:3004/api/v1/transactions/$TRANSACTION_ID | jq

# 4. Test 404
curl http://localhost:3004/api/v1/transactions/00000000-0000-0000-0000-000000000000 | jq

# 5. Test 400
curl http://localhost:3004/api/v1/transactions/invalid-uuid | jq
```

### Weryfikacja w bazie (jedna komenda)

```sql
WITH test_user AS (
  SELECT '4eef0567-df09-4a61-9219-631def0eb53e'::uuid AS user_id
)
SELECT
  t.id,
  t.type,
  t.category_code,
  tc.label_pl,
  t.amount_cents,
  t.occurred_on,
  t.deleted_at IS NULL AS is_active
FROM transactions t
INNER JOIN transaction_categories tc ON t.category_code = tc.code
CROSS JOIN test_user u
WHERE t.user_id = u.user_id
ORDER BY t.created_at DESC
LIMIT 10;
```

---

## Porównanie z POST endpoint

| Aspekt                 | POST /transactions              | GET /transactions/:id |
| ---------------------- | ------------------------------- | --------------------- |
| **Metoda**             | POST                            | GET                   |
| **Request body**       | JSON (CreateTransactionCommand) | Brak                  |
| **Path param**         | Brak                            | `:id` (UUID)          |
| **Success status**     | 201 Created                     | 200 OK                |
| **Walidacja**          | Zod + business logic            | Zod (tylko UUID)      |
| **Errors**             | 400, 409, 422, 500              | 400, 404, 500         |
| **JOIN**               | ✅ Tak                          | ✅ Tak                |
| **RLS check**          | ✅ Tak                          | ✅ Tak                |
| **Soft-delete filter** | N/A                             | ✅ Tak                |

---

**Powodzenia w testowaniu! 🚀**
