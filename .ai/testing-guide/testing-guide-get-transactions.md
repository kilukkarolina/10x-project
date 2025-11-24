# Przewodnik testowania: GET /api/v1/transactions

## Przegląd endpointa

Endpoint **GET /api/v1/transactions** służy do pobierania listy transakcji użytkownika z możliwością:

- Filtrowania po miesiącu, typie transakcji i kategorii
- Wyszukiwania pełnotekstowego w notatkach
- Cursor-based pagination (keyset) dla wydajnego przeglądania
- Agregacji metadanych (suma kwot, liczba transakcji na stronie)

---

## Przygotowanie do testów

### Krok 1: Sprawdź dane testowe w bazie

Endpoint wymaga istniejących transakcji do przetestowania. Możesz użyć POST endpoint lub dodać dane ręcznie:

```sql
-- Sprawdź istniejące transakcje test usera
SELECT
  id, type, category_code, amount_cents, occurred_on,
  note, created_at
FROM transactions
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND deleted_at IS NULL
ORDER BY occurred_on DESC, id DESC;
```

### Krok 2: Dodaj testowe dane (jeśli brak)

```bash
# Transakcja 1: EXPENSE - Listopad
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "GROCERIES",
    "amount_cents": 15750,
    "occurred_on": "2025-11-10",
    "note": "Zakupy w Biedronce",
    "client_request_id": "get-test-001"
  }'

# Transakcja 2: EXPENSE - Listopad
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "TRANSPORT",
    "amount_cents": 4500,
    "occurred_on": "2025-11-08",
    "note": "Bilet autobusowy",
    "client_request_id": "get-test-002"
  }'

# Transakcja 3: INCOME - Listopad
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INCOME",
    "category_code": "SALARY",
    "amount_cents": 500000,
    "occurred_on": "2025-11-01",
    "note": "Wynagrodzenie za październik",
    "client_request_id": "get-test-003"
  }'

# Transakcja 4: EXPENSE - Październik
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "GROCERIES",
    "amount_cents": 8200,
    "occurred_on": "2025-10-25",
    "note": "Zakupy spożywcze",
    "client_request_id": "get-test-004"
  }'

# Transakcja 5: EXPENSE - Październik
curl -X POST http://localhost:3004/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "type": "EXPENSE",
    "category_code": "ENTERTAINMENT",
    "amount_cents": 12000,
    "occurred_on": "2025-10-15",
    "note": "Kino z rodziną",
    "client_request_id": "get-test-005"
  }'
```

### Krok 3: Uruchom dev server

```bash
npm run dev
```

Server dostępny pod: `http://localhost:3004`

---

## Scenariusze testowe

### Test 1: ✅ Podstawowe pobieranie - wszystkie transakcje

**Request:**

```bash
curl -s http://localhost:3004/api/v1/transactions | jq .
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "data": [
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
    // ... więcej transakcji
  ],
  "pagination": {
    "next_cursor": null, // lub string jeśli jest więcej niż 50 transakcji
    "has_more": false,
    "limit": 50
  },
  "meta": {
    "total_amount_cents": 540450, // suma wszystkich amount_cents na stronie
    "count": 5 // liczba transakcji na stronie
  }
}
```

**Weryfikacja:**

- ✅ `data` to tablica transakcji
- ✅ Sortowanie DESC po `occurred_on`, potem `id`
- ✅ Każda transakcja ma `category_label` (JOIN z transaction_categories)
- ✅ `meta.count` = długość tablicy `data`
- ✅ `meta.total_amount_cents` = suma wszystkich amount_cents

---

### Test 2: ✅ Filtrowanie po typie - tylko wydatki (EXPENSE)

