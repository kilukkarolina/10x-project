# Przewodnik testowania: PATCH /api/v1/transactions/:id

## Przygotowanie do testów

### Krok 1: Sprawdź środowisko

```bash
# Sprawdź czy dev server działa
npm run dev

# W osobnym terminalu - sprawdź status Supabase
npx supabase status
```

Server powinien być dostępny pod `http://localhost:3004`

### Krok 2: Przygotuj dane testowe

Najpierw utwórz kilka transakcji testowych, które będziesz mogła edytować:

```bash
# Utwórz transakcję EXPENSE (GROCERIES)
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "GROCERIES",
    "amount_cents": 15750,
    "occurred_on": "2025-11-10",
    "note": "Zakupy w Biedronce",
    "client_request_id": "550e8400-e29b-41d4-a716-446655440101"
  }'

# Zapisz zwrócone ID - użyjesz go w testach poniżej
# Przykład: TRANSACTION_ID="abc12345-6789-0def-1234-567890abcdef"
```

```bash
# Utwórz transakcję INCOME (SALARY)
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INCOME",
    "category_code": "SALARY",
    "amount_cents": 500000,
    "occurred_on": "2025-11-01",
    "note": "Wynagrodzenie",
    "client_request_id": "550e8400-e29b-41d4-a716-446655440102"
  }'

# Zapisz ID tej transakcji również
# Przykład: INCOME_TRANSACTION_ID="def12345-6789-0abc-1234-567890abcdef"
```

### Krok 3: Pobierz ID istniejących transakcji

Jeśli nie masz ID, sprawdź w bazie:

```sql
-- W Supabase Studio → SQL Editor
SELECT id, type, category_code, amount_cents, occurred_on, note
FROM transactions
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 5;
```

**Dla wygody testowania**, ustaw zmienne w terminalu:

```bash
# Podstaw swoje ID tutaj
export EXPENSE_TX_ID="abc12345-6789-0def-1234-567890abcdef"
export INCOME_TX_ID="def12345-6789-0abc-1234-567890abcdef"
```

---

## Scenariusze testowe

### Test 1: ✅ Sukces - Aktualizacja pojedynczego pola (note)

**Request:**

```bash
curl -X PATCH http://localhost:3004/api/v1/transactions/$EXPENSE_TX_ID \
  -H "Content-Type: application/json" \
  -d '{
    "note": "Zakupy w Lidlu - zaktualizowane"
  }'
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "id": "abc12345-6789-0def-1234-567890abcdef",
  "type": "EXPENSE",
  "category_code": "GROCERIES",
  "category_label": "Zakupy spożywcze",
  "amount_cents": 15750,
  "occurred_on": "2025-11-10",
  "note": "Zakupy w Lidlu - zaktualizowane",
  "created_at": "2025-11-11T...",
  "updated_at": "2025-11-22T..."
}
```

**Weryfikacja:**

- ✅ Pole `note` zostało zmienione
- ✅ `updated_at` jest nowszy niż `created_at`
- ✅ Inne pola pozostały bez zmian
- ✅ Brak pola `backdate_warning`

---

### Test 2: ✅ Sukces - Aktualizacja wielu pól jednocześnie

**Request:**

```bash
curl -X PATCH http://localhost:3004/api/v1/transactions/$EXPENSE_TX_ID \
  -H "Content-Type: application/json" \
  -d '{
    "category_code": "RESTAURANTS",
    "amount_cents": 18000,
    "note": "Kolacja w restauracji"
  }'
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "id": "abc12345-6789-0def-1234-567890abcdef",
  "type": "EXPENSE",
  "category_code": "RESTAURANTS",
  "category_label": "Restauracje",
  "amount_cents": 18000,
  "occurred_on": "2025-11-10",
  "note": "Kolacja w restauracji",
  "created_at": "2025-11-11T...",
  "updated_at": "2025-11-22T..."
}
```

**Weryfikacja:**

