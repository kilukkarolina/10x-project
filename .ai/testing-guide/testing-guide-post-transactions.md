# Przewodnik testowania: POST /api/v1/transactions

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

### Krok 4: Uruchom dev server

```bash
npm run dev
```

Server powinien być dostępny pod `http://localhost:3004`

💡 **Tip**: Script `predev` automatycznie zwalnia port 3004 przed uruchomieniem.

---

## Scenariusze testowe

### Test 1: ✅ Sukces - Utworzenie EXPENSE

**Request:**
```bash
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
```

**Oczekiwana odpowiedź:** `201 Created`
```json
{
  "id": "uuid",
  "type": "EXPENSE",
  "category_code": "GROCERIES",
  "category_label": "Zakupy spożywcze",
  "amount_cents": 15750,
  "occurred_on": "2025-11-10",
  "note": "Zakupy w Biedronce",
  "created_at": "2025-11-11T...",
  "updated_at": "2025-11-11T..."
}
```

---

### Test 2: ✅ Sukces - Utworzenie INCOME

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INCOME",
    "category_code": "SALARY",
    "amount_cents": 500000,
    "occurred_on": "2025-11-01",
    "note": null,
    "client_request_id": "550e8400-e29b-41d4-a716-446655440002"
  }'
```

**Oczekiwana odpowiedź:** `201 Created`

---

### Test 3: ❌ Błąd 400 - Brak wymaganych pól

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "amount_cents": 1000
  }'
```

**Oczekiwana odpowiedź:** `400 Bad Request`
```json
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "category_code": "Category code is required",
    "occurred_on": "Required",
    "client_request_id": "Required"
  }
}
```

---

### Test 4: ❌ Błąd 400 - Niewłaściwy typ danych

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "GROCERIES",
    "amount_cents": "not a number",
    "occurred_on": "invalid-date",
    "client_request_id": "not-a-uuid"
  }'
```

**Oczekiwana odpowiedź:** `400 Bad Request`
```json
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "amount_cents": "Amount must be a number",
    "occurred_on": "Date must be in YYYY-MM-DD format",
    "client_request_id": "Client request ID must be a valid UUID"
  }
}
```

---

### Test 5: ❌ Błąd 400 - Data w przyszłości

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "GROCERIES",
    "amount_cents": 1000,
    "occurred_on": "2026-12-31",
    "client_request_id": "550e8400-e29b-41d4-a716-446655440003"
  }'
```

**Oczekiwana odpowiedź:** `400 Bad Request`
```json
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "occurred_on": "Transaction date cannot be in the future"
  }
}
```

---

### Test 6: ❌ Błąd 409 - Duplikat client_request_id (idempotencja)

**Request:** (powtórz request z Test 1)
```bash
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
```

**Oczekiwana odpowiedź:** `409 Conflict`
```json
{
  "error": "Conflict",
  "message": "Transaction with this client_request_id already exists"
}
```

---

### Test 7: ❌ Błąd 422 - Nieistniejąca kategoria

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "NONEXISTENT",
    "amount_cents": 1000,
    "occurred_on": "2025-11-10",
    "client_request_id": "550e8400-e29b-41d4-a716-446655440004"
  }'
```

**Oczekiwana odpowiedź:** `422 Unprocessable Entity`
```json
{
  "error": "Unprocessable Entity",
  "message": "Category code does not exist or is inactive",
  "details": {
    "category_code": "NONEXISTENT"
  }
}
```

---

### Test 8: ❌ Błąd 422 - Niezgodność typu kategorii

**Request:** (GROCERIES to EXPENSE, ale próbujemy użyć dla INCOME)
```bash
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INCOME",
    "category_code": "GROCERIES",
    "amount_cents": 1000,
    "occurred_on": "2025-11-10",
    "client_request_id": "550e8400-e29b-41d4-a716-446655440005"
  }'
```

**Oczekiwana odpowiedź:** `422 Unprocessable Entity`
```json
{
  "error": "Unprocessable Entity",
  "message": "Category GROCERIES is not valid for INCOME transactions",
  "details": {
    "category_code": "Category kind EXPENSE does not match transaction type INCOME"
  }
}
```

---

### Test 9: ✅ Edge case - Notatka z maksymalną długością

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"EXPENSE\",
    \"category_code\": \"GROCERIES\",
    \"amount_cents\": 1000,
    \"occurred_on\": \"2025-11-10\",
    \"note\": \"$(printf 'a%.0s' {1..500})\",
    \"client_request_id\": \"550e8400-e29b-41d4-a716-446655440006\"
  }"
```

