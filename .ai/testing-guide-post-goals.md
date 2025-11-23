# Przewodnik testowania: POST /api/v1/goals

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
- `20251109120000_create_base_schema.sql` - tworzy goal_types i seed data
- `20251109120100_create_business_tables.sql` - tworzy tabelę goals
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

### Krok 4: Sprawdź dostępne typy celów

```sql
-- Lista wszystkich aktywnych typów celów
SELECT code, label_pl, is_active 
FROM goal_types 
WHERE is_active = true
ORDER BY code;
```

**Oczekiwany wynik** (11 typów):
- `AUTO` - Samochód
- `EDUCATION` - Edukacja
- `ELECTRONICS` - Elektronika
- `EMERGENCY` - Fundusz awaryjny
- `HOUSE` - Dom/Mieszkanie
- `INVESTMENT` - Inwestycje
- `OTHER` - Inny cel
- `RENOVATION` - Remont
- `RETIREMENT` - Emerytura
- `VACATION` - Wakacje
- `WEDDING` - Ślub

### Krok 5: Uruchom dev server

```bash
npm run dev
```

Server powinien być dostępny pod `http://localhost:3004`

💡 **Tip**: Script `predev` automatycznie zwalnia port 3004 przed uruchomieniem.

---

## Scenariusze testowe

### Test 1: ✅ Sukces - Utworzenie celu bez priorytetu

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/goals \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Wakacje w Grecji",
    "type_code": "VACATION",
    "target_amount_cents": 500000
  }'
```

**Oczekiwana odpowiedź:** `201 Created`
```json
{
  "id": "uuid",
  "name": "Wakacje w Grecji",
  "type_code": "VACATION",
  "type_label": "Wakacje",
  "target_amount_cents": 500000,
  "current_balance_cents": 0,
  "progress_percentage": 0.0,
  "is_priority": false,
  "archived_at": null,
  "created_at": "2025-11-23T...",
  "updated_at": "2025-11-23T..."
}
```

---

### Test 2: ✅ Sukces - Utworzenie celu z priorytetem

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/goals \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Fundusz awaryjny",
    "type_code": "EMERGENCY",
    "target_amount_cents": 1000000,
    "is_priority": true
  }'
```

**Oczekiwana odpowiedź:** `201 Created`
```json
{
  "id": "uuid",
  "name": "Fundusz awaryjny",
  "type_code": "EMERGENCY",
  "type_label": "Fundusz awaryjny",
  "target_amount_cents": 1000000,
  "current_balance_cents": 0,
  "progress_percentage": 0.0,
  "is_priority": true,
  "archived_at": null,
  "created_at": "2025-11-23T...",
  "updated_at": "2025-11-23T..."
}
```

---

### Test 3: ❌ Błąd 400 - Brak wymaganych pól

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/goals \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Wakacje"
  }'
```

**Oczekiwana odpowiedź:** `400 Bad Request`
```json
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "type_code": "Goal type code is required",
    "target_amount_cents": "Target amount is required"
  }
}
```

---

### Test 4: ❌ Błąd 400 - Niewłaściwy typ danych

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/goals \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Wakacje",
    "type_code": "VACATION",
    "target_amount_cents": "not a number",
    "is_priority": "not a boolean"
  }'
```

**Oczekiwana odpowiedź:** `400 Bad Request`
```json
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "target_amount_cents": "Target amount must be a number",
    "is_priority": "Expected boolean, received string"
  }
}
```

---

### Test 5: ❌ Błąd 400 - Nieprawidłowa wartość target_amount_cents

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/goals \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Wakacje",
    "type_code": "VACATION",
    "target_amount_cents": -1000
  }'
```

**Oczekiwana odpowiedź:** `400 Bad Request`
```json
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "target_amount_cents": "Target amount must be greater than 0"
  }
}
```

---

### Test 6: ❌ Błąd 400 - Nazwa zbyt długa

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/goals \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$(printf 'A%.0s' {1..101})\",
    \"type_code\": \"VACATION\",
    \"target_amount_cents\": 100000
  }"
```