- ✅ `category_code` zmieniony z GROCERIES → RESTAURANTS
- ✅ `category_label` zmieniony z "Zakupy spożywcze" → "Restauracje"
- ✅ `amount_cents` zmieniony z 15750 → 18000
- ✅ `note` zaktualizowany
- ✅ `type` pozostał EXPENSE (nie można zmienić)
- ✅ Brak pola `backdate_warning` (ten sam miesiąc)

---

### Test 3: ✅ Sukces - Zmiana miesiąca (backdate_warning)

**Request:**

```bash
curl -X PATCH http://localhost:3004/api/v1/transactions/$EXPENSE_TX_ID \
  -H "Content-Type: application/json" \
  -d '{
    "occurred_on": "2025-10-25"
  }'
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "id": "abc12345-6789-0def-1234-567890abcdef",
  "type": "EXPENSE",
  "category_code": "RESTAURANTS",
  "category_label": "Restauracje",
  "amount_cents": 18000,
  "occurred_on": "2025-10-25",
  "note": "Kolacja w restauracji",
  "created_at": "2025-11-11T...",
  "updated_at": "2025-11-22T...",
  "backdate_warning": true
}
```

**Weryfikacja:**

- ✅ `occurred_on` zmieniony z 2025-11-10 → 2025-10-25
- ✅ **Pole `backdate_warning: true` jest obecne** (zmiana z listopada na październik)
- ✅ Trigger w bazie przeliczył `monthly_metrics` dla obu miesięcy

**Sprawdź w bazie:**

```sql
-- Sprawdź monthly_metrics dla października i listopada
SELECT month, expenses_cents, income_cents
FROM monthly_metrics
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND month IN ('2025-10-01', '2025-11-01')
ORDER BY month DESC;
```

---

### Test 4: ✅ Sukces - Zmiana daty w tym samym miesiącu (brak backdate_warning)

**Request:**

```bash
curl -X PATCH http://localhost:3004/api/v1/transactions/$EXPENSE_TX_ID \
  -H "Content-Type: application/json" \
  -d '{
    "occurred_on": "2025-10-15"
  }'
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "id": "abc12345-6789-0def-1234-567890abcdef",
  "type": "EXPENSE",
  "category_code": "RESTAURANTS",
  "category_label": "Restauracje",
  "amount_cents": 18000,
  "occurred_on": "2025-10-15",
  "note": "Kolacja w restauracji",
  "created_at": "2025-11-11T...",
  "updated_at": "2025-11-22T..."
}
```

**Weryfikacja:**

- ✅ `occurred_on` zmieniony z 2025-10-25 → 2025-10-15
- ✅ **Brak pola `backdate_warning`** (wciąż ten sam miesiąc - październik)

---

### Test 5: ✅ Sukces - Ustawienie note na null (usunięcie notatki)

**Request:**

```bash
curl -X PATCH http://localhost:3004/api/v1/transactions/$EXPENSE_TX_ID \
  -H "Content-Type: application/json" \
  -d '{
    "note": null
  }'
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "id": "abc12345-6789-0def-1234-567890abcdef",
  "type": "EXPENSE",
  "category_code": "RESTAURANTS",
  "category_label": "Restauracje",
  "amount_cents": 18000,
  "occurred_on": "2025-10-15",
  "note": null,
  "created_at": "2025-11-11T...",
  "updated_at": "2025-11-22T..."
}
```

**Weryfikacja:**

- ✅ `note` zmieniony na `null`

---

### Test 6: ❌ Błąd 400 - Nieprawidłowy UUID

**Request:**

```bash
curl -X PATCH http://localhost:3004/api/v1/transactions/invalid-uuid \
  -H "Content-Type: application/json" \
  -d '{
    "note": "test"
  }'
```

**Oczekiwana odpowiedź:** `400 Bad Request`

```json
{
  "error": "Bad Request",
  "message": "Invalid request data",
  "details": {
    "id": "Transaction ID must be a valid UUID"
  }
}
```

---

### Test 7: ❌ Błąd 400 - Pusty request body

**Request:**

