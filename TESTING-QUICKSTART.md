# Quick Start - Testowanie w FinFlow

Szybki przewodnik po uruchomieniu testów w projekcie FinFlow.

## ✅ Testy Jednostkowe (Unit) - Gotowe!

Testy jednostkowe są **już skonfigurowane i działają**.

### Uruchomienie

```bash
# Jednorazowo
npm run test:unit

# Watch mode (zalecane podczas development)
npm run test:unit:watch

# Z coverage report
npm run test:unit:coverage
```

### Przykład: Test parsowania kwot

Sprawdź działający test:
```bash
cat src/components/transactions/utils/parsePlnInputToCents.test.ts
```

Uruchom:
```bash
npm run test:unit
# ✓ 19 tests passed
```

### Pisanie własnych testów

1. Utwórz plik `*.test.ts` lub `*.test.tsx` obok kodu
2. Użyj Vitest API:

```typescript
import { describe, it, expect } from "vitest";

describe("Moja funkcja", () => {
  it("should work correctly", () => {
    expect(1 + 1).toBe(2);
  });
});
```

3. Test automatycznie zostanie wykryty i uruchomiony

---

## ⚙️ Testy Integracyjne - Wymaga Docker

Testy integracyjne używają Testcontainers (Postgres w Docker).

### Wymagania

```bash
# Sprawdź czy masz Docker
docker --version

# Jeśli nie, zainstaluj Docker Desktop
# https://www.docker.com/products/docker-desktop
```

### Setup

```bash
# Upewnij się że Docker działa
docker ps

# Uruchom testy integracyjne
npm run test:integration
```

**UWAGA**: Pierwsze uruchomienie pobiera obraz Docker (~2GB), może zająć kilka minut.

### Status

⚠️ Testy integracyjne są obecnie w fazie setup - migracje Supabase wymagają dostosowania dla lokalnego Postgres.

Zobacz szczegóły w: `tests/integration/transactions.integration.test.ts`

---

## 🎭 Testy E2E - Wymaga Supabase Project

Testy E2E używają prawdziwego Supabase Auth i bazy danych.

### Setup (jednorazowy)

#### 1. Utwórz projekt Supabase dla testów

Szczegółowa instrukcja: `.ai/e2e-supabase-setup.md`

Skrócona wersja:
1. https://app.supabase.com → "New Project"
2. Name: `finflow-test`
3. Database password: zapisz bezpiecznie
4. Create project

#### 2. Uruchom migracje

```bash
npx supabase link --project-ref your-project-ref
npx supabase db push
```

#### 3. Konfiguracja `.env.test`

```bash
# Skopiuj template
cp env.test.template .env.test

# Edytuj .env.test i wypełnij:
# - PUBLIC_SUPABASE_URL (z Dashboard → Settings → API)
# - PUBLIC_SUPABASE_ANON_KEY (anon key)
# - SUPABASE_SERVICE_KEY (service_role key, TRZYMAJ W SEKRECIE!)
# - E2E_USERNAME (email głównego test usera)
# - E2E_PASSWORD (hasło głównego test usera)
```

**⚠️ WAŻNE**: `.env.test` jest w `.gitignore` - nie commituj tego pliku!

**Przykładowa zawartość `.env.test`**:
```bash
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...
TEST_BASE_URL=http://localhost:3004
E2E_USERNAME=raketap480@alexida.com
E2E_PASSWORD=TestPassword123!
E2E_USERNAME_ID=85b37466-4e1b-49d8-a925-ee5c0eb623a1
```

#### 4. Stwórz test usera

W Supabase Dashboard → Authentication → Users:
- Add User
- Email: `raketap480@alexida.com`
- Password: `TestPassword123!`
- Auto Confirm User: ✅
- Skopiuj UUID użytkownika (będzie potrzebny)

Następnie utwórz profil w tabeli `profiles`:
```sql
INSERT INTO profiles (user_id, email_confirmed, created_at, updated_at)
VALUES ('85b37466-4e1b-49d8-a925-ee5c0eb623a1', true, now(), now());
```

**⚠️ UWAGA**: Ten użytkownik jest chroniony przez mechanizm czyszczenia bazy - jego dane NIE będą usuwane po testach.

### Uruchomienie

```bash
# Upewnij się że app działa
npm run dev

# W nowym terminalu:
npm run test:e2e

# Lub w UI mode (zalecane)
npm run test:e2e:ui
```

### Automatyczne czyszczenie bazy danych

Projekt używa **dwupoziomowego czyszczenia** dla zapewnienia izolacji testów:

