# Przewodnik testowania: DELETE /api/v1/transactions/:id

## Przegląd

Endpoint DELETE /api/v1/transactions/:id wykonuje **soft-delete** transakcji należącej do uwierzytelnionego użytkownika. Operacja nie usuwa fizycznie rekordu z bazy danych, a jedynie ustawia pola `deleted_at` i `deleted_by`.

**Kluczowe cechy:**
- **Soft-delete** - rekord pozostaje w bazie, ale jest oznaczony jako usunięty
- **Idempotencja** - wielokrotne wywołanie zwraca 404 po pierwszym sukcesie
- **Ownership check** - użytkownik może usunąć tylko swoje transakcje
- **Audit trail** - operacja jest automatycznie logowana w `audit_log`
- **Wpływ na agregaty** - usunięcie aktualizuje `monthly_metrics`

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

### Krok 4: Utwórz testowe transakcje

Przed testowaniem DELETE, potrzebujemy kilka transakcji do usunięcia:

```bash
# Transakcja 1 - do usunięcia w Test 1
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "GROCERIES",
    "amount_cents": 15750,
    "occurred_on": "2025-11-10",
    "note": "Test transaction for delete",
    "client_request_id": "delete-test-001"
  }'

# Transakcja 2 - do testu idempotencji
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "RESTAURANTS",
    "amount_cents": 8500,
    "occurred_on": "2025-11-15",
    "note": "Test for idempotency",
    "client_request_id": "delete-test-002"
  }'

# Transakcja 3 - do weryfikacji monthly_metrics
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INCOME",
    "category_code": "SALARY",
    "amount_cents": 500000,
    "occurred_on": "2025-11-01",
    "note": "Test for metrics update",
    "client_request_id": "delete-test-003"
  }'
```

**📝 Zapisz zwrócone ID transakcji** - będą potrzebne w testach!

### Krok 5: Uruchom dev server

```bash
npm run dev
```

Server powinien być dostępny pod `http://localhost:3004`

---

## Scenariusze testowe

### Test 1: ✅ Sukces - Soft-delete transakcji (204 No Content)

**Przygotowanie:**
Użyj ID transakcji zwróconego z Transakcji 1 (krok 4).

**Request:**
```bash
# Zamień TRANSACTION_ID_HERE na rzeczywiste UUID
curl -X DELETE http://localhost:3004/api/v1/transactions/TRANSACTION_ID_HERE \
  -v
```

**Oczekiwana odpowiedź:** `204 No Content`
```
HTTP/1.1 204 No Content
Content-Length: 0
```

**Body:** Pusta odpowiedź (brak JSON)

**Co sprawdzić:**
- ✅ Status code = 204
- ✅ Brak zawartości w body
- ✅ Header `Content-Length: 0`

---

### Test 2: ❌ Błąd 404 - Transakcja nie istnieje

**Request:**
```bash
curl -X DELETE http://localhost:3004/api/v1/transactions/00000000-0000-0000-0000-000000000000 \
  -v
```

**Oczekiwana odpowiedź:** `404 Not Found`
```json
{
  "error": "Not Found",
  "message": "Transaction not found or has been deleted"
}
```

**Uwaga:** Komunikat jest celowo ogólny dla bezpieczeństwa (information disclosure prevention).

---

### Test 3: ❌ Błąd 400 - Nieprawidłowy format UUID

**Request:**
```bash
curl -X DELETE http://localhost:3004/api/v1/transactions/invalid-uuid \
  -v
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

**Inne przykłady nieprawidłowych UUID do przetestowania:**
- `123` (za krótki)
- `abc-def-ghi` (nieprawidłowy format)
- pusty string (brak ID)

---

### Test 4: ❌ Błąd 400 - Brak ID w ścieżce

**Request:**
```bash
curl -X DELETE http://localhost:3004/api/v1/transactions/ \
  -v
```

**Oczekiwana odpowiedź:** `404 Not Found` (route not found, nie endpoint)

**Uwaga:** To nie trafia do naszego DELETE handler - Astro zwraca 404 bo route wymaga `:id`.

---

### Test 5: ✅ Idempotencja - Podwójne usunięcie (pierwszy raz: 204, drugi raz: 404)

**Request (pierwszy raz):**
```bash
# Użyj ID transakcji z Transakcji 2 (krok 4)
curl -X DELETE http://localhost:3004/api/v1/transactions/TRANSACTION_ID_HERE \
  -v