```bash
curl -X PATCH http://localhost:3004/api/v1/transactions/$EXPENSE_TX_ID \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Oczekiwana odpowiedź:** `400 Bad Request`

```json
{
  "error": "Bad Request",
  "message": "Invalid request data",
  "details": {
    "": "At least one field must be provided for update"
  }
}
```

**Uwaga:** Zod `.refine()` zwraca błąd na root level (pusty string jako key).

---

### Test 8: ❌ Błąd 400 - Nieprawidłowe wartości pól

**Request:**

```bash
curl -X PATCH http://localhost:3004/api/v1/transactions/$EXPENSE_TX_ID \
  -H "Content-Type: application/json" \
  -d '{
    "amount_cents": -100,
    "occurred_on": "invalid-date"
  }'
```

**Oczekiwana odpowiedź:** `400 Bad Request`

```json
{
  "error": "Bad Request",
  "message": "Invalid request data",
  "details": {
    "amount_cents": "Amount must be greater than 0",
    "occurred_on": "Date must be in YYYY-MM-DD format"
  }
}
```

---

### Test 9: ❌ Błąd 400 - Data w przyszłości

**Request:**

```bash
curl -X PATCH http://localhost:3004/api/v1/transactions/$EXPENSE_TX_ID \
  -H "Content-Type: application/json" \
  -d '{
    "occurred_on": "2026-12-31"
  }'
```

**Oczekiwana odpowiedź:** `400 Bad Request`

```json
{
  "error": "Bad Request",
  "message": "Invalid request data",
  "details": {
    "occurred_on": "Transaction date cannot be in the future"
  }
}
```

---

### Test 10: ❌ Błąd 400 - Notatka zbyt długa

**Request:**

```bash
curl -X PATCH http://localhost:3004/api/v1/transactions/$EXPENSE_TX_ID \
  -H "Content-Type: application/json" \
  -d "{
    \"note\": \"$(printf 'a%.0s' {1..501})\"
  }"
```

**Oczekiwana odpowiedź:** `400 Bad Request`

```json
{
  "error": "Bad Request",
  "message": "Invalid request data",
  "details": {
    "note": "Note cannot exceed 500 characters"
  }
}
```

---

### Test 11: ❌ Błąd 404 - Transakcja nie istnieje

**Request:**

```bash
curl -X PATCH http://localhost:3004/api/v1/transactions/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{
    "note": "test"
  }'
```

**Oczekiwana odpowiedź:** `404 Not Found`

```json
{
  "error": "Not Found",
  "message": "Transaction not found or has been deleted"
}
```

**Uwaga:** Ten sam komunikat zwracany jest gdy:

- Transakcja nie istnieje w bazie
- Transakcja należy do innego użytkownika (RLS)
- Transakcja jest soft-deleted (`deleted_at IS NOT NULL`)

---

### Test 12: ❌ Błąd 422 - Nieistniejąca kategoria

**Request:**

```bash
curl -X PATCH http://localhost:3004/api/v1/transactions/$EXPENSE_TX_ID \
  -H "Content-Type: application/json" \
  -d '{
    "category_code": "NONEXISTENT"
  }'
```

**Oczekiwana odpowiedź:** `422 Unprocessable Entity`

```json
{
  "error": "Unprocessable Entity",
  "message": "Validation failed",
  "details": {
    "category_code": "NONEXISTENT"
  }
}
```

---

### Test 13: ❌ Błąd 422 - Niezgodność typu kategorii

**Request:** (Próba zmiany kategorii EXPENSE na kategorię INCOME)

```bash
curl -X PATCH http://localhost:3004/api/v1/transactions/$EXPENSE_TX_ID \
  -H "Content-Type: application/json" \
  -d '{
    "category_code": "SALARY"
  }'
```

**Oczekiwana odpowiedź:** `422 Unprocessable Entity`

```json
{
  "error": "Unprocessable Entity",
  "message": "Validation failed",
  "details": {
    "category_code": "Category kind INCOME does not match transaction type EXPENSE"
  }
}
```

**Wyjaśnienie:**

- Transakcja EXPENSE nie może mieć kategorii INCOME
- Nie można zmienić typu transakcji - trzeba usunąć i utworzyć nową

---

### Test 14: ❌ Błąd 422 - Nieaktywna kategoria

Najpierw oznacz kategorię jako nieaktywną w bazie:

```sql
-- W Supabase Studio → SQL Editor
UPDATE transaction_categories
SET is_active = false
WHERE code = 'HEALTH';
```

**Request:**

```bash
curl -X PATCH http://localhost:3004/api/v1/transactions/$EXPENSE_TX_ID \
  -H "Content-Type: application/json" \
  -d '{
    "category_code": "HEALTH"
  }'