**Request:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?type=EXPENSE" | jq .
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "data": [
    // Tylko transakcje z type: "EXPENSE"
  ],
  "pagination": { ... },
  "meta": {
    "total_amount_cents": 40450,  // suma tylko wydatków
    "count": 4
  }
}
```

**Weryfikacja:**

```bash
# Sprawdź że wszystkie transakcje to EXPENSE
curl -s "http://localhost:3004/api/v1/transactions?type=EXPENSE" | jq '[.data[].type] | unique'
# Oczekiwany wynik: ["EXPENSE"]
```

---

### Test 3: ✅ Filtrowanie po typie - tylko przychody (INCOME)

**Request:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?type=INCOME" | jq .
```

**Weryfikacja:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?type=INCOME" | jq '{count: .meta.count, types: [.data[].type] | unique}'
# Oczekiwany wynik: {"count": 1, "types": ["INCOME"]}
```

---

### Test 4: ✅ Filtrowanie po typie - wszystkie (ALL, domyślnie)

**Request:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?type=ALL" | jq .
```

**Weryfikacja:**

```bash
# Powinno zwrócić zarówno INCOME jak i EXPENSE
curl -s "http://localhost:3004/api/v1/transactions?type=ALL" | jq '[.data[].type] | unique | sort'
# Oczekiwany wynik: ["EXPENSE", "INCOME"]
```

---

### Test 5: ✅ Filtrowanie po miesiącu

**Request:**

```bash
# Transakcje z listopada 2025
curl -s "http://localhost:3004/api/v1/transactions?month=2025-11" | jq .
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "data": [
    // Tylko transakcje z occurred_on w listopadzie 2025
  ],
  "pagination": { ... },
  "meta": {
    "total_amount_cents": 520250,
    "count": 3
  }
}
```

**Weryfikacja:**

```bash
# Sprawdź daty transakcji
curl -s "http://localhost:3004/api/v1/transactions?month=2025-11" | jq '[.data[].occurred_on] | unique'
# Wszystkie daty powinny zaczynać się od "2025-11"
```

**Test z innym miesiącem:**

```bash
# Transakcje z października 2025
curl -s "http://localhost:3004/api/v1/transactions?month=2025-10" | jq '{count: .meta.count, dates: [.data[].occurred_on] | unique}'
```

---

### Test 6: ✅ Filtrowanie po kategorii

**Request:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?category=GROCERIES" | jq .
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "data": [
    // Tylko transakcje z category_code: "GROCERIES"
  ],
  "pagination": { ... },
  "meta": {
    "total_amount_cents": 23950,
    "count": 2
  }
}
```

**Weryfikacja:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?category=GROCERIES" | jq '{count: .meta.count, categories: [.data[].category_code] | unique}'
# Oczekiwany wynik: {"count": 2, "categories": ["GROCERIES"]}
```

---

### Test 7: ✅ Wyszukiwanie pełnotekstowe w notatkach

**Request:**

```bash
# Wyszukaj transakcje z "Biedronce" w notatce
curl -s "http://localhost:3004/api/v1/transactions?search=Biedronce" | jq .
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "data": [
    {
      "id": "...",
      "note": "Zakupy w Biedronce",
      // ...
    }
  ],
  "pagination": { ... },
  "meta": {
    "total_amount_cents": 15750,
    "count": 1
  }
}
```

**Inne przykłady wyszukiwania:**

```bash
# Case-insensitive search
curl -s "http://localhost:3004/api/v1/transactions?search=zakupy" | jq '.meta.count'

# Częściowe dopasowanie
curl -s "http://localhost:3004/api/v1/transactions?search=kino" | jq '.data[0].note'
```

---

### Test 8: ✅ Paginacja - limit

**Request:**

```bash
# Pobierz tylko 2 transakcje na stronę
curl -s "http://localhost:3004/api/v1/transactions?limit=2" | jq .
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "data": [
    // Dokładnie 2 transakcje
  ],
  "pagination": {
    "next_cursor": "MjAyNS0xMS0wOF9hYmNkZWYxMjM=", // base64-encoded
    "has_more": true,
    "limit": 2
  },
  "meta": {
    "total_amount_cents": 20250, // suma tylko tych 2 transakcji
    "count": 2
  }
}
```