```

**Oczekiwana odpowiedź:** `204 No Content` ✅

**Request (drugi raz - ten sam ID):**
```bash
# Ten sam ID co powyżej
curl -X DELETE http://localhost:3004/api/v1/transactions/TRANSACTION_ID_HERE \
  -v
```

**Oczekiwana odpowiedź:** `404 Not Found` ✅
```json
{
  "error": "Not Found",
  "message": "Transaction not found or has been deleted"
}
```

**Co sprawdzić:**
- ✅ Pierwsze wywołanie zwraca 204
- ✅ Drugie wywołanie zwraca 404
- ✅ Trzecie, czwarte... wywołanie również 404 (idempotencja)

---

### Test 6: ❌ Próba usunięcia transakcji innego użytkownika

**Przygotowanie:**
Wymaga stworzenia transakcji dla innego usera (pomiń jeśli nie masz drugiego test usera).

**Request:**
```bash
curl -X DELETE http://localhost:3004/api/v1/transactions/OTHER_USER_TRANSACTION_ID \
  -v
```

**Oczekiwana odpowiedź:** `404 Not Found`
```json
{
  "error": "Not Found",
  "message": "Transaction not found or has been deleted"
}
```

**Uwaga bezpieczeństwa:** Nie zwracamy 403 Forbidden, aby nie ujawniać istnienia transakcji.

---

## Weryfikacja w bazie danych

### Weryfikacja 1: Soft-delete w tabeli transactions

Po wykonaniu Test 1 (successful delete), sprawdź w bazie:

```sql
-- Znajdź transakcję po client_request_id
SELECT 
  id, 
  type, 
  category_code,
  amount_cents, 
  deleted_at, 
  deleted_by,
  updated_at,
  updated_by
FROM transactions
WHERE client_request_id = 'delete-test-001';
```

**Oczekiwany wynik:**
- ✅ `deleted_at` IS NOT NULL (timestamp usunięcia)
- ✅ `deleted_by` = `'4eef0567-df09-4a61-9219-631def0eb53e'` (DEFAULT_USER_ID)
- ✅ `updated_at` = `deleted_at` (zaktualizowany w tym samym czasie)
- ✅ `updated_by` = `deleted_by`

**❌ NIE powinno być:**
- Rekord fizycznie usunięty z tabeli (hard-delete)

---

### Weryfikacja 2: Wpis w audit_log

Sprawdź czy soft-delete został zalogowany:

```sql
-- Sprawdź audit_log dla usuniętej transakcji
SELECT 
  entity_type,
  entity_id,
  action,
  before ->> 'deleted_at' as before_deleted_at,
  after ->> 'deleted_at' as after_deleted_at,
  performed_at
FROM audit_log
WHERE entity_id = 'TRANSACTION_ID_HERE'  -- ID z Test 1
ORDER BY performed_at DESC
LIMIT 1;
```

**Oczekiwany wynik:**
- ✅ `entity_type` = `'transaction'`
- ✅ `action` = `'DELETE'`
- ✅ `before_deleted_at` = `null` (przed operacją nie było deleted_at)
- ✅ `after_deleted_at` zawiera timestamp (po operacji jest deleted_at)
- ✅ `performed_at` ≈ czas wykonania DELETE

---

### Weryfikacja 3: Aktualizacja monthly_metrics

Sprawdź czy agregaty zostały zaktualizowane po soft-delete:

**Krok 1: Sprawdź monthly_metrics PRZED usunięciem Transakcji 3**

```sql
SELECT 
  month, 
  income_cents, 
  expenses_cents,
  net_saved_cents,
  free_cash_flow_cents,
  refreshed_at
FROM monthly_metrics
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND month = '2025-11-01';
```

**Zapisz wartości:** `income_cents` (np. 500000), `expenses_cents`, itp.

**Krok 2: Usuń Transakcję 3 (INCOME 500000 centów)**

```bash
curl -X DELETE http://localhost:3004/api/v1/transactions/TRANSACTION_3_ID \
  -v
```

**Krok 3: Sprawdź monthly_metrics PO usunięciu**

```sql
SELECT 
  month, 
  income_cents, 
  expenses_cents,
  net_saved_cents,
  free_cash_flow_cents,
  refreshed_at