```

**Oczekiwana odpowiedź:** `422 Unprocessable Entity`

```json
{
  "error": "Unprocessable Entity",
  "message": "Validation failed",
  "details": {
    "category_code": "HEALTH"
  }
}
```

**Przywróć kategorię po teście:**

```sql
UPDATE transaction_categories
SET is_active = true
WHERE code = 'HEALTH';
```

---

## Weryfikacja w bazie danych

### Sprawdź zaktualizowaną transakcję

```sql
-- Sprawdź szczegóły transakcji
SELECT
  t.id,
  t.type,
  t.category_code,
  tc.label_pl as category_label,
  t.amount_cents,
  t.occurred_on,
  t.note,
  t.created_at,
  t.updated_at,
  t.created_by,
  t.updated_by
FROM transactions t
JOIN transaction_categories tc ON t.category_code = tc.code
WHERE t.id = 'TU_WSTAW_ID'
  AND t.deleted_at IS NULL;
```

### Sprawdź audit_log (trigger)

```sql
-- Sprawdź ostatnią zmianę w audit_log
SELECT
  entity_type,
  entity_id,
  action,
  before,
  after,
  performed_at
FROM audit_log
WHERE entity_type = 'transaction'
  AND entity_id = 'TU_WSTAW_ID'
ORDER BY performed_at DESC
LIMIT 1;
```

**Oczekiwany wynik:**

- `action = 'UPDATE'`
- `before` zawiera stare wartości (JSON)
- `after` zawiera nowe wartości (JSON)

### Sprawdź monthly_metrics (trigger - jeśli zmiana miesiąca)

```sql
-- Sprawdź metryki dla starego i nowego miesiąca
SELECT
  month,
  income_cents,
  expenses_cents,
  net_saved_cents,
  refreshed_at
FROM monthly_metrics
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND month IN ('2025-10-01', '2025-11-01')
ORDER BY month DESC;
```

**Oczekiwane zmiany (po Teście 3):**

- Październik: `expenses_cents` wzrósł o 18000
- Listopad: `expenses_cents` zmniejszył się o 18000

---

## Checklist testów

### Happy path (sukcesy)

- [ ] Test 1: Aktualizacja pojedynczego pola (note) - **200 OK**
- [ ] Test 2: Aktualizacja wielu pól jednocześnie - **200 OK**
- [ ] Test 3: Zmiana miesiąca (backdate_warning) - **200 OK**
- [ ] Test 4: Zmiana daty w tym samym miesiącu - **200 OK**
- [ ] Test 5: Ustawienie note na null - **200 OK**

### Error cases - 400 Bad Request (walidacja Zod)

- [ ] Test 6: Nieprawidłowy UUID - **400**
- [ ] Test 7: Pusty request body - **400**
- [ ] Test 8: Nieprawidłowe wartości pól - **400**
- [ ] Test 9: Data w przyszłości - **400**
- [ ] Test 10: Notatka zbyt długa - **400**

### Error cases - 404 Not Found

- [ ] Test 11: Transakcja nie istnieje - **404**

### Error cases - 422 Unprocessable Entity (walidacja biznesowa)

- [ ] Test 12: Nieistniejąca kategoria - **422**
- [ ] Test 13: Niezgodność typu kategorii - **422**
- [ ] Test 14: Nieaktywna kategoria - **422**

### Weryfikacja w bazie

- [ ] Sprawdź zaktualizowaną transakcję w tabeli `transactions`
- [ ] Sprawdź wpis w `audit_log` (action = UPDATE)
- [ ] Sprawdź `monthly_metrics` po zmianie miesiąca

---

## Troubleshooting

### Problem: 500 Internal Server Error

**Diagnostyka:** Sprawdź console.error w terminalu gdzie działa dev server.

**Częste przyczyny:**

1. Brak połączenia z Supabase
2. Błąd w logice serwisu (np. trigger w bazie)
3. Złe dane w zmiennych środowiskowych

**Rozwiązanie:**

```bash
# Restart dev server
npm run dev