**Oczekiwana odpowiedź:** `400 Bad Request`
```json
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "name": "Name cannot exceed 100 characters"
  }
}
```

---

### Test 7: ❌ Błąd 400 - Pusta nazwa

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/goals \
  -H "Content-Type: application/json" \
  -d '{
    "name": "",
    "type_code": "VACATION",
    "target_amount_cents": 100000
  }'
```

**Oczekiwana odpowiedź:** `400 Bad Request`
```json
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "name": "Name is required"
  }
}
```

---

### Test 8: ❌ Błąd 409 - Konflikt priorytetu

**⚠️ Uwaga**: Ten test wymaga, aby wcześniej został utworzony cel z `is_priority: true` (Test 2)

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/goals \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nowy samochód",
    "type_code": "AUTO",
    "target_amount_cents": 8000000,
    "is_priority": true
  }'
```

**Oczekiwana odpowiedź:** `409 Conflict`
```json
{
  "error": "Conflict",
  "message": "Another goal is already marked as priority",
  "details": {
    "is_priority": "Only one goal can be marked as priority at a time"
  }
}
```

---

### Test 9: ❌ Błąd 422 - Nieistniejący type_code

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/goals \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Cel testowy",
    "type_code": "NONEXISTENT",
    "target_amount_cents": 100000
  }'
```

**Oczekiwana odpowiedź:** `422 Unprocessable Entity`
```json
{
  "error": "Unprocessable Entity",
  "message": "Goal type code does not exist or is inactive",
  "details": {
    "type_code": "NONEXISTENT"
  }
}
```

---

### Test 10: ✅ Edge case - Nazwa z maksymalną długością (100 znaków)

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/goals \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$(printf 'A%.0s' {1..100})\",
    \"type_code\": \"OTHER\",
    \"target_amount_cents\": 50000
  }"
```

**Oczekiwana odpowiedź:** `201 Created`
```json
{
  "id": "uuid",
  "name": "AAAA...AAAA",
  "type_code": "OTHER",
  "type_label": "Inny cel",
  "target_amount_cents": 50000,
  "current_balance_cents": 0,
  "progress_percentage": 0.0,
  "is_priority": false,
  "archived_at": null,
  "created_at": "2025-11-23T...",
  "updated_at": "2025-11-23T..."
}
```

---

### Test 11: ✅ Edge case - Bardzo duża kwota docelowa

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/goals \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dom marzeń",
    "type_code": "HOUSE",
    "target_amount_cents": 100000000
  }'
```

**Oczekiwana odpowiedź:** `201 Created`

💡 **Notatka**: 100,000,000 groszy = 1,000,000 PLN (milion złotych)

---

### Test 12: ✅ Edge case - Minimalna kwota docelowa

**Request:**
```bash
curl -X POST http://localhost:3004/api/v1/goals \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test minimalnej kwoty",
    "type_code": "OTHER",
    "target_amount_cents": 1
  }'
```

**Oczekiwana odpowiedź:** `201 Created`

💡 **Notatka**: 1 grosz = 0.01 PLN (minimalna kwota)

---

## Weryfikacja w bazie danych

Po testach sukcesu (Testy 1, 2, 10, 11, 12), sprawdź dane w bazie:

### Sprawdź utworzone cele

```sql
-- Sprawdź wszystkie utworzone cele
SELECT 
  g.id, 
  g.name, 
  g.type_code, 
  gt.label_pl,
  g.target_amount_cents,
  g.current_balance_cents,
  g.is_priority,
  g.archived_at,
  g.created_at