**Weryfikacja:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?limit=2" | jq '{count: .meta.count, has_more: .pagination.has_more, next_cursor_present: (.pagination.next_cursor != null)}'
# Oczekiwany wynik: {"count": 2, "has_more": true, "next_cursor_present": true}
```

---

### Test 9: ✅ Paginacja - cursor (kolejna strona)

**Request:**

```bash
# Krok 1: Pobierz pierwszą stronę i zapisz cursor
CURSOR=$(curl -s "http://localhost:3004/api/v1/transactions?limit=2" | jq -r '.pagination.next_cursor')
echo "Cursor: $CURSOR"

# Krok 2: Użyj cursora do pobrania następnej strony
curl -s "http://localhost:3004/api/v1/transactions?cursor=$CURSOR&limit=2" | jq .
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "data": [
    // Następne 2 transakcje (inne niż na pierwszej stronie)
  ],
  "pagination": {
    "next_cursor": "MjAyNS0xMC0yNV9kZWYxMjM0NTY=",
    "has_more": true,
    "limit": 2
  },
  "meta": {
    "total_amount_cents": 508200,
    "count": 2
  }
}
```

**Weryfikacja paginacji:**

```bash
# Pobierz ID z pierwszej strony
FIRST_IDS=$(curl -s "http://localhost:3004/api/v1/transactions?limit=2" | jq '[.data[].id]')

# Pobierz ID z drugiej strony
CURSOR=$(curl -s "http://localhost:3004/api/v1/transactions?limit=2" | jq -r '.pagination.next_cursor')
SECOND_IDS=$(curl -s "http://localhost:3004/api/v1/transactions?cursor=$CURSOR&limit=2" | jq '[.data[].id]')

echo "First page IDs: $FIRST_IDS"
echo "Second page IDs: $SECOND_IDS"
# ID nie powinny się powtarzać
```

---

### Test 10: ✅ Paginacja - ostatnia strona

**Request:**

```bash
# Ustaw limit większy niż liczba transakcji
curl -s "http://localhost:3004/api/v1/transactions?limit=100" | jq .
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "data": [
    // Wszystkie transakcje (np. 5)
  ],
  "pagination": {
    "next_cursor": null, // brak kolejnej strony
    "has_more": false,
    "limit": 100
  },
  "meta": {
    "total_amount_cents": 540450,
    "count": 5
  }
}
```

**Weryfikacja:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?limit=100" | jq '{has_more: .pagination.has_more, next_cursor: .pagination.next_cursor}'
# Oczekiwany wynik: {"has_more": false, "next_cursor": null}
```

---

### Test 11: ✅ Kombinacja filtrów - type + month

**Request:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?type=EXPENSE&month=2025-11" | jq .
```

**Weryfikacja:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?type=EXPENSE&month=2025-11" | jq '{count: .meta.count, types: [.data[].type] | unique, months: [.data[].occurred_on | split("-")[0:2] | join("-")] | unique}'
# Powinno zwrócić tylko EXPENSE z listopada 2025
```

---

### Test 12: ✅ Kombinacja filtrów - type + category + limit

**Request:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?type=EXPENSE&category=GROCERIES&limit=5" | jq .
```

**Weryfikacja:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?type=EXPENSE&category=GROCERIES&limit=5" | jq '{count: .meta.count, total: .meta.total_amount_cents, types: [.data[].type] | unique, categories: [.data[].category_code] | unique}'
```

---

### Test 13: ✅ Kombinacja filtrów - month + search

