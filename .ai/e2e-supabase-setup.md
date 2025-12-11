# Setup Supabase dla Testów E2E

Ten dokument opisuje krok po kroku jak przygotować dedykowany projekt Supabase Cloud dla testów E2E.

## Krok 1: Utwórz nowy projekt w Supabase

1. Przejdź do [Supabase Dashboard](https://app.supabase.com)
2. Kliknij **"New Project"**
3. Wypełnij dane projektu:
   - **Name**: `finflow-test` (lub `finflow-e2e`)
   - **Database Password**: Wygeneruj silne hasło i **zapisz bezpiecznie**
   - **Region**: Wybierz najbliższy region (np. `Europe (Frankfurt)`)
   - **Pricing Plan**: Free tier jest wystarczający dla testów

4. Kliknij **"Create new project"**
5. Poczekaj ~2 minuty na setup projektu

## Krok 2: Uruchom migracje bazy danych

Po utworzeniu projektu, musisz uruchomić migracje:

### Opcja A: Przez Supabase CLI (zalecane)

```bash
# Zainstaluj Supabase CLI (jeśli nie masz)
npm install -g supabase

# Zaloguj się
npx supabase login

# Połącz z projektem testowym
npx supabase link --project-ref <your-project-ref>
# Project ref znajdziesz w Settings -> General -> Reference ID

# Uruchom migracje
npx supabase db push
```

### Opcja B: Ręcznie przez SQL Editor

1. W Supabase Dashboard → **SQL Editor**
2. Otwórz każdy plik z `./supabase/migrations/` po kolei (alfabetycznie)
3. Wklej zawartość i kliknij **"Run"**

Kolejność plików:

```
20251109120000_create_base_schema.sql
20251109120100_create_business_tables.sql
20251109120200_create_auxiliary_tables.sql
20251109120300_create_functions_and_triggers.sql
20251109120400_create_rls_policies.sql
20251109120500_seed_test_user.sql
20251111090000_disable_rls_for_development.sql
20251123000000_modify_rpc_for_development.sql
20251130000000_disable_rls_audit_log.sql
```

**⚠️ WAŻNE**: Uruchom wszystkie migracje w kolejności!

## Krok 3: Pobierz API credentials

W Supabase Dashboard:

1. Przejdź do **Settings → API**
2. Skopiuj następujące wartości:

### Project URL

```
Configuration → URL
```

Przykład: `https://abcdefghijklmnop.supabase.co`

### API Keys

#### anon/public key

```
Project API keys → anon public
```

To jest **publiczny** klucz, bezpieczny do użycia w frontend code.

Przykład: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSI...`

#### service_role key

```
Project API keys → service_role secret
```

⚠️ To jest **prywatny** klucz z pełnymi uprawnieniami admin!

**NIGDY nie commituj tego klucza do repozytorium!**

Używamy go tylko w testach E2E do cleanup (usuwanie test users).

## Krok 4: Skonfiguruj zmienne środowiskowe lokalnie

1. Skopiuj template:

```bash
cp .env.test.example .env.test
```

2. Wypełnij `.env.test`:

```bash
PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...  # twój anon key
SUPABASE_SERVICE_KEY=eyJhbGc...     # twój service_role key
TEST_BASE_URL=http://localhost:4321
```

3. **WAŻNE**: Upewnij się że `.env.test` jest w `.gitignore`!

```bash
# Sprawdź .gitignore
grep "\.env\.test" .gitignore

# Jeśli nie ma, dodaj:
echo ".env.test" >> .gitignore
```

## Krok 5: Skonfiguruj SMTP dla email verification (opcjonalne)

Jeśli chcesz testować pełny flow rejestracji z weryfikacją email:

### Opcja A: Ethereal Email (dynamiczne konta)

Ethereal generuje tymczasowe konta test SMTP automatycznie w kodzie.

**Nie wymaga konfiguracji w Supabase Dashboard.**

Helper `EtherealMailClient` w `tests/e2e/helpers/ethereal.ts` obsługuje to automatycznie.

### Opcja B: Mailtrap lub inny test SMTP provider

1. W Supabase Dashboard → **Settings → Auth → SMTP Settings**
2. Enable SMTP
3. Wypełnij dane z twojego providera:
   ```
   Host: smtp.mailtrap.io  (lub inny)
   Port: 587
   Username: your-username
   Password: your-password
   Sender email: noreply@finflow.test
   ```

### Opcja C: Pomiń email verification w testach

Możesz używać Supabase Admin API do bezpośredniego potwierdzenia userów:

```typescript
// W teście
const supabase = createClient(url, serviceKey);
await supabase.auth.admin.updateUserById(userId, {
  email_confirmed_at: new Date().toISOString(),
});
```

## Krok 6: Stwórz test usera dla podstawowych testów

Dla testów które nie wymagają pełnego flow rejestracji (np. testy dashboardu), stwórz ręcznie test usera:

1. W Supabase Dashboard → **Authentication → Users**
2. Kliknij **"Add User" → "Create new user"**
3. Wypełnij:
   - **Email**: `verified-test-user@example.com`
   - **Password**: `TestPassword123!`
   - **Auto Confirm User**: ✅ (zaznacz!)
4. Kliknij **"Create user"**

Ten user będzie używany w testach E2E do logowania bez procesu rejestracji.

## Krok 7: Weryfikacja setupu

Sprawdź czy wszystko działa:

```bash
# Test połączenia z Supabase
curl https://your-project-ref.supabase.co

# Powinno zwrócić: {"msg":"ok"}
```

### Test login w przeglądarce

1. Uruchom aplikację lokalnie:

```bash
npm run dev
```

2. Otwórz http://localhost:4321/auth/login

3. Zaloguj się jako test user:
   - Email: `verified-test-user@example.com`
   - Password: `TestPassword123!`

4. Powinno przekierować na `/dashboard`

✅ Jeśli działa - Supabase E2E jest gotowy!

## Krok 8: Uruchom pierwsze testy E2E

```bash
# Upewnij się że app działa
npm run dev

# W nowym terminalu uruchom testy
npm run test:e2e
```

Playwright automatycznie:

- Uruchomi przeglądarkę
- Połączy się z lokalnym dev serverem (http://localhost:4321)
- Użyje Supabase test project (z `.env.test`)
- Uruchomi testy

## Troubleshooting

### Problem: "Invalid API key"

**Rozwiązanie**:

- Sprawdź czy `PUBLIC_SUPABASE_ANON_KEY` w `.env.test` jest poprawny
- Upewnij się że nie ma spacji na początku/końcu klucza
- Skopiuj ponownie z Supabase Dashboard

### Problem: "Database error: relation does not exist"

**Rozwiązanie**:

- Migracje nie zostały uruchomione
- Uruchom ponownie `npx supabase db push`
- Lub ręcznie przez SQL Editor

### Problem: "User not found" podczas login

**Rozwiązanie**:

- Sprawdź czy test user został utworzony
- Sprawdź czy email jest potwierdzony (Auto Confirm User)
- Spróbuj utworzyć usera ponownie

### Problem: RLS blokuje dostęp do danych

**Rozwiązanie**:

- Dla projektu testowego możesz wyłączyć RLS:
  ```sql
  -- W SQL Editor
  ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
  ALTER TABLE goals DISABLE ROW LEVEL SECURITY;
  -- itd. dla wszystkich tabel
  ```
- Lub dostosuj RLS policies do testów

### Problem: Email verification nie działa

**Rozwiązanie**:

- Sprawdź SMTP configuration w Supabase
- Użyj Admin API do manual confirm (patrz Opcja C powyżej)
- Skip testy email verification na razie (`test.skip()`)

## Security Best Practices

### ✅ Do's

- **Używaj dedykowanego projektu dla testów** (nie production!)
- **Trzymaj `SUPABASE_SERVICE_KEY` w sekrecie**
- **Dodaj `.env.test` do `.gitignore`**
- **Cleanup test users po testach** (używaj `cleanupTestUser()` helper)
- **Resetuj database okresowo** (usuń stare test data)

### ❌ Don'ts

- **Nie commituj credentials do Git**
- **Nie używaj production database do testów**
- **Nie sharuj `service_role` key publicznie**
- **Nie pozostawiaj test users w database** (auto cleanup)

## Maintenance

### Czyszczenie test users

Okresowo usuwaj stare test users:

```sql
-- W Supabase Dashboard → SQL Editor
DELETE FROM auth.users
WHERE email LIKE 'e2e-test-%@example.com'
AND created_at < NOW() - INTERVAL '7 days';
```

Lub użyj helper w testach:

```typescript
import { cleanupTestUser } from "./helpers/test-data";
await cleanupTestUser("old-test@example.com");
```

### Reset database do czystego stanu

Jeśli chcesz zacząć od nowa:

```bash
# 1. Drop wszystkie dane (nie usuwa structure)
npx supabase db reset

# 2. Uruchom migracje ponownie
npx supabase db push

# 3. Stwórz test usera ponownie
# (patrz Krok 6)
```

## CI/CD Setup (dla przyszłości)

Gdy będziesz gotowy do CI/CD:

1. W GitHub → Settings → Secrets and variables → Actions
2. Dodaj secrets:
   - `TEST_SUPABASE_URL`
   - `TEST_SUPABASE_ANON_KEY`
   - `TEST_SUPABASE_SERVICE_KEY`
3. Use w workflow:
   ```yaml
   - name: Run E2E tests
     run: npm run test:e2e
     env:
       PUBLIC_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
       PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
       SUPABASE_SERVICE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_KEY }}
   ```

---

## Checklist

Przed pierwszym uruchomieniem testów E2E:

- [ ] Utworzony projekt Supabase Cloud dla testów
- [ ] Uruchomione wszystkie migracje
- [ ] `.env.test` wypełniony poprawnymi credentials
- [ ] `.env.test` dodany do `.gitignore`
- [ ] Test user utworzony i potwierdzony
- [ ] Test login działa w przeglądarce
- [ ] `npm run test:e2e` uruchamia się bez błędów

✅ Jeśli wszystko zaznaczone - gotowe!

## Pytania?

- Sprawdź `tests/README.md` - główna dokumentacja testów
- Przeczytaj `.ai/test-plan.md` - pełny plan testowy
- Otwórz issue jeśli coś nie działa