FROM monthly_metrics
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND month = '2025-11-01';
```

**Oczekiwany wynik:**
- ✅ `income_cents` zmniejszyło się o 500000
- ✅ `net_saved_cents` zaktualizowane (income - expenses)
- ✅ `free_cash_flow_cents` zaktualizowane
- ✅ `refreshed_at` został zaktualizowany (nowy timestamp)

---

### Weryfikacja 4: Transakcja NIE pojawia się w GET listach

Po soft-delete, transakcja nie powinna być zwracana przez GET endpoints:

```bash
# GET /api/v1/transactions (lista)
curl -X GET http://localhost:3004/api/v1/transactions?month=2025-11 \
  -v

# GET /api/v1/transactions/:id (single)
curl -X GET http://localhost:3004/api/v1/transactions/DELETED_TRANSACTION_ID \
  -v
```

**Oczekiwany wynik:**
- ✅ Lista (`GET /transactions`) NIE zawiera usuniętej transakcji
- ✅ Single (`GET /transactions/:id`) zwraca 404 Not Found

---

## Weryfikacja kompleksowa - scenariusz E2E

### Pełny flow: CREATE → GET → DELETE → GET (404)

**Krok 1: Utwórz transakcję**
```bash
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "ENTERTAINMENT",
    "amount_cents": 4500,
    "occurred_on": "2025-11-20",
    "note": "E2E test transaction",
    "client_request_id": "e2e-delete-test-001"
  }'
```

**Zapisz zwrócone ID** (np. `abc123...`)

**Krok 2: Pobierz transakcję (potwierdzenie istnienia)**
```bash
curl -X GET http://localhost:3004/api/v1/transactions/abc123... \
  -v
```

Oczekiwany wynik: **200 OK** z pełnymi danymi transakcji

**Krok 3: Usuń transakcję**
```bash
curl -X DELETE http://localhost:3004/api/v1/transactions/abc123... \
  -v
```

Oczekiwany wynik: **204 No Content**

**Krok 4: Próba ponownego pobrania (powinno zwrócić 404)**
```bash
curl -X GET http://localhost:3004/api/v1/transactions/abc123... \
  -v
```

Oczekiwany wynik: **404 Not Found**

**Krok 5: Weryfikacja soft-delete w bazie**
```sql
SELECT id, deleted_at, deleted_by 
FROM transactions 
WHERE client_request_id = 'e2e-delete-test-001';
```

Oczekiwany wynik: Rekord **istnieje** w bazie, ale ma `deleted_at NOT NULL`

---

## Checklist testów

### Testy funkcjonalne
- [ ] Test 1: Successful delete (204)
- [ ] Test 2: Transaction not found (404)
- [ ] Test 3: Invalid UUID format (400)
- [ ] Test 4: Brak ID w ścieżce (404 route)
- [ ] Test 5: Idempotency - double delete (204 → 404)
- [ ] Test 6: Próba usunięcia transakcji innego usera (404)

### Weryfikacja w bazie danych
- [ ] Weryfikacja 1: Soft-delete ustawia deleted_at i deleted_by
- [ ] Weryfikacja 2: Wpis w audit_log z action=DELETE
- [ ] Weryfikacja 3: monthly_metrics zaktualizowane
- [ ] Weryfikacja 4: Usunięta transakcja nie pojawia się w GET

### E2E scenario
- [ ] CREATE → GET (200) → DELETE (204) → GET (404) → Verify soft-delete

---

## Troubleshooting

### Problem: 500 Internal Server Error

**Diagnostyka:** 
Sprawdź console.error w terminalu gdzie działa dev server.

**Możliwe przyczyny:**
1. **Brak połączenia z Supabase**
   ```bash
   # Sprawdź czy zmienne są ustawione
   echo $PUBLIC_SUPABASE_URL
   echo $PUBLIC_SUPABASE_ANON_KEY
   ```

2. **Błędna konfiguracja .env**
   - Upewnij się że nie ma spacji wokół wartości
   - Restart dev server po zmianie .env

3. **RLS błędy** (jeśli RLS jest włączone)
   ```sql
   -- Sprawdź status RLS
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public' AND tablename = 'transactions';
   ```

---

### Problem: Trigger nie aktualizuje monthly_metrics

**Diagnostyka:**
```sql
-- Sprawdź czy trigger istnieje
SELECT 
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'transactions'
  AND trigger_name LIKE '%monthly%';