**Request:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?month=2025-11&search=zakupy" | jq .
```

---

### Test 14: ❌ Błąd 400 - Nieprawidłowy format miesiąca

**Request:**

```bash
# Brak zera wiodącego (powinno być YYYY-MM)
curl -s "http://localhost:3004/api/v1/transactions?month=2025-1" | jq .
```

**Oczekiwana odpowiedź:** `400 Bad Request`

```json
{
  "error": "Bad Request",
  "message": "Invalid query parameters",
  "details": {
    "month": "Month must be in YYYY-MM format"
  }
}
```

**Inne nieprawidłowe formaty:**

```bash
# Nieprawidłowy format
curl -s "http://localhost:3004/api/v1/transactions?month=11-2025" | jq .

# Tylko rok
curl -s "http://localhost:3004/api/v1/transactions?month=2025" | jq .
```

---

### Test 15: ❌ Błąd 400 - Limit poza zakresem

**Request:**

```bash
# Limit > 100 (maksimum)
curl -s "http://localhost:3004/api/v1/transactions?limit=150" | jq .
```

**Oczekiwana odpowiedź:** `400 Bad Request`

```json
{
  "error": "Bad Request",
  "message": "Invalid query parameters",
  "details": {
    "limit": "Number must be less than or equal to 100"
  }
}
```

**Test z limitem = 0:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?limit=0" | jq .
# Oczekiwana odpowiedź: 400 - "Number must be greater than or equal to 1"
```

**Test z limitem ujemnym:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?limit=-5" | jq .
# Oczekiwana odpowiedź: 400
```

---

### Test 16: ❌ Błąd 400 - Nieprawidłowy cursor

**Request:**

```bash
# Cursor nie w formacie base64
curl -s "http://localhost:3004/api/v1/transactions?cursor=invalid123" | jq .
```

**Oczekiwana odpowiedź:** `400 Bad Request`

```json
{
  "error": "Bad Request",
  "message": "Invalid cursor format",
  "details": {
    "cursor": "Invalid cursor format"
  }
}
```

**Inne nieprawidłowe cursory:**

```bash
# Base64 ale nieprawidłowa struktura wewnątrz
curl -s "http://localhost:3004/api/v1/transactions?cursor=$(echo -n "invalid_structure" | base64)" | jq .

# Base64 ale nieprawidłowa data
curl -s "http://localhost:3004/api/v1/transactions?cursor=$(echo -n "2025-13-45_550e8400-e29b-41d4-a716-446655440001" | base64)" | jq .

# Base64 ale nieprawidłowy UUID
curl -s "http://localhost:3004/api/v1/transactions?cursor=$(echo -n "2025-11-10_not-a-uuid" | base64)" | jq .
```

---

### Test 17: ❌ Błąd 400 - Nieprawidłowy typ transakcji

**Request:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?type=INVALID" | jq .
```

**Oczekiwana odpowiedź:** `400 Bad Request`

```json
{
  "error": "Bad Request",
  "message": "Invalid query parameters",
  "details": {
    "type": "Invalid enum value. Expected 'INCOME' | 'EXPENSE' | 'ALL', received 'INVALID'"
  }
}
```

---

### Test 18: ✅ Edge case - Pusta lista (brak transakcji dla filtrów)

**Request:**

```bash
# Miesiąc bez transakcji
curl -s "http://localhost:3004/api/v1/transactions?month=2020-01" | jq .
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "data": [],
  "pagination": {
    "next_cursor": null,
    "has_more": false,
    "limit": 50
  },
  "meta": {
    "total_amount_cents": 0,
    "count": 0
  }
}
```

---

### Test 19: ✅ Edge case - Limit = 1

**Request:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?limit=1" | jq .
```

**Weryfikacja:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?limit=1" | jq '{count: .meta.count, has_more: .pagination.has_more}'
# Oczekiwany wynik: {"count": 1, "has_more": true} (jeśli są więcej transakcji)
```

---

### Test 20: ✅ Edge case - Wyszukiwanie bez wyników

**Request:**

```bash
curl -s "http://localhost:3004/api/v1/transactions?search=nonexistenttext12345" | jq .
```

**Oczekiwana odpowiedź:** `200 OK`