**Oczekiwana odpowiedź:** `201 Created`

---

### Test 10: ❌ Błąd 400 - Notatka zbyt długa

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"EXPENSE\",
    \"category_code\": \"GROCERIES\",
    \"amount_cents\": 1000,
    \"occurred_on\": \"2025-11-10\",
    \"note\": \"$(printf 'a%.0s' {1..501})\",
    \"client_request_id\": \"550e8400-e29b-41d4-a716-446655440007\"
  }"
```

**Oczekiwana odpowiedź:** `400 Bad Request`
```json
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "note": "Note cannot exceed 500 characters"
  }
}
```

---

## Weryfikacja w bazie danych

Po testach 1 i 2 (sukcesy), sprawdź dane w bazie:

```sql
-- Sprawdź utworzone transakcje
SELECT * FROM transactions 
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
ORDER BY created_at DESC;

-- Sprawdź czy monthly_metrics się zaktualizował (trigger)
SELECT * FROM monthly_metrics
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
ORDER BY month DESC;

-- Sprawdź audit_log (trigger)
SELECT * FROM audit_log
WHERE owner_user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
ORDER BY performed_at DESC;
```

---

## Checklist testów

- [ ] Test 1: Sukces EXPENSE (201)
- [ ] Test 2: Sukces INCOME (201)
- [ ] Test 3: Brak pól (400)
- [ ] Test 4: Złe typy danych (400)
- [ ] Test 5: Data w przyszłości (400)
- [ ] Test 6: Duplikat client_request_id (409)
- [ ] Test 7: Nieistniejąca kategoria (422)
- [ ] Test 8: Niezgodność typu (422)
- [ ] Test 9: Max długość notatki (201)
- [ ] Test 10: Notatka za długa (400)
- [ ] Weryfikacja w bazie: transactions
- [ ] Weryfikacja w bazie: monthly_metrics
- [ ] Weryfikacja w bazie: audit_log

---

## Troubleshooting

### Problem: 500 Internal Server Error (ogólny)

**Diagnostyka**: Sprawdź console.error w terminalu gdzie działa dev server.

**Częste przyczyny**:
1. Brak połączenia z Supabase - sprawdź `SUPABASE_URL` i `SUPABASE_KEY`
2. Błędne dane w `.env` - upewnij się, że nie ma spacji wokół wartości
3. Dev server wymaga restartu po zmianie `.env`

### Problem: "Category code does not exist" (422)

**Rozwiązanie**: Kategorie nie zostały załadowane. Uruchom migracje:
```bash
npx supabase db reset
```

Sprawdź w Supabase Studio czy tabela `transaction_categories` ma dane:
```sql
SELECT * FROM transaction_categories;
```

### Problem: RLS error mimo wyłączonego RLS

**Rozwiązanie**: Migracja `20251111090000_disable_rls_for_development.sql` nie została uruchomiona.

```bash
# Sprawdź status RLS
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('transactions', 'goals', 'goal_events', 'monthly_metrics');
```

Oczekiwany wynik: `rowsecurity = false` dla wszystkich tabel.

Jeśli `rowsecurity = true`, uruchom:
```bash
npx supabase migration up
```

### Problem: User not found w profiles

**Rozwiązanie**: Migracja `20251109120500_seed_test_user.sql` nie została uruchomiona lub test user nie istnieje w `auth.users`.

1. Sprawdź czy user jest w auth.users (Supabase Studio → Authentication)
2. Uruchom migrację:
```bash
npx supabase migration up
```

### Problem: Trigger nie aktualizuje monthly_metrics

**Diagnostyka**:
```sql
-- Sprawdź czy trigger istnieje
SELECT * FROM pg_trigger 
WHERE tgname LIKE '%monthly_metrics%';

-- Sprawdź monthly_metrics po dodaniu transakcji
SELECT * FROM monthly_metrics
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e';
```

**Rozwiązanie**: Trigger nie został stworzony. Sprawdź migracje:
```bash
npx supabase db reset
```

---

## Następne kroki po testach

1. ✅ Wszystkie testy przeszły → Endpoint gotowy do użycia
2. 📝 Dokumentacja API (opcjonalnie Swagger/OpenAPI)
3. 🔐 Implementacja pełnego auth middleware (przyszła iteracja)
4. 🚀 Implementacja kolejnych endpointów zgodnie z api-plan.md