```

**Rozwiązanie:**
Jeśli trigger nie istnieje, uruchom migracje:
```bash
npx supabase db reset
```

---

### Problem: Audit log nie zapisuje operacji DELETE

**Diagnostyka:**
```sql
-- Sprawdź czy trigger audit_log istnieje
SELECT 
  trigger_name,
  event_manipulation
FROM information_schema.triggers
WHERE event_object_table = 'transactions'
  AND trigger_name LIKE '%audit%';
```

**Rozwiązanie:**
Trigger powinien być typu `AFTER UPDATE` (bo soft-delete to UPDATE, nie DELETE).
Jeśli nie istnieje:
```bash
npx supabase db reset
```

---

### Problem: DELETE zwraca 404 dla istniejącej transakcji

**Możliwe przyczyny:**

1. **Transakcja należy do innego usera**
   ```sql
   SELECT user_id FROM transactions WHERE id = 'TRANSACTION_ID';
   -- Porównaj z DEFAULT_USER_ID: '4eef0567-df09-4a61-9219-631def0eb53e'
   ```

2. **Transakcja jest już usunięta (deleted_at NOT NULL)**
   ```sql
   SELECT deleted_at FROM transactions WHERE id = 'TRANSACTION_ID';
   ```

3. **RLS policy blokuje dostęp** (jeśli RLS włączone)
   - Sprawdź czy email_confirmed = true dla test usera
   - Tymczasowo wyłącz RLS dla development

---

### Problem: Transakcja fizycznie znika z bazy (hard-delete)

**To NIE jest oczekiwane zachowanie!**

**Diagnostyka:**
```sql
-- Sprawdź czy rekord istnieje (powinien!)
SELECT * FROM transactions WHERE id = 'DELETED_TRANSACTION_ID';
```

**Jeśli rekord nie istnieje:**
- ❌ Kod wykonuje `DELETE FROM` zamiast `UPDATE`
- ❌ Trigger wykonuje hard-delete (błędna konfiguracja)

**Sprawdź kod service layer:**
```typescript
// POPRAWNE (soft-delete):
.update({ deleted_at: now(), deleted_by: userId })

// BŁĘDNE (hard-delete):
.delete()  // ❌ NIE UŻYWAMY
```

---

## Metryki wydajności (opcjonalne)

Podczas testów możesz zmierzyć response time:

```bash
# Test z czasem odpowiedzi
curl -X DELETE http://localhost:3004/api/v1/transactions/TRANSACTION_ID \
  -w "\nTime: %{time_total}s\n" \
  -o /dev/null \
  -s

# Oczekiwany czas:
# - p50: < 50ms
# - p95: < 100ms
# - p99: < 200ms
```

---

## Następne kroki po testach

1. ✅ **Wszystkie testy przeszły** → Endpoint gotowy do użycia
2. 📝 **Dokumentacja API** - zaktualizuj api-plan.md
3. 🧪 **Testy automatyczne** (opcjonalnie) - unit tests dla deleteTransaction()
4. 🔐 **Implementacja auth** - zastąpienie DEFAULT_USER_ID przez context.locals.user.id
5. 🧹 **Cleanup job** (przyszłość) - hard-delete soft-deleted records starszych niż 90 dni
6. 🚀 **Kolejne endpointy** - implementacja zgodnie z api-plan.md

---

## Podsumowanie

Endpoint DELETE /api/v1/transactions/:id wykonuje **soft-delete**, co oznacza:

✅ **Zalety soft-delete:**
- Możliwość odzyskania danych (customer support)
- Pełny audit trail w audit_log
- Bezpieczne dla relacji (nie psuje FK)
- Zgodność z GDPR (możemy później hard-delete)

✅ **Kluczowe cechy:**
- Idempotencja (wielokrotne DELETE → 404)
- Ownership check (tylko swoje transakcje)
- Automatyczne triggery (audit_log, monthly_metrics)
- Odpowiedź 204 No Content (RESTful best practice)

✅ **Bezpieczeństwo:**
- Information disclosure prevention (ogólne komunikaty 404)
- RLS policies (gdy włączone)
- SQL injection protection (parametryzowane queries)

**Happy testing! 🧪**