```json
{
  "data": [],
  "pagination": {
    "next_cursor": null,
    "has_more": false,
    "limit": 50
  },
  "meta": {
    "total_amount_cents": 0,
    "count": 0
  }
}
```

---

## Weryfikacja w bazie danych

Po testach, sprawdź dane bezpośrednio w bazie:

```sql
-- Sprawdź wszystkie transakcje test usera
SELECT
  id,
  type,
  category_code,
  amount_cents,
  occurred_on,
  LEFT(note, 30) as note_preview,
  month,
  created_at
FROM transactions
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND deleted_at IS NULL
ORDER BY occurred_on DESC, id DESC;

-- Sprawdź agregację per miesiąc
SELECT
  month,
  COUNT(*) as transaction_count,
  SUM(CASE WHEN type = 'INCOME' THEN amount_cents ELSE 0 END) as total_income,
  SUM(CASE WHEN type = 'EXPENSE' THEN amount_cents ELSE 0 END) as total_expense
FROM transactions
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND deleted_at IS NULL
GROUP BY month
ORDER BY month DESC;

-- Sprawdź agregację per kategoria
SELECT
  category_code,
  COUNT(*) as count,
  SUM(amount_cents) as total_cents
FROM transactions
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND deleted_at IS NULL
GROUP BY category_code
ORDER BY total_cents DESC;
```

---

## Testy wydajności (opcjonalne)

### Test wydajności paginacji

```bash
# Test 1: Pierwsza strona (powinna być najszybsza)
time curl -s "http://localhost:3004/api/v1/transactions?limit=50" > /dev/null

# Test 2: Kolejna strona z cursorem
CURSOR=$(curl -s "http://localhost:3004/api/v1/transactions?limit=50" | jq -r '.pagination.next_cursor')
time curl -s "http://localhost:3004/api/v1/transactions?cursor=$CURSOR&limit=50" > /dev/null
```

**Oczekiwany czas odpowiedzi:** < 100ms dla typowych zapytań

### Sprawdzenie planu wykonania zapytania

W Supabase SQL Editor:

```sql
-- Test 1: Query bez filtrów (powinien użyć idx_tx_keyset)
EXPLAIN ANALYZE
SELECT
  t.id, t.type, t.category_code, t.amount_cents,
  t.occurred_on, t.note, t.created_at, t.updated_at,
  tc.label_pl
FROM transactions t
INNER JOIN transaction_categories tc ON t.category_code = tc.code
WHERE t.user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND t.deleted_at IS NULL
ORDER BY t.occurred_on DESC, t.id DESC
LIMIT 50;

-- Szukaj w wyniku: "Index Scan using idx_tx_keyset"

-- Test 2: Query z filtrem miesiąca (powinien użyć idx_tx_user_month)
EXPLAIN ANALYZE
SELECT
  t.id, t.type, t.category_code, t.amount_cents,
  t.occurred_on, t.note, t.created_at, t.updated_at,
  tc.label_pl
FROM transactions t
INNER JOIN transaction_categories tc ON t.category_code = tc.code
WHERE t.user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND t.deleted_at IS NULL
  AND t.month = '2025-11-01'
ORDER BY t.occurred_on DESC, t.id DESC
LIMIT 50;

-- Szukaj w wyniku: "Index Scan using idx_tx_user_month"
```

---

## Checklist testów

### Podstawowe funkcjonalności

- [ ] Test 1: Podstawowe pobieranie (200)
- [ ] Test 2: Filtr type=EXPENSE (200)
- [ ] Test 3: Filtr type=INCOME (200)
- [ ] Test 4: Filtr type=ALL (200)
- [ ] Test 5: Filtr month (200)
- [ ] Test 6: Filtr category (200)
- [ ] Test 7: Wyszukiwanie (search) (200)

### Paginacja

- [ ] Test 8: Limit (200)
- [ ] Test 9: Cursor - następna strona (200)
- [ ] Test 10: Ostatnia strona (has_more=false) (200)