FROM goals g
JOIN goal_types gt ON g.type_code = gt.code
WHERE g.user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
ORDER BY g.created_at DESC;
```

**Oczekiwany wynik**:
- ✅ 5 celów utworzonych (z Testów 1, 2, 10, 11, 12)
- ✅ Wszystkie mają `current_balance_cents = 0`
- ✅ Wszystkie mają `archived_at = NULL`
- ✅ Dokładnie jeden cel ma `is_priority = true` (Test 2)

### Sprawdź constraint priorytetu

```sql
-- Zlicz cele priorytetowe (max 1)
SELECT COUNT(*) as priority_count
FROM goals
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND is_priority = true
  AND archived_at IS NULL
  AND deleted_at IS NULL;
```

**Oczekiwany wynik**: `priority_count = 1` (tylko z Test 2)

### Sprawdź domyślne wartości

```sql
-- Sprawdź domyślne wartości dla pierwszego celu
SELECT 
  current_balance_cents,
  archived_at,
  deleted_at,
  is_priority
FROM goals
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND name = 'Wakacje w Grecji';
```

**Oczekiwane wartości**:
- `current_balance_cents = 0` ✅
- `archived_at = NULL` ✅
- `deleted_at = NULL` ✅
- `is_priority = false` ✅ (jeśli nie ustawiono w request)

### Sprawdź walidację na poziomie bazy

```sql
-- Spróbuj utworzyć cel z nieprawidłową kwotą (powinno się nie udać)
-- Ten test należy wykonać w Supabase SQL Editor
INSERT INTO goals (user_id, name, type_code, target_amount_cents, created_by, updated_by)
VALUES (
  '4eef0567-df09-4a61-9219-631def0eb53e',
  'Test invalid',
  'VACATION',
  -100,
  '4eef0567-df09-4a61-9219-631def0eb53e',
  '4eef0567-df09-4a61-9219-631def0eb53e'
);
```

**Oczekiwany wynik**: `ERROR: new row for relation "goals" violates check constraint "goals_target_amount_cents_check"`

---

## Checklist testów

- [ ] Test 1: Sukces bez priorytetu (201)
- [ ] Test 2: Sukces z priorytetem (201)
- [ ] Test 3: Brak pól (400)
- [ ] Test 4: Złe typy danych (400)
- [ ] Test 5: Ujemna kwota (400)
- [ ] Test 6: Nazwa za długa (400)
- [ ] Test 7: Pusta nazwa (400)
- [ ] Test 8: Konflikt priorytetu (409)
- [ ] Test 9: Nieistniejący type_code (422)
- [ ] Test 10: Max długość nazwy (201)
- [ ] Test 11: Bardzo duża kwota (201)
- [ ] Test 12: Minimalna kwota (201)
- [ ] Weryfikacja w bazie: goals
- [ ] Weryfikacja w bazie: priority constraint
- [ ] Weryfikacja w bazie: domyślne wartości
- [ ] Weryfikacja w bazie: check constraints

---

## Troubleshooting

### Problem: 500 Internal Server Error (ogólny)

**Diagnostyka**: Sprawdź console.error w terminalu gdzie działa dev server.

**Częste przyczyny**:
1. Brak połączenia z Supabase - sprawdź `SUPABASE_URL` i `SUPABASE_KEY`
2. Błędne dane w `.env` - upewnij się, że nie ma spacji wokół wartości
3. Dev server wymaga restartu po zmianie `.env`

### Problem: "Goal type code does not exist" (422)

**Rozwiązanie**: Typy celów nie zostały załadowane. Uruchom migracje:
```bash
npx supabase db reset
```

Sprawdź w Supabase Studio czy tabela `goal_types` ma dane:
```sql
SELECT * FROM goal_types;
```

### Problem: RLS error mimo wyłączonego RLS

**Rozwiązanie**: Migracja `20251111090000_disable_rls_for_development.sql` nie została uruchomiona.

```bash
# Sprawdź status RLS
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('goals', 'goal_types');
```

Oczekiwany wynik: `rowsecurity = false` dla obu tabel.

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

### Problem: Constraint violation przy próbie utworzenia drugiego priorytetu

**Diagnostyka**:
```sql
-- Sprawdź czy istnieje już cel priorytetowy
SELECT id, name, is_priority 
FROM goals 
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND is_priority = true
  AND archived_at IS NULL
  AND deleted_at IS NULL;
