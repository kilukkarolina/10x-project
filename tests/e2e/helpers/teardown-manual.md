# Manual Database Teardown Guide

Ten dokument opisuje jak ręcznie wyczyścić bazę danych testową Supabase.

## Automatyczne czyszczenie

Projekt używa **dwóch poziomów** automatycznego czyszczenia:

1. **Per-Test Cleanup** (`afterEach` w każdym test suite)
   - Uruchamia się po każdym teście
   - Czyści dane głównego test usera
   - Zachowuje samo konto użytkownika
   - Funkcja: `cleanupMainTestUserData()` w `test-data.ts`

2. **Global Teardown** (`global-teardown.ts`)
   - Uruchamia się raz po wszystkich testach
   - Czyści użytkowników utworzonych w testach rejestracji
   - Backup cleanup dla failujących testów

## Ręczne uruchomienie teardown

### Opcja 1: Per-Test Cleanup (tylko dane głównego usera)

Jeśli potrzebujesz wyczyścić tylko dane głównego test usera (bez usuwania konta):

```typescript
// W konsoli Node.js lub w osobnym skrypcie
import { cleanupMainTestUserData } from "./tests/e2e/helpers/test-data";
await cleanupMainTestUserData();
```

Lub użyj SQL w Supabase Dashboard:

```sql
-- Podstaw swój E2E_USERNAME_ID
DELETE FROM rate_limits WHERE user_id = '85b37466-4e1b-49d8-a925-ee5c0eb623a1';
DELETE FROM audit_log WHERE owner_user_id = '85b37466-4e1b-49d8-a925-ee5c0eb623a1';
DELETE FROM goal_events WHERE user_id = '85b37466-4e1b-49d8-a925-ee5c0eb623a1';
DELETE FROM goals WHERE user_id = '85b37466-4e1b-49d8-a925-ee5c0eb623a1';
DELETE FROM transactions WHERE user_id = '85b37466-4e1b-49d8-a925-ee5c0eb623a1';
-- Uwaga: monthly_metrics zostanie automatycznie zaktualizowana przez triggery
```

### Opcja 2: Global Teardown (wszystkie dane testowe)

Jeśli potrzebujesz ręcznie wyczyścić całą bazę danych:

```bash
# Używając npm script (zalecane)
npm run test:e2e:cleanup

# Lub bezpośrednio
npx tsx tests/e2e/helpers/global-teardown.ts
```

## Co zostanie usunięte?

Teardown usuwa WSZYSTKIE dane testowe z następujących tabel:

- `transactions` (oprócz transakcji głównego test usera)
- `goals` (oprócz celów głównego test usera)
- `goal_events` (oprócz zdarzeń głównego test usera)
- `audit_log` (oprócz logów głównego test usera)
- `rate_limits` (oprócz limitów głównego test usera)
- `profiles` (oprócz profilu głównego test usera)
- Użytkownicy auth (oprócz głównego test usera)

**Uwaga:** `monthly_metrics` NIE jest usuwana - jest zarządzana automatycznie przez triggery bazy danych

## Co zostanie zachowane?

- **Główny test user**: `raketap480@alexida.com` (UUID: `85b37466-4e1b-49d8-a925-ee5c0eb623a1`)
- **Tabele słownikowe**: `transaction_categories`, `goal_types`

## Ręczne czyszczenie SQL

Alternatywnie, możesz użyć SQL w Supabase Dashboard → SQL Editor:

```sql
-- UWAGA: To usuwa WSZYSTKIE dane (także głównego test usera)!
-- Użyj ostrożnie!

-- Usuń dane z tabel business
DELETE FROM goal_events;
DELETE FROM goals;
DELETE FROM transactions;
DELETE FROM monthly_metrics;
DELETE FROM audit_log;
DELETE FROM rate_limits;

-- Usuń profile (ale zachowaj głównego test usera)
DELETE FROM profiles WHERE user_id != '85b37466-4e1b-49d8-a925-ee5c0eb623a1';

-- Ręcznie usuń użytkowników auth w Dashboard → Authentication → Users
```