### Kombinacje filtrów

- [ ] Test 11: type + month (200)
- [ ] Test 12: type + category + limit (200)
- [ ] Test 13: month + search (200)

### Błędy walidacji

- [ ] Test 14: Nieprawidłowy format month (400)
- [ ] Test 15: Limit poza zakresem (400)
- [ ] Test 16: Nieprawidłowy cursor (400)
- [ ] Test 17: Nieprawidłowy type (400)

### Edge cases

- [ ] Test 18: Pusta lista wyników (200)
- [ ] Test 19: Limit = 1 (200)
- [ ] Test 20: Wyszukiwanie bez wyników (200)

### Weryfikacja w bazie

- [ ] Sprawdzenie danych w transactions
- [ ] Weryfikacja agregacji per miesiąc
- [ ] Weryfikacja agregacji per kategoria

### Wydajność (opcjonalne)

- [ ] Test wydajności paginacji
- [ ] Sprawdzenie planu wykonania (EXPLAIN ANALYZE)
- [ ] Weryfikacja użycia indeksów

---

## Pomocne skrypty

### Skrypt 1: Przegląd wszystkich transakcji

```bash
#!/bin/bash
# get-transactions-summary.sh

echo "=== PODSUMOWANIE TRANSAKCJI ==="
echo ""

echo "Wszystkie transakcje:"
curl -s "http://localhost:3004/api/v1/transactions" | jq '{count: .meta.count, total: .meta.total_amount_cents}'

echo ""
echo "Wydatki (EXPENSE):"
curl -s "http://localhost:3004/api/v1/transactions?type=EXPENSE" | jq '{count: .meta.count, total: .meta.total_amount_cents}'

echo ""
echo "Przychody (INCOME):"
curl -s "http://localhost:3004/api/v1/transactions?type=INCOME" | jq '{count: .meta.count, total: .meta.total_amount_cents}'

echo ""
echo "Listopad 2025:"
curl -s "http://localhost:3004/api/v1/transactions?month=2025-11" | jq '{count: .meta.count, total: .meta.total_amount_cents}'

echo ""
echo "Październik 2025:"
curl -s "http://localhost:3004/api/v1/transactions?month=2025-10" | jq '{count: .meta.count, total: .meta.total_amount_cents}'
```

### Skrypt 2: Test paginacji

```bash
#!/bin/bash
# test-pagination.sh

LIMIT=2
PAGE=1

echo "=== TEST PAGINACJI (limit=$LIMIT) ==="
echo ""

# Pierwsza strona
echo "Strona $PAGE:"
RESPONSE=$(curl -s "http://localhost:3004/api/v1/transactions?limit=$LIMIT")
echo "$RESPONSE" | jq '{count: .meta.count, has_more: .pagination.has_more, ids: [.data[].id]}'

CURSOR=$(echo "$RESPONSE" | jq -r '.pagination.next_cursor')

# Kolejne strony
while [ "$CURSOR" != "null" ]; do
  PAGE=$((PAGE + 1))
  echo ""
  echo "Strona $PAGE (cursor: ${CURSOR:0:20}...):"
  RESPONSE=$(curl -s "http://localhost:3004/api/v1/transactions?cursor=$CURSOR&limit=$LIMIT")
  echo "$RESPONSE" | jq '{count: .meta.count, has_more: .pagination.has_more, ids: [.data[].id]}'
  CURSOR=$(echo "$RESPONSE" | jq -r '.pagination.next_cursor')
done

echo ""
echo "=== Koniec paginacji (przejrzano $PAGE stron) ==="
```

### Skrypt 3: Test wszystkich filtrów