```

**Rozwiązanie**: To poprawne zachowanie! Endpoint powinien zwrócić 409 Conflict (Test 8). 
Jeśli chcesz utworzyć nowy priorytet:
1. Usuń/archiwizuj poprzedni priorytetowy cel ALBO
2. Zmień `is_priority` na `false` w poprzednim celu:
```sql
UPDATE goals 
SET is_priority = false, updated_at = now()
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND is_priority = true;
```

### Problem: progress_percentage nie jest 0.0 dla nowych celów

**Rozwiązanie**: To błąd w implementacji service layer. Sprawdź funkcję `createGoal()`:
- `current_balance_cents` powinien być 0 dla nowych celów
- `progress_percentage` powinien być wyliczany jako `(0 / target_amount_cents) * 100 = 0.0`

### Problem: type_label nie jest zwracany w response

**Diagnostyka**: Sprawdź czy JOIN z `goal_types` działa poprawnie:
```sql
SELECT 
  g.*,
  gt.label_pl
FROM goals g
INNER JOIN goal_types gt ON g.type_code = gt.code
WHERE g.user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
LIMIT 1;
```

**Rozwiązanie**: Jeśli JOIN nie działa, sprawdź czy:
1. Migracje zostały uruchomione poprawnie
2. Tabela `goal_types` ma dane
3. Foreign key między `goals.type_code` i `goal_types.code` istnieje

---

## Czyszczenie danych testowych

Po zakończeniu testów możesz wyczyścić utworzone cele:

```sql
-- UWAGA: To usunie WSZYSTKIE cele test usera
DELETE FROM goals 
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e';
```

Lub soft-delete (preferowane):
```sql
UPDATE goals 
SET 
  deleted_at = now(),
  deleted_by = user_id
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e';
```

---

## Następne kroki po testach

1. ✅ Wszystkie testy przeszły → Endpoint gotowy do użycia
2. 🔄 Implementacja GET /api/v1/goals (lista celów)
3. 🔄 Implementacja GET /api/v1/goals/:id (szczegóły celu)
4. 🔄 Implementacja PATCH /api/v1/goals/:id (aktualizacja celu)
5. 🔄 Implementacja POST /api/v1/goals/:id/archive (archiwizacja celu)
6. 📝 Dokumentacja API (opcjonalnie Swagger/OpenAPI)
7. 🔐 Implementacja pełnego auth middleware (przyszła iteracja)

---

## Notatki dla developera

### Różnice między transakcjami a celami

**Transakcje** (transactions):
- Wymagają `client_request_id` dla idempotencji (zapobieganie duplikatom)
- Mają constraint na `occurred_on <= current_date` (nie można w przyszłości)
- Mają trigger aktualizujący `monthly_metrics`
- Mają audit log dla CREATE/UPDATE/DELETE

**Cele** (goals):
- NIE wymagają `client_request_id` (brak idempotencji na tym etapie)
- Mają constraint priorytetu (tylko 1 aktywny priorytet na użytkownika)
- Mają `current_balance_cents` aktualizowany przez `goal_events`
- Początkowe saldo zawsze = 0

### Walidacja trójwarstwowa

1. **Zod Schema** (Krok 1): Format, typ, długość, wartość
2. **Service Layer** (Krok 2-3): Logika biznesowa (typ celu, priorytet)
3. **Database Constraints** (Krok 4): Ostateczna bariera bezpieczeństwa

Jeśli walidacja przechodzi przez wszystkie 3 warstwy → dane są poprawne ✅

