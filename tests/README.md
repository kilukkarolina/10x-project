# FinFlow - Dokumentacja Testów

Kompletny setup środowiska testowego dla projektu FinFlow.

## Spis treści

- [Architektura testowa](#architektura-testowa)
- [Setup lokalny](#setup-lokalny)
- [Testy jednostkowe (Unit)](#testy-jednostkowe-unit)
- [Testy integracyjne (Integration)](#testy-integracyjne-integration)
- [Testy E2E](#testy-e2e)
- [Troubleshooting](#troubleshooting)

---

## Architektura testowa

Projekt używa **3-poziomowej strategii testowania**:

| Poziom | Narzędzia | Auth | Database | Uruchamianie | Cel |
|--------|-----------|------|----------|--------------|-----|
| **Unit** | Vitest | Brak | Brak (mocki) | Każdy save (watch) | Logika biznesowa |
| **Integration** | Vitest + Testcontainers | **FAKE** | Postgres (container) | Każdy PR | API + DB |
| **E2E** | Playwright + Supabase Cloud | **PRAWDZIWY** | Supabase Cloud | Merge to master | User flows |

### Kluczowe decyzje

✅ **Vitest** zamiast Jest (szybszy, natywna integracja z Vite/Astro)  
✅ **Playwright** zamiast Cypress (lepsza wydajność, auto-waiting)  
✅ **Testcontainers** zamiast docker-compose (programmatic control, izolacja)  
✅ **Fake auth** w testach integracyjnych (testujemy logikę, nie Supabase Auth)  
✅ **Prawdziwy Supabase Auth** w E2E (testujemy pełny user flow)

---

## Setup lokalny

### 1. Instalacja dependencies

```bash
npm install
```

### 2. Wymagania systemowe

- **Docker** - wymagany dla testów integracyjnych (Testcontainers)
- **Node.js** 20+
- **npm** 9+

Sprawdź Docker:
```bash
docker --version
# Docker version 24.0.0 lub nowszy
```

### 3. Zmienne środowiskowe

Dla testów E2E, skopiuj template:
```bash
cp .env.test.example .env.test
```

Następnie wypełnij wartości w `.env.test` (patrz sekcja [Setup Supabase dla E2E](#setup-supabase-dla-e2e)).

---

## Testy jednostkowe (Unit)

### Uruchomienie

```bash
# Jednorazowe uruchomienie
npm run test:unit

# Watch mode (przy development)
npm run test:unit:watch

# Z coverage
npm run test:unit:coverage
```

### Charakterystyka

- **Szybkość**: ~10ms per test
- **Izolacja**: Pełna (wszystkie dependencies mockowane)
- **Setup**: Zero (brak external dependencies)

### Struktura

Testy jednostkowe znajdują się **obok kodu źródłowego**:

```
src/
  lib/
    utils.ts
    utils.test.ts          ← Unit test
  components/
    transactions/
      TransactionForm.tsx
      TransactionForm.test.tsx  ← Component test
```

### Przykład testu

```typescript
// src/lib/utils.test.ts
import { describe, it, expect } from "vitest";
import { parsePlnInputToCents } from "./utils";

describe("parsePlnInputToCents", () => {
  it("should parse comma format", () => {
    expect(parsePlnInputToCents("1234,56")).toBe(123456);
  });

  it("should return null for invalid input", () => {
    expect(parsePlnInputToCents("abc")).toBe(null);
  });
});
```

### Co testować?

✅ Logika biznesowa (parsowanie kwot, obliczenia finansowe)  
✅ Walidacje (schematy Zod)  
✅ Funkcje pomocnicze (utils, formattery)  
✅ Komponenty React (z React Testing Library)

❌ Nie testujemy API endpoints (to są testy integracyjne)  
❌ Nie testujemy database queries (to są testy integracyjne)

---

## Testy integracyjne (Integration)

### Uruchomienie

```bash
# Jednorazowe uruchomienie
npm run test:integration

# Watch mode
npm run test:integration:watch
```

### Charakterystyka

- **Szybkość**: ~100-500ms per test (+ ~10s startup kontenera)
- **Izolacja**: Per test suite (cleanup między testami)
- **Setup**: Automatyczny (Testcontainers)
- **Wymaga**: Docker running

### Struktura

```
tests/
  integration/
    transactions.integration.test.ts
    goals.integration.test.ts
    metrics.integration.test.ts
```

### Jak to działa?

1. **Testcontainers** automatycznie startuje Postgres w Docker
2. Uruchamiane są **migracje** z `./supabase/migrations/`
3. Testy używają **fake auth** (mock userId, bez prawdziwego Supabase)
4. Po testach kontener jest **automatycznie usuwany**

### Przykład testu

```typescript
// tests/integration/transactions.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  setupIntegrationTests,
  teardownIntegrationTests,
  seedTestUser,
} from "../setup-integration";

describe("Transactions API", () => {
  let pool, container;

  beforeAll(async () => {
    const setup = await setupIntegrationTests();
    pool = setup.pool;
    container = setup.container;
  }, 60000); // Timeout dla startup

  afterAll(async () => {
    await teardownIntegrationTests();
  });

  it("should create transaction", async () => {
    const userId = await seedTestUser(pool);

    const result = await pool.query(
      `INSERT INTO transactions (user_id, amount, category_id, transaction_date, type)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, 10000, "food", "2024-01-15", "EXPENSE"]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].amount).toBe(10000);
  });
});
```

### Co testować?

✅ API endpoints (wszystkie operacje CRUD)  
✅ Database queries i agregacje  
✅ RLS policies (fake auth)  
✅ Soft-delete  
✅ Audit log triggers  
✅ Idempotencja

❌ Nie testujemy prawdziwego Supabase Auth (to E2E)  
❌ Nie testujemy UI (to testy komponentów lub E2E)

---

## Testy E2E

### Setup Supabase dla E2E

#### 1. Utwórz dedykowany projekt testowy w Supabase

1. Przejdź do https://app.supabase.com
2. Kliknij "New Project"
3. Nazwa: `finflow-test` (lub podobna)
4. Region: wybierz najbliższy
5. Database password: zapisz bezpiecznie

#### 2. Uruchom migracje

```bash
# Połącz z projektem testowym
npx supabase link --project-ref your-test-project-ref

# Uruchom migracje
npx supabase db push
```

#### 3. Skonfiguruj SMTP (opcjonalnie dla testów email)

W Supabase Dashboard:
- Settings → Auth → SMTP Settings
- Użyj Ethereal Email lub innego test SMTP providera

#### 4. Pobierz credentials

W Supabase Dashboard → Settings → API:

- **Project URL**: `https://your-test-project.supabase.co`
- **anon/public key**: `eyJhbGc...` (długi token)
- **service_role key**: `eyJhbGc...` (inny długi token, **trzymaj w sekrecie**)

#### 5. Wypełnij `.env.test`

```bash
PUBLIC_SUPABASE_URL=https://your-test-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-key-here  # Dla cleanup users
TEST_BASE_URL=http://localhost:3004
```

**⚠️WAŻNE**: Dodaj `.env.test` do `.gitignore`!

### Uruchomienie testów E2E

```bash
# Uruchom wszystkie testy E2E
npm run test:e2e

# UI mode (interaktywny)
npm run test:e2e:ui

# Debug mode (krok po kroku)
npm run test:e2e:debug

# Headed mode (widzisz przeglądarkę)
npm run test:e2e:headed
```

### Charakterystyka

- **Szybkość**: ~5-15s per flow
- **Izolacja**: Per test (cleanup users po testach)
- **Setup**: Jednorazowy (Supabase projekt + env vars)
- **Wymaga**: Supabase Cloud project + prawdziwy Auth

### Struktura

```
tests/
  e2e/
    auth.spec.ts          ← Auth flows (register, login, reset)
    dashboard.spec.ts     ← Dashboard smoke tests
    transactions.spec.ts  ← Transactions E2E
    helpers/
      ethereal.ts         ← Email verification helper
      test-data.ts        ← Test data generators
```

### Przykład testu

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from "@playwright/test";
import { login } from "./helpers/test-data";

test("should login successfully", async ({ page }) => {
  const email = "test@example.com";
  const password = "TestPassword123!";

  await page.goto("/auth/login");
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL("/dashboard");
});
```

### Co testować?

✅ Auth flows (rejestracja, login, reset hasła)  
✅ Critical user journeys (dashboard → transakcje → cele)  
✅ Rate limiting (3/30 min)  
✅ Email verification (z Ethereal)  
✅ Visual regression (screenshots)

❌ Nie testujemy szczegółowej logiki biznesowej (to unit tests)  
❌ Nie testujemy wszystkich edge cases (to integration tests)

### Pre-requisite: Test user

Dla podstawowych testów login/dashboard, stwórz ręcznie test usera:

1. W Supabase Dashboard → Authentication → Users
2. Add User manually
3. Email: `verified-test-user@example.com`
4. Password: `TestPassword123!`
5. Potwierdź email (kliknij "Verify email")

Użyj tego usera w testach które nie wymagają pełnego flow rejestracji.

---

## Uruchamianie wszystkich testów

```bash
# Unit + Integration
npm run test

# Wszystkie (Unit + Integration + E2E)
npm run test:all
```

---

## Troubleshooting

### Problem: "Docker not found" w testach integracyjnych

**Rozwiązanie**:
```bash
# Sprawdź czy Docker działa
docker ps

# Jeśli nie, uruchom Docker Desktop lub Docker daemon
sudo systemctl start docker  # Linux
# lub uruchom Docker Desktop na Mac/Windows
```

### Problem: Testcontainers timeout

**Rozwiązanie**:
- Zwiększ timeout w `beforeAll`:
  ```typescript
  beforeAll(async () => {
    await setupIntegrationTests();
  }, 90000); // 90s zamiast 60s
  ```
- Sprawdź czy Docker ma wystarczająco resources (RAM, CPU)

### Problem: E2E testy failują - "Cannot connect to Supabase"

**Rozwiązanie**:
1. Sprawdź czy `.env.test` istnieje i ma poprawne wartości
2. Sprawdź czy `PUBLIC_SUPABASE_URL` jest dostępny:
   ```bash
   curl https://your-test-project.supabase.co
   ```
3. Sprawdź czy `SUPABASE_ANON_KEY` jest poprawny (w Supabase Dashboard)

### Problem: "Verification link not working"

**Rozwiązanie**:
- Testy email verification wymagają skonfigurowanego SMTP w Supabase
- Alternatywnie użyj Supabase Admin API do bezpośredniego potwierdzenia usera
- Zobacz helper `EtherealMailClient` - wymaga implementacji email parsing

### Problem: Flaky E2E tests

**Rozwiązanie**:
- Użyj `page.waitForURL()` zamiast `expect(page).toHaveURL()` bez wait
- Zwiększ timeouty dla slow operations:
  ```typescript
  await expect(element).toBeVisible({ timeout: 10000 });
  ```
- Dodaj explicit waits dla async operations:
  ```typescript
  await page.waitForLoadState("networkidle");
  ```

### Problem: Coverage za niski

**Rozwiązanie**:
- Sprawdź które pliki nie są pokryte:
  ```bash
  npm run test:unit:coverage
  # Otwórz coverage/index.html w przeglądarce
  ```
- Dodaj testy dla uncovered code
- Dostosuj thresholds w `vitest.config.ts` jeśli potrzeba

### Problem: Testy integracyjne zostawiają kontener

**Rozwiązanie**:
- Upewnij się że `afterAll` jest wywołany:
  ```typescript
  afterAll(async () => {
    await teardownIntegrationTests();
  });
  ```
- Manual cleanup:
  ```bash
  docker ps -a | grep finflow_test
  docker rm -f <container-id>
  ```

---

## Best Practices

### ✅ Do's

- **Uruchamiaj unit tests w watch mode** podczas development
- **Nazywaj testy opisowo**: "should create transaction with valid data"
- **Izoluj testy**: każdy test powinien być niezależny
- **Cleanup po testach**: używaj `afterEach`/`afterAll`
- **Mock external dependencies** w unit tests
- **Używaj test helpers** i factories dla DRY code

### ❌ Don'ts

- **Nie używaj hardcoded delays** (`setTimeout`) - użyj `waitFor`
- **Nie testuj implementation details** - testuj zachowanie z perspektywy usera
- **Nie skipuj testów** bez dobrego powodu (zamiast skip - napraw)
- **Nie commituj `.env.test`** z prawdziwymi credentials
- **Nie używaj production database** do testów

---

## Coverage Targets

Zgodnie z test-plan.md:

- **Unit tests**: ≥80% (logika finansowa: 100%)
- **Integration tests**: 100% API endpoints
- **UI components**: ≥70%

Sprawdź coverage:
```bash
npm run test:unit:coverage
# Raport w: coverage/index.html
```

---

## Kontakt i Feedback

Pytania lub problemy? Otwórz issue w repo lub skontaktuj się z zespołem QA.

**Dokumentacja**: `.ai/test-plan.md` - pełny plan testów  
**Guidelines**: `.cursor/rules/vitest-unit-testing.mdc`, `playwright-e2e-testing.mdc`