#### 1. Po każdym teście (Per-Test Cleanup)

Każdy test automatycznie czyści dane głównego test usera w `afterEach` hook.

**Co jest czyszczone:**
- Transakcje głównego test usera
- Cele i zdarzenia celów głównego test usera
- Logi audytu głównego test usera
- Limity ratowe głównego test usera

**Co jest zachowywane:**
- Sam użytkownik (`raketap480@alexida.com`) - tylko jego DANE są usuwane, nie konto

**Co jest auto-aktualizowane:**
- Metryki miesięczne (zarządzane przez triggery bazy danych)

**Korzyść:** Każdy test startuje z czystym stanem - pełna izolacja! ✅

#### 2. Po wszystkich testach (Global Teardown)

Skrypt `tests/e2e/helpers/global-teardown.ts` uruchamia się raz na końcu.

**Co jest usuwane:**
- Pozostałe dane testowe
- Użytkownicy utworzeni w testach rejestracji
- Wszystkie profile i użytkownicy auth (oprócz głównego test usera)

**Co jest zachowywane:**
- Główny test user: `raketap480@alexida.com` (UUID: `85b37466-4e1b-49d8-a925-ee5c0eb623a1`)
- Tabele słownikowe: `transaction_categories`, `goal_types`

**Wymagania:**
- `.env.test` musi zawierać `SUPABASE_SERVICE_KEY` (service role key)
- `.env.test` musi zawierać `E2E_USERNAME_ID` (UUID głównego test usera)
- Bez tych kluczy czyszczenie zostanie pominięte z ostrzeżeniem

---

## 📊 Coverage

Sprawdź pokrycie kodu testami:

```bash
npm run test:unit:coverage

# Otwórz raport w przeglądarce
open coverage/index.html
```

Cele (zgodnie z test-plan.md):
- **Unit tests**: ≥80% (logika finansowa: 100%)
- **Integration tests**: 100% API endpoints
- **UI components**: ≥70%

---

## 🐛 Troubleshooting

### "Docker not found"

```bash
# Zainstaluj Docker Desktop
# https://www.docker.com/products/docker-desktop

# Uruchom Docker i spróbuj ponownie
npm run test:integration
```

### "Invalid API key" w E2E

```bash
# Sprawdź .env.test
cat .env.test

# Upewnij się że PUBLIC_SUPABASE_ANON_KEY jest poprawny
# Skopiuj ponownie z Supabase Dashboard → Settings → API
```

### Testy unit failują

```bash
# Sprawdź linter errors
npm run lint

# Upewnij się że dependencies są zainstalowane
npm install
```

---

## 📚 Pełna dokumentacja

- **Główna dokumentacja testów**: `tests/README.md`
- **Setup Supabase E2E**: `.ai/e2e-supabase-setup.md`
- **Pełny plan testowy**: `.ai/test-plan.md`
- **Guidelines Vitest**: `.cursor/rules/vitest-unit-testing.mdc`
- **Guidelines Playwright**: `.cursor/rules/playwright-e2e-testing.mdc`

---

## ✅ Checklist pierwszego uruchomienia

### Unit Tests
- [ ] `npm run test:unit` działa
- [ ] Widzisz ✓ 19 tests passed
- [ ] `npm run test:unit:watch` działa w watch mode

### Integration Tests (opcjonalnie na start)
- [ ] Docker jest zainstalowany i działa
- [ ] `docker ps` zwraca wynik bez błędów
- [ ] `npm run test:integration` pobiera obraz i startuje

### E2E Tests (opcjonalnie na start)
- [ ] Utworzony projekt Supabase dla testów
- [ ] `.env.test` wypełniony
- [ ] Test user utworzony w Supabase
- [ ] `npm run dev` działa
- [ ] `npm run test:e2e` uruchamia Playwright

---

## 🚀 Next Steps

1. **Zacznij od unit tests** - są najprostsze i najszybsze
2. **Pisz testy podczas development** (TDD) - `npm run test:unit:watch`
3. **Gdy gotowy, skonfiguruj E2E** - potrzebne przed release
4. **Integration tests** - ostatnie, wymagają najwięcej setupu

---

## 💡 Tips

- **Używaj watch mode** podczas pisania testów: `npm run test:unit:watch`
- **Playwright UI mode** jest świetny do debugowania E2E: `npm run test:e2e:ui`
- **Sprawdzaj coverage** okresowo: `npm run test:unit:coverage`
- **Czytaj błędy testów** - są szczegółowe i pomocne

---

Pytania? Sprawdź `tests/README.md` lub otwórz issue! 🎯