# Sprawdź status Supabase
npx supabase status
```

---

### Problem: "Transaction not found" dla istniejącej transakcji

**Przyczyny:**

1. Transakcja należy do innego użytkownika (RLS/user_id check)
2. Transakcja jest soft-deleted (`deleted_at IS NOT NULL`)
3. Nieprawidłowe ID w zmiennej środowiskowej

**Sprawdź w bazie:**

```sql
SELECT id, user_id, deleted_at
FROM transactions
WHERE id = 'TU_WSTAW_ID';
```

**Rozwiązanie:**

- Upewnij się, że `user_id = '4eef0567-df09-4a61-9219-631def0eb53e'`
- Upewnij się, że `deleted_at IS NULL`

---

### Problem: Brak backdate_warning mimo zmiany miesiąca

**Przyczyna:** Logika w serwisie porównuje tylko YYYY-MM część daty.

**Sprawdź:**

```bash
# Echo dla weryfikacji
echo "Stara data: 2025-11-10 (2025-11)"
echo "Nowa data: 2025-10-25 (2025-10)"
echo "Miesiące się różnią? TAK → backdate_warning: true"
```

Jeśli backdate_warning nie pojawia się:

1. Sprawdź czy rzeczywiście zmienił się miesiąc (nie tylko dzień)
2. Sprawdź logi w konsoli dev server

---

### Problem: monthly_metrics się nie aktualizuje

**Diagnostyka:**

```sql
-- Sprawdź czy trigger istnieje
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgname LIKE '%monthly_metrics%';
```

**Rozwiązanie:** Trigger nie został utworzony. Zresetuj migracje:

```bash
npx supabase db reset
```

---

### Problem: Kategoria INCOME działa dla EXPENSE

**Przyczyna:** Walidacja `category.kind !== existing.type` nie zadziałała.

**Sprawdź dane kategorii:**

```sql
SELECT code, kind, is_active
FROM transaction_categories
WHERE code IN ('SALARY', 'GROCERIES');
```

**Oczekiwane:**

- SALARY: kind = 'INCOME'
- GROCERIES: kind = 'EXPENSE'

Jeśli dane są złe, zresetuj migracje:

```bash
npx supabase db reset
```

---

## Skrypty pomocnicze

### Skrypt do czyszczenia danych testowych

```sql
-- Usuń wszystkie transakcje testowe
DELETE FROM transactions
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e';

-- Zresetuj monthly_metrics
DELETE FROM monthly_metrics
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e';

-- Wyczyść audit_log
DELETE FROM audit_log
WHERE owner_user_id = '4eef0567-df09-4a61-9219-631def0eb53e';
```

### Skrypt do sprawdzenia wszystkich transakcji

```sql
SELECT
  t.id,
  t.type,
  t.category_code,
  tc.label_pl,
  t.amount_cents,
  t.occurred_on,
  t.note,
  t.created_at,
  t.updated_at
FROM transactions t
LEFT JOIN transaction_categories tc ON t.category_code = tc.code
WHERE t.user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND t.deleted_at IS NULL
ORDER BY t.occurred_on DESC, t.created_at DESC;
```

---

## Następne kroki po testach

1. ✅ Wszystkie testy przeszły → Endpoint gotowy do użycia
2. 📝 Commit zmian do repozytorium
3. 🔄 Implementacja kolejnych endpointów (DELETE /api/v1/transactions/:id)
4. 🔐 Implementacja auth middleware (przyszła iteracja)

---

**Powodzenia w testowaniu! 🚀**

Jeśli napotkasz problemy nie opisane w tym przewodniku, sprawdź:

- Console.error w terminalu dev server
- Logi Supabase w Dashboard → Logs
- Plan implementacji w `.ai/patch-transaction-implementation-plan.md`