## Troubleshooting

### Błąd: "Missing Supabase credentials" lub "Missing E2E_USERNAME_ID"

**Problem**: `.env.test` nie zawiera wymaganych zmiennych lub plik nie istnieje.

**Rozwiązanie**:

```bash
# Sprawdź czy plik istnieje
ls -la .env.test

# Jeśli nie istnieje, skopiuj template
cp env.test.template .env.test

# Wypełnij wartości (w tym E2E_USERNAME_ID!)
nano .env.test
```

**Wymagane zmienne**:

- `PUBLIC_SUPABASE_URL` - URL projektu Supabase
- `SUPABASE_SERVICE_KEY` - Service role key
- `E2E_USERNAME_ID` - UUID głównego test usera (85b37466-4e1b-49d8-a925-ee5c0eb623a1)

### Błąd: Foreign key constraint

**Problem**: Kolejność usuwania danych narusza ograniczenia klucza obcego.

**Rozwiązanie**: Teardown usuwa dane w poprawnej kolejności. Jeśli problem występuje:

1. Sprawdź logi - który DELETE failuje
2. Sprawdź strukturę bazy (czy nie dodano nowych tabel z FK)
3. Zaktualizuj teardown, aby usuwać w poprawnej kolejności

### Błąd: Permission denied

**Problem**: `SUPABASE_SERVICE_KEY` nie ma wystarczających uprawnień.

**Rozwiązanie**:

1. Sprawdź czy używasz **service_role key**, nie anon key
2. W Supabase Dashboard → Settings → API → Project API keys
3. Skopiuj "service_role" key (long token starting with `eyJhbGc...`)
4. Upewnij się że RLS jest wyłączony dla testów lub service role ma bypass

### Testy zostawiają "brudne" dane

**Problem**: Po testach nadal widzisz dane testowe w bazie.

**Możliwe przyczyny**:

1. Teardown nie uruchomił się (sprawdź logi testów)
2. Teardown zakończył się błędem (sprawdź logi)
3. Brakuje `SUPABASE_SERVICE_KEY` w `.env.test`

**Rozwiązanie**:

```bash
# 1. Sprawdź logi ostatniego uruchomienia testów
# Powinny zawierać: "🧹 Starting database cleanup..."

# 2. Uruchom teardown ręcznie
npx tsx tests/e2e/helpers/global-teardown.ts

# 3. Sprawdź output - czy wszystkie ✅ są widoczne?
```

## Weryfikacja

Po czyszczeniu, sprawdź bazę danych:

```sql
-- Powinno zwrócić 0 (oprócz głównego test usera)
SELECT COUNT(*) FROM transactions WHERE user_id != '85b37466-4e1b-49d8-a925-ee5c0eb623a1';
SELECT COUNT(*) FROM goals WHERE user_id != '85b37466-4e1b-49d8-a925-ee5c0eb623a1';
SELECT COUNT(*) FROM goal_events WHERE user_id != '85b37466-4e1b-49d8-a925-ee5c0eb623a1';
SELECT COUNT(*) FROM audit_log WHERE owner_user_id != '85b37466-4e1b-49d8-a925-ee5c0eb623a1';
SELECT COUNT(*) FROM rate_limits WHERE user_id != '85b37466-4e1b-49d8-a925-ee5c0eb623a1';
SELECT COUNT(*) FROM profiles WHERE user_id != '85b37466-4e1b-49d8-a925-ee5c0eb623a1';

-- Główny test user powinien nadal istnieć
SELECT * FROM profiles WHERE user_id = '85b37466-4e1b-49d8-a925-ee5c0eb623a1';

-- Monthly_metrics może mieć dane (zarządzana przez triggery)
SELECT * FROM monthly_metrics WHERE user_id = '85b37466-4e1b-49d8-a925-ee5c0eb623a1';
```

## Kontakt

Jeśli nadal masz problemy, sprawdź:

- `tests/README.md` - główna dokumentacja testów
- `TESTING-QUICKSTART.md` - quick start guide
- Otwórz issue w repo z logami błędów