```bash
#!/bin/bash
# test-all-filters.sh

echo "=== TEST WSZYSTKICH FILTRÓW ==="

filters=(
  ""
  "type=EXPENSE"
  "type=INCOME"
  "type=ALL"
  "month=2025-11"
  "month=2025-10"
  "category=GROCERIES"
  "search=zakupy"
  "limit=2"
  "type=EXPENSE&month=2025-11"
  "type=EXPENSE&category=GROCERIES"
  "month=2025-11&limit=2"
)

for filter in "${filters[@]}"; do
  if [ -z "$filter" ]; then
    echo ""
    echo "Filter: (brak)"
    url="http://localhost:3004/api/v1/transactions"
  else
    echo ""
    echo "Filter: $filter"
    url="http://localhost:3004/api/v1/transactions?$filter"
  fi

  curl -s "$url" | jq '{count: .meta.count, total: .meta.total_amount_cents, has_more: .pagination.has_more}'
done

echo ""
echo "=== Koniec testów ==="
```

---

## Troubleshooting

### Problem: "data": [] - brak transakcji

**Przyczyna**: Brak danych testowych w bazie.

**Rozwiązanie**: Uruchom skrypt z Kroku 2 (dodaj testowe dane) lub sprawdź w bazie:

```sql
SELECT COUNT(*) FROM transactions
WHERE user_id = '4eef0567-df09-4a61-9219-631def0eb53e'
  AND deleted_at IS NULL;
```

### Problem: 500 Internal Server Error

**Diagnostyka**: Sprawdź terminal z dev serverem - błąd powinien być wylogowany.

**Częste przyczyny**:

1. Brak połączenia z Supabase
2. RLS włączony (powinien być wyłączony w dev)
3. Brak tabeli transaction_categories

**Rozwiązanie**:

```bash
# Reset bazy i migracji
npx supabase db reset
```

### Problem: Nieprawidłowe category_label (null lub undefined)

**Przyczyna**: Brak danych w tabeli transaction_categories lub błąd w JOIN.

**Rozwiązanie**:

```sql
-- Sprawdź czy kategorie istnieją
SELECT * FROM transaction_categories;

-- Jeśli puste, uruchom migracje
-- npx supabase db reset
```

### Problem: Cursor nie działa (400 Invalid cursor format)

**Diagnostyka**:

```bash
# Sprawdź format cursora
CURSOR=$(curl -s "http://localhost:3004/api/v1/transactions?limit=2" | jq -r '.pagination.next_cursor')
echo "Raw cursor: $CURSOR"
echo "Decoded: $(echo $CURSOR | base64 -d)"
```

**Format powinien być**: `base64("YYYY-MM-DD_uuid")`

### Problem: Wydajność - wolne zapytania

**Diagnostyka**: Sprawdź plan wykonania w Supabase (EXPLAIN ANALYZE)

**Rozwiązanie**:

1. Upewnij się, że indeksy zostały utworzone
2. Sprawdź czy PostgreSQL używa właściwych indeksów
3. Rozważ dodanie partial indexes dla częstych filtrów

---

## Następne kroki

1. ✅ Wszystkie testy przeszły → Endpoint gotowy
2. 📊 Integracja z frontendem (React)
3. 🔄 Implementacja cache (opcjonalnie)
4. 📈 Monitoring wydajności w produkcji
5. 🚀 Kolejne endpointy z api-plan.md

---

## Przydatne komendy jq

```bash
# Wyświetl tylko ID transakcji
curl -s "http://localhost:3004/api/v1/transactions" | jq '[.data[].id]'

# Wyświetl tylko kwoty
curl -s "http://localhost:3004/api/v1/transactions" | jq '[.data[].amount_cents]'

# Policz sumy per typ
curl -s "http://localhost:3004/api/v1/transactions" | jq '[.data[] | {type, amount: .amount_cents}] | group_by(.type) | map({type: .[0].type, total: map(.amount) | add})'

# Wyświetl ładnie z kolorami i paginacją
curl -s "http://localhost:3004/api/v1/transactions" | jq -C . | less -R

# Zapisz do pliku
curl -s "http://localhost:3004/api/v1/transactions" | jq . > transactions.json
```
