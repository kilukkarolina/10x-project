## 1. Wprowadzenie i cele testowania

Celem testowania FinFlow jest:

- **Zweryfikowanie poprawności obliczeń finansowych** (saldo, wolne środki, odłożone netto, progress celów) w różnych scenariuszach czasowych (backdate, korekty historyczne).
- **Zapewnienie poprawności kluczowych przepływów użytkownika**: rejestracja/logowanie, reset hasła, CRUD transakcji, CRUD celów, wpłaty/wypłaty do celów, nawigacja po miesiącach.
- **Potwierdzenie stabilności i przewidywalności zachowania systemu** w typowych przypadkach użycia oraz w warunkach błędów i wartości brzegowych.
- **Spełnienie wymogów niefunkcjonalnych z PRD**: wydajność (≤200 ms dla typowych zapytań), stabilność (≥99%), obsługa błędów z optimistic updates + rollback, poprawna obsługa limitów e‑maili.
- **Ograniczenie zakresu testów bezpieczeństwa na tym etapie** – pomijamy je świadomie w MVP, poza testami RLS traktowanymi jako funkcjonalne.

Strategia testowa opiera się na trzech filarach dla każdej kluczowej funkcjonalności:

- **Happy path** – potwierdzenie, że typowy scenariusz biznesowy przebiega poprawnie.
- **Scenariusze błędów** – sposób reakcji systemu na błędne dane, błędy sieci, niepoprawne stany domenowe.
- **Wartości brzegowe** – ekstremalne, skrajne lub „nietypowe, ale realne” dane wejściowe.

---

## 2. Zakres testów

### 2.1. Frontend (Astro + React)

W zakresie:

- Strony Astro: `index.astro`, `dashboard.astro`, `transactions.astro`, `goals.astro`, ścieżki auth `/auth/*`.
- React „island” po zalogowaniu (`DashboardApp`) oraz moduły:
  - **Transakcje**: lista, filtry, paginacja, formularz dodawania/edycji/usuwania.
  - **Cele**: lista, tworzenie, priorytet, archiwizacja, wpłaty/wypłaty.
  - **Dashboard**: 4 karty, wykres wydatków wg kategorii, progress celu priorytetowego, nawigacja czasu.
  - **Audit-log**: widok historii operacji.
  - **System**: `GlobalErrorBoundary`, formularze auth (logowanie, rejestracja, reset/zmiana hasła), toasty, bannery (np. „korekty historyczne”).
- Zachowania UI:
  - Walidacje inline.
  - Optimistic updates + rollback.
  - Zapamiętywanie filtrów w `localStorage`.
  - Podstawowa responsywność (desktop‑first + sanity check na mniejszych szerokościach).

Poza zakresem UI na ten etap: zaawansowane animacje, eksperymentalne funkcje spoza PRD.

### 2.2. Backend (API + Supabase)

W zakresie:

**API Endpoints** (`src/pages/api/v1/**`):

- `/auth/*` - helpery wokół Supabase Auth (rate limiting, custom logic)
- `/transactions`, `/transactions/[id]` - CRUD transakcji
- `/goals`, `/goals/[id]`, `/goals/[id]/archive` - CRUD celów + archiwizacja
- `/goal-events` - wpłaty/wypłaty do celów
- `/metrics/expenses-by-category`, `/metrics/monthly`, `/metrics/priority-goal` - dashboard metrics
- `/categories`, `/goal-types` - słowniki
- `/audit-log` - historia operacji

**Strategia testowania API**:

- **Testy integracyjne**: Testcontainers + Postgres + **fake auth** (mock userId)
  - Testujemy: logikę biznesową, obliczenia, agregacje, RLS, soft-delete
  - NIE testujemy: prawdziwego Supabase Auth (to będzie w E2E)
- **Testy E2E**: Supabase Cloud + prawdziwy Auth
  - Testujemy: pełne user flows włącznie z rejestracją i logowaniem

**Warstwa serwisów** (`src/lib/services/*`):

- `transaction.service`, `goal.service`, `goal-event.service`
- `monthly-metrics.service`, `expenses-by-category.service`
- `rate-limit.service`, `audit-log.service`
- `auth.service`, serwisy kategorii/typów

**Strategia testowania serwisów**:

- **Testy unit**: Czysta logika bez DB (mocki)
- **Testy integracyjne**: Z prawdziwą DB (Testcontainers)

**Integracja z Supabase**:

- Auth (GoTrue) - testowana w E2E z prawdziwym Supabase Cloud
- RLS - testowana funkcjonalnie w testach integracyjnych (fake auth)
- Soft-delete (`deleted_at`) - testy integracyjne
- `audit_log` (retencja 30 dni) - testy integracyjne
- `rate_limits` (3/30 min dla verify/reset) - testy E2E
- Idempotencja `goal_events` - testy integracyjne
- Agregacje z bankierskim zaokrąglaniem - testy unit + integracyjne

**Poza zakresem**:

- Integracje z zewnętrznymi bankami
- Płatności
- Zaawansowane logowanie bezpieczeństwa
- Penetration testing (post-MVP)

### 2.3. Infrastruktura i operacje

W zakresie:

**Środowiska testowe - 3 poziomy**:

1. **Unit tests**:
   - In-memory, bez infrastruktury
   - Vitest watch mode
   - Uruchamiane: lokalnie przez devs + CI na każdy push

2. **Integration tests**:
   - **Testcontainers** + Postgres (dynamiczne kontenery)
   - Migracje Supabase z `./supabase/migrations/`
   - **Fake auth** (mock userId, bez prawdziwego Supabase Auth)
   - Uruchamiane: lokalnie + CI na każdy PR

3. **E2E tests**:
   - **Supabase Cloud** (dedykowany projekt test)
   - Prawdziwy Supabase Auth (GoTrue)
   - **Ethereal Email** dla weryfikacji maili
   - Uruchamiane: lokalnie (opcjonalnie) + CI przed merge do master

**CI/CD Pipeline** (GitHub Actions):

- Workflow 1: Unit tests (każdy push)
- Workflow 2: Integration tests (każdy PR)
- Workflow 3: E2E tests (merge do master + releases)
- Workflow 4: Post-deploy smoke (po wdrożeniu na prod)

**SMTP i Email Testing**:

- Dev/Integration: Brak (nie potrzeba dla fake auth)
- E2E: Ethereal Email (https://ethereal.email) lub własny mailcatcher
- Prod: Supabase SMTP (Postmark/sandbox)

**Backup/Restore**:

- Poza zakresem MVP (tylko manualne sanity check)
- Post-MVP: automated tests (wykonanie backup + restore + smoke test)

**Monitoring i Observability**:

- CI metrics (success rate, duration)
- Test coverage reports (Codecov)
- Defect tracking (GitHub Issues)

**Świadomie poza zakresem**:

- ❌ Testy bezpieczeństwa (SQL injection, CSRF, XSS, pentesty)
- ❌ Load/stress testing (k6, Artillery)
- ❌ Advanced monitoring (Sentry, DataDog)
- ❌ Chaos engineering

**Uzasadnienie**:

- MVP scope
- Małe oczekiwane obciążenie
- Supabase ma wbudowane zabezpieczenia
- Można dodać post-MVP gdy będzie potrzeba

---

## 3. Typy testów

### 3.1. Testy jednostkowe (unit)

**Narzędzia**: Vitest + in-memory mocking

**Zakres**:

- Funkcje biznesowe:
  - Parsowanie kwot (kropka/przecinek/spacje) do groszy.
  - Bankierskie zaokrąglanie w agregacjach.
  - Obliczenia miesięczne (Dochód, Wydatki, Odłożone netto, Wolne środki).
  - Logika backdate i „korekt historycznych".
- Serwisy (czysta logika bez DB):
  - `transaction.service`, `goal.service`, `goal-event.service`.
  - `monthly-metrics.service`, `expenses-by-category.service`.
  - `rate-limit.service` (liczenie okien czasowych).
- Komponenty UI:
  - Walidacje formularzy.
  - Wyświetlanie błędów i stanów edge (np. brak danych, puste stany).

**Strategia**: Dla każdej funkcji/serwisu: **happy path + typowe błędy (niepoprawne argumenty) + wartości brzegowe**.

**Charakterystyka**:

- Szybkość: ~10ms per test
- Uruchamiane: przy każdym save (watch mode)
- Bez prawdziwej bazy danych
- Wszystkie zależności mockowane

**Przykład**:

```typescript
// src/lib/utils.test.ts
describe("parsePlnInputToCents", () => {
  it("should parse comma format", () => {
    expect(parsePlnInputToCents("1 234,56")).toBe(123456);
  });

  it("should throw on invalid input", () => {
    expect(() => parsePlnInputToCents("abc")).toThrow();
  });

  it("should handle edge case: zero", () => {
    expect(parsePlnInputToCents("0,00")).toBe(0);
  });
});
```

### 3.2. Testy integracyjne (API + DB)

**Narzędzia**: Vitest + Testcontainers + Playwright API Testing

**Zakres**:

- Testy endpointów `src/pages/api/v1/**` z prawdziwą bazą danych:
  - Poprawne przepływy (happy path).
  - Błędne dane wejściowe (walidacje, błędy domenowe).
  - Wartości brzegowe (skrajne daty, duże/małe kwoty, puste listy).
- Sprawdzenie:
  - RLS (użytkownik widzi tylko własne dane) - z fake auth.
  - Soft-delete (niewidoczność usuniętych rekordów w listach).
  - Audit_log (wpisy dla CREATE/UPDATE/DELETE).
  - Agregacje finansowe (sumy, progress celów).
  - Idempotencja operacji.

**Strategia autoryzacji**:

- **FAKE AUTH** - nie testujemy prawdziwego Supabase Auth
- Seed test userId bezpośrednio do DB
- Mockowanie tokenów JWT dla middleware
- Auth flow testowany osobno w E2E

**Setup środowiska**:

```typescript
// tests/setup-integration.ts
import { PostgreSqlContainer } from "@testcontainers/postgresql";

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  // Start Postgres container
  container = await new PostgreSqlContainer("postgres:15").withDatabase("finflow_test").start();

  process.env.DATABASE_URL = container.getConnectionUri();

  // Run Supabase migrations
  await runMigrations("./supabase/migrations");
}, 60000);

afterAll(async () => {
  await container.stop();
});

beforeEach(async () => {
  // Seed test user (fake, bez Supabase Auth)
  const testUserId = crypto.randomUUID();
  await db.query("INSERT INTO public.users (id, email) VALUES ($1, $2)", [testUserId, "test@example.com"]);
});

afterEach(async () => {
  // Clean tables
  await db.query("TRUNCATE transactions, goals, goal_events, audit_log CASCADE");
});
```

**Charakterystyka**:

- Szybkość: ~100-500ms per test
- Uruchamiane: na każdy commit (pre-commit hook)
- Prawdziwa Postgres przez Testcontainers
- Izolacja między testami (truncate po każdym)

**Przykład**:

```typescript
// tests/integration/transactions.integration.test.ts
describe("POST /api/v1/transactions", () => {
  let testUserId: string;

  beforeEach(async () => {
    testUserId = await seedTestUser();
  });

  it("should create transaction with valid data", async () => {
    const response = await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${mockToken(testUserId)}`)
      .send({
        amount: 10000,
        category_id: "food",
        transaction_date: "2024-01-15",
        type: "EXPENSE",
      });

    expect(response.status).toBe(201);
    expect(response.body.amount).toBe(10000);

    // Verify in DB
    const dbRecord = await db.query("SELECT * FROM transactions WHERE user_id = $1", [testUserId]);
    expect(dbRecord.rows).toHaveLength(1);
  });

  it("should return 400 for invalid amount", async () => {
    const response = await request(app)
      .post("/api/v1/transactions")
      .set("Authorization", `Bearer ${mockToken(testUserId)}`)
      .send({ amount: -100 });

    expect(response.status).toBe(400);
  });
});
```

### 3.3. Testy komponentowe / UI (React)

**Narzędzia**: Vitest + React Testing Library + MSW (Mock Service Worker)

**Zakres**:

- Formularze auth, transakcji, celów, goal_events.
- Filtry list i paginacja.
- Reakcja UI na błędy API (toasty, komunikaty).
- Optimistic updates + rollback.
- Walidacje inline.

**Strategia**: Dla każdego widoku: scenariusz **happy path**, scenariusze błędów (walidacje, 4xx/5xx), wartości brzegowe (np. długie notatki, skrajne daty).

**Mockowanie API**: MSW dla deterministycznych odpowiedzi API.

**Charakterystyka**:

- Szybkość: ~50-200ms per test
- Uruchamiane: na każdy commit
- Bez prawdziwego API (MSW handlers)
- Testowanie z perspektywy użytkownika

**Przykład**:

```typescript
// src/components/transactions/TransactionForm.test.tsx
import { render, screen, userEvent } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.post('/api/v1/transactions', () => {
    return HttpResponse.json({ id: '123', amount: 10000 });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('should submit transaction successfully', async () => {
  render(<TransactionForm />);

  await userEvent.type(screen.getByLabelText('Amount'), '100.00');
  await userEvent.selectOptions(screen.getByLabelText('Category'), 'food');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Transaction saved')).toBeInTheDocument();
});

test('should show error on API failure', async () => {
  server.use(
    http.post('/api/v1/transactions', () => {
      return HttpResponse.json({ error: 'Invalid data' }, { status: 400 });
    })
  );

  render(<TransactionForm />);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Invalid data')).toBeInTheDocument();
});
```

### 3.4. Testy E2E (smoke, ograniczone)

**Narzędzia**: Playwright + Supabase Cloud (test project) + Ethereal Email / Mailcatcher

**Zakres**:

- **Auth flows** (prawdziwy Supabase Auth):
  - Rejestracja → weryfikacja e-mail przez mailcatcher → pierwsze logowanie.
  - Logowanie z poprawnymi/błędnymi danymi.
  - Reset hasła.
  - Rate limiting (3/30min).
- **User flows**:
  - Logowanie → dodanie pierwszej transakcji → weryfikacja dashboardu.
  - Dodanie celu priorytetowego → wpłata i wypłata → weryfikacja dashboardu.
  - Nawigacja po miesiącach i filtry transakcji.
- **Visual regression** (opcjonalnie):
  - Screenshots kluczowych widoków (dashboard, transactions list).

**Strategia**: Dla każdego przepływu: **co najmniej jeden happy path** + minimalny scenariusz błędu (np. błędne hasło, brak wymaganych pól).

**Konfiguracja środowiska**:

- Aplikacja: deployed na test URL lub local dev server
- Database: Supabase Cloud (dedykowany projekt test)
- Email: Ethereal Email (ethereal.email) lub lokalny Mailcatcher
- Auth: prawdziwy Supabase GoTrue

**Setup przed testami**:

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:4321",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

**Charakterystyka**:

- Szybkość: ~5-15s per flow
- Uruchamiane: przed merge do master + przed release
- Prawdziwa aplikacja + Supabase Cloud
- Pełny przepływ użytkownika

**Przykład**:

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from "@playwright/test";
import { EtherealMailClient } from "./helpers/ethereal";

test.describe("Authentication", () => {
  let mailClient: EtherealMailClient;

  test.beforeAll(async () => {
    mailClient = new EtherealMailClient();
  });

  test("full registration and login flow", async ({ page }) => {
    const email = `test-${Date.now()}@example.com`;
    const password = "SecurePassword123!";

    // 1. Register
    await page.goto("/auth/register");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', password);
    await page.click('button[type="submit"]');

    await expect(page.locator("text=Check your email")).toBeVisible();

    // 2. Get verification link from email
    await page.waitForTimeout(2000);
    const verificationLink = await mailClient.getLastVerificationLink(email);

    // 3. Activate account
    await page.goto(verificationLink);
    await expect(page.locator("text=Email confirmed")).toBeVisible();

    // 4. Login
    await page.goto("/auth/login");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', password);
    await page.click('button[type="submit"]');

    // 5. Verify access
    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator("h1")).toContainText("Dashboard");
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.goto("/auth/login");
    await page.fill('[name="email"]', "wrong@example.com");
    await page.fill('[name="password"]', "wrongpass");
    await page.click('button[type="submit"]');

    await expect(page.locator("text=Invalid credentials")).toBeVisible();
  });
});
```

### 3.5. Testy regresji

**Strategia**:

- Zestaw unit + API + kluczowe E2E uruchamiany:
  - **Na każdym PR**: unit + integracyjne.
  - **Przed releasem**: unit + integracyjne + E2E smoke.
  - **Po deploy na prod**: smoke E2E (tylko happy paths).

**CI/CD Pipeline**:

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:unit

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/master'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install
      - run: npm run test:e2e
    env:
      TEST_BASE_URL: ${{ secrets.TEST_BASE_URL }}
      SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
      SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
```

---

## 4. Scenariusze testowe dla kluczowych funkcjonalności

> Uwaga: dla każdego scenariusza explicite planujemy **happy path**, **błąd(e)** i **wartości brzegowe**.

### 4.1. Auth i bezpieczeństwo kont (bez testów bezpieczeństwa jako takich)

- **Rejestracja (US‑001)**:
  - Happy path: poprawny e‑mail + hasło spełniające politykę → wysłanie maila, link ważny 30 min, po kliknięciu możliwość logowania.
  - Errory:
    - Nieprawidłowe hasło (za krótkie, bez cyfry, bez litery).
    - E‑mail w użyciu.
  - Brzegi:
    - Bardzo długi e‑mail w granicach specyfikacji.
    - Hasło z wieloma znakami specjalnymi.

- **Logowanie / wylogowanie (US‑002, US‑003)**:
  - Happy path: poprawne dane → wejście na dashboard, wylogowanie → przekierowanie na ekran logowania.
  - Errory:
    - Nieprawidłowe hasło.
    - Próba logowania przed weryfikacją e‑maila.
  - Brzegi:
    - Wielokrotne próby logowania z błędnym hasłem (bez nadmiernych komunikatów technicznych).

- **Reset hasła (US‑004)**:
  - Happy path: poprawny e‑mail → mail resetujący, ustawienie nowego hasła spełniającego politykę.
  - Errory:
    - E‑mail spoza bazy (bez ujawniania, czy konto istnieje).
    - Hasło nie spełnia polityki przy ustawianiu nowego.
  - Brzegi:
    - Link tuż przed i tuż po wygaśnięciu (30 min).

- **Rate limit verify/reset (3/30 min)**:
  - Happy path: 3 żądania w 30 min → wszystkie OK.
  - Error: 4‑te żądanie → blokada, komunikat/bander z czasem do odblokowania.
  - Brzegi:
    - Żądania na granicy okna czasowego (29:59, 30:01).

### 4.2. Transakcje

- **Dodanie wydatku (US‑007)**:
  - Happy path: poprawne dane (data, kwota > 0, kategoria z listy) → transakcja w liście i na dashboardzie.
  - Errory:
    - Brak kategorii.
    - Kwota ≤ 0.
    - Niepoprawny format kwoty (litery, wiele przecinków).
  - Brzegi:
    - Bardzo duża kwota w dopuszczalnym zakresie.
    - Kwota z różnymi formatami („1 234,56”, „1234.5”, „0,01”).

- **Dodanie dochodu (US‑008)**:
  - Happy path: dodanie dochodu, aktualizacja kart Dochód/Wolne środki.
  - Errory: brak kategorii, niewłaściwy typ (niezdefiniowana kategoria).
  - Brzegi: daty w skrajnych latach obsługiwanych przez aplikację.

- **Edycja transakcji (US‑009)**:
  - Happy path: zmiana daty i kwoty w tym samym miesiącu, dashboard i lista odświeżone.
  - Errory: próba ustawienia daty poza obsługiwanym zakresem, niepoprawna kategoria.
  - Brzegi: zmiana na inny miesiąc → poprawne przeniesienie wpływu na agregaty + banner „korekty historyczne”.

- **Usunięcie transakcji (soft-delete) (US‑010)**:
  - Happy path: usunięcie transakcji → zniknięcie z list i agregatów, wpis w audit_log.
  - Errory: próba usunięcia nieistniejącej transakcji / transakcji innego użytkownika.
  - Brzegi: usunięcie transakcji granicznej na stronie paginacji (bez psucia paginacji).

- **Filtry i paginacja (US‑011 – US‑015)**:
  - Happy path:
    - Filtr po typie, miesiącu, kategorii, tekście → poprawne dane i sumy.
    - Paginacja 50/s, brak duplikatów.
  - Errory: niepoprawny miesiąc/rok w parametrach (API) → błąd walidacji.
  - Brzegi:
    - Pusta lista (brak transakcji).
    - Duża liczba transakcji (test wydajności + poprawność keyset).

### 4.3. Cele i goal_events

- **Tworzenie celu (US‑019)**:
  - Happy path: poprawne dane (typ, nazwa, kwota docelowa > 0), opcjonalne oznaczenie jako priorytet.
  - Errory: brak typu, kwota ≤ 0.
  - Brzegi: bardzo duża kwota docelowa, skrajnie długa nazwa w dopuszczalnym limicie.

- **Priorytet celu (US‑020)**:
  - Happy path: ustawienie priorytetu → tylko jeden cel priorytetowy, dashboard pokazuje jego progress.
  - Errory: próba ustawienia priorytetu na celu zarchiwizowanym.
  - Brzegi: szybka zmiana priorytetu między kilkoma celami (spójność w dashboardzie).

- **Archiwizacja celu (US‑021)**:
  - Happy path: archiwizacja → cel znika z aktywnych, historyczne raporty zachowują się poprawnie.
  - Errory: archiwizacja nieistniejącego celu / innego użytkownika.
  - Brzegi: archiwizacja celu z dużą liczbą historycznych wpłat/wypłat.

- **Wpłata / wypłata (US‑022, US‑023)**:
  - Happy path:
    - DEPOSIT zwiększa stan celu i wpływa na Odłożone netto/Wolne środki.
    - WITHDRAW zmniejsza stan, nie pozwala zejść poniżej zera.
  - Errory:
    - Próba wypłaty powyżej stanu.
    - Niepoprawna kwota / data.
  - Brzegi:
    - Wpłaty/wypłaty na granicy miesiąca (31/01 vs 01/02).
    - Wiele operacji w krótkim czasie (idempotencja, brak podwójnych zapisów).

### 4.4. Dashboard i raportowanie

- **Karty 2×2 (US‑016)**:
  - Happy path: poprawne sumy dla wybranego miesiąca, tooltip z właściwym wzorem.
  - Errory: brak danych – sensowny komunikat/pusty stan.
  - Brzegi: miesiące bez transakcji vs miesiące o dużej liczbie transakcji.

- **Wykres wydatków wg kategorii (US‑017)**:
  - Happy path: poprawne sumy per kategoria, formatowanie kwot.
  - Errory: błędne parametry wejściowe w API (np. nieprawidłowy zakres dat).
  - Brzegi: jedna dominująca kategoria z bardzo dużą wartością (skalowanie wykresu).

- **Progress celu priorytetowego (US‑018)**:
  - Happy path: poprawne wartości całkowite i „zmiana w tym miesiącu”.
  - Errory: brak priorytetu → placeholder/CTA, brak błędów w konsoli.
  - Brzegi: cel osiągnięty (100%) i przekroczony (powyżej 100%).

### 4.5. Audit_log, RLS (jako funkcjonalne)

- **Audit_log**:
  - Happy path: każda operacja CREATE/UPDATE/DELETE generuje wpis z właściwymi polami.
  - Errory: próba odczytu audit_log bez autoryzacji.
  - Brzegi: duża liczba wpisów dla jednego użytkownika, retencja 30 dni (testowana przez manipulację czasem w środowisku testowym lub symulację).

- **RLS**:
  - Happy path: użytkownik widzi tylko swoje transakcje, cele, audit_log.
  - Errory: próba zapisu/odczytu danych innego użytkownika → odmowa.
  - Brzegi: operacje tuż po usunięciu konta / soft-delete danych biznesowych.

---

## 5. Środowisko testowe

### Strategia 3-poziomowa

Rozdzielamy środowiska testowe według typu testów, optymalizując pod kątem szybkości i izolacji.

### 5.1. Środowisko dla testów UNIT (lokalne, in-memory)

**Infrastruktura**:

- Brak - wszystko in-memory
- Vitest watch mode
- Mocki dla wszystkich zależności

**Konfiguracja**:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom", // dla testów React
    globals: true,
    setupFiles: ["./tests/setup-unit.ts"],
  },
});
```

**Zastosowanie**:

- Development workflow (watch mode przy każdym save)
- Szybka weryfikacja logiki biznesowej
- Pre-commit hook

**Charakterystyka**:

- Szybkość: ~10ms per test
- Izolacja: pełna (brak side effects)
- Setup: zero

---

### 5.2. Środowisko dla testów INTEGRACYJNYCH (Testcontainers)

**Infrastruktura**:

- **Testcontainers** - dynamiczne kontenery Docker per test suite
- Postgres 15 (bez Supabase Auth/GoTrue)
- Migracje z `./supabase/migrations/`
- Fake auth (mock userId + tokens)

**Dlaczego Testcontainers zamiast stałego docker-compose:**

- ✅ Dynamiczne tworzenie/usuwanie kontenerów
- ✅ Pełna izolacja między test suites
- ✅ Działa identycznie lokalnie i w CI
- ✅ Programmatic control (seed, cleanup)
- ✅ Deterministyczne środowisko

**Konfiguracja**:

```typescript
// vitest.config.integration.ts
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.integration.test.ts"],
    environment: "node",
    setupFiles: ["./tests/setup-integration.ts"],
    testTimeout: 30000, // dłuższy timeout dla kontenerów
    // Run serially to avoid port conflicts
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
```

```typescript
// tests/setup-integration.ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

let container: StartedPostgreSqlContainer;

export async function setup() {
  console.log("Starting Postgres container...");

  container = await new PostgreSqlContainer("postgres:15")
    .withDatabase("finflow_test")
    .withUsername("postgres")
    .withPassword("postgres")
    .start();

  const connectionUri = container.getConnectionUri();
  process.env.DATABASE_URL = connectionUri;

  console.log("Running Supabase migrations...");
  await runMigrations(connectionUri);

  console.log("Test environment ready!");
}

export async function teardown() {
  console.log("Stopping container...");
  await container?.stop();
}

async function runMigrations(dbUrl: string) {
  // Uruchom migracje z ./supabase/migrations/
  const migrationFiles = await fs.readdir("./supabase/migrations");

  for (const file of migrationFiles.sort()) {
    const sql = await fs.readFile(`./supabase/migrations/${file}`, "utf-8");
    await db.query(sql);
  }
}
```

**Helpers dla testów**:

```typescript
// tests/helpers/test-auth.ts
export function createMockToken(userId: string): string {
  // Mock JWT token dla testów
  return `mock-${userId}`;
}

export async function seedTestUser(email = "test@example.com"): Promise<string> {
  const userId = crypto.randomUUID();
  await db.query("INSERT INTO public.users (id, email, created_at) VALUES ($1, $2, NOW())", [userId, email]);
  return userId;
}

export async function cleanDatabase() {
  // Truncate wszystkie tabele biznesowe (zachowaj strukturę)
  await db.query(`
    TRUNCATE transactions, goals, goal_events, audit_log, categories, goal_types CASCADE;
    DELETE FROM public.users;
  `);
}
```

**Middleware adaptation dla testów**:

```typescript
// src/middleware/index.ts
export async function authMiddleware(context: APIContext) {
  const token = context.request.headers.get("Authorization")?.replace("Bearer ", "");

  // TEST MODE: akceptuj mock tokeny
  if (import.meta.env.MODE === "test" && token?.startsWith("mock-")) {
    const userId = token.replace("mock-", "");
    context.locals.userId = userId;
    context.locals.user = { id: userId, email: "test@example.com" };
    return;
  }

  // PRODUCTION: prawdziwa weryfikacja Supabase
  const supabase = createServerClient(/* ... */);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  context.locals.userId = data.user.id;
  context.locals.user = data.user;
}
```

**Zastosowanie**:

- Testy API endpoints (wszystkie CRUD operacje)
- Testy serwisów z DB (agregacje, soft-delete, RLS)
- Testy logiki biznesowej wymagającej Postgres
- Pre-commit hook + CI na każdym PR

**Charakterystyka**:

- Szybkość: ~100-500ms per test (+ ~10s startup kontenera)
- Izolacja: per test suite (cleanup między testami)
- Setup: automatyczny (Testcontainers)

**CI Configuration**:

```yaml
# .github/workflows/integration-tests.yml
jobs:
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci

      # Testcontainers potrzebuje Dockera (już jest w GitHub Actions)
      - name: Run integration tests
        run: npm run test:integration
```

---

### 5.3. Środowisko dla testów E2E (Supabase Cloud)

**Infrastruktura**:

- **Supabase Cloud** - dedykowany projekt testowy
- **Prawdziwy Supabase Auth** (GoTrue)
- **Ethereal Email** (https://ethereal.email) lub własny mailcatcher
- Aplikacja: deployed na test URL lub local dev server

**Dlaczego Supabase Cloud (nie lokalne):**

- ✅ Pełny stack Supabase (Auth, Storage, Edge Functions)
- ✅ Prawdziwy Auth flow (rejestracja, weryfikacja email, reset hasła)
- ✅ SMTP skonfigurowane (wysyłka maili)
- ✅ Brak potrzeby lokalnej konfiguracji dla każdego dewelopera
- ✅ Identyczne jak produkcja

**Setup projektu Supabase test**:

```bash
# 1. Utwórz nowy projekt w Supabase Dashboard
# Nazwa: finflow-test

# 2. Skonfiguruj SMTP (Ethereal lub własny)
# Settings -> Auth -> SMTP Settings

# 3. Uruchom migracje
supabase link --project-ref your-test-project-ref
supabase db push

# 4. Skonfiguruj zmienne środowiskowe
```

**Konfiguracja**:

```typescript
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // Sequentially dla stabilności
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,

  reporter: [["html"], ["list"]],

  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:4321",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start dev server lokalnie (opcjonalnie)
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:4321",
        reuseExistingServer: !process.env.CI,
      },
});
```

**Environment variables**:

```bash
# .env.test (dla E2E)
PUBLIC_SUPABASE_URL=https://your-test-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-test-anon-key
TEST_BASE_URL=http://localhost:4321  # lub deployed test URL

# Ethereal Email credentials (opcjonalnie)
ETHEREAL_USER=your-ethereal-user
ETHEREAL_PASS=your-ethereal-pass
```

**Helper dla email verification**:

```typescript
// tests/e2e/helpers/ethereal.ts
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";

export class EtherealMailClient {
  private transporter: any;

  async init() {
    // Utwórz test account w Ethereal
    const testAccount = await nodemailer.createTestAccount();

    this.transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  async getLastVerificationLink(email: string): Promise<string> {
    // Pobierz ostatni email z Ethereal API
    // Parsuj link weryfikacyjny
    // Return link
    // Implementacja zależy od ustawienia Supabase SMTP
    // Alternatywnie: użyj Supabase Admin API do pobrania linku
  }
}
```

**Cleanup między testami**:

```typescript
// tests/e2e/setup.ts
import { test as base } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

export const test = base.extend({
  cleanupUser: async ({}, use) => {
    const users: string[] = [];

    await use(async (email: string) => {
      users.push(email);
    });

    // Cleanup after test
    const supabase = createClient(
      process.env.PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY! // service key dla admin operacji
    );

    for (const email of users) {
      // Delete test users
      await supabase.auth.admin.deleteUser(email);
    }
  },
});
```

**Zastosowanie**:

- Testy auth flow (rejestracja, login, reset hasła)
- Pełne user journeys (dashboard, transakcje, cele)
- Visual regression testing (opcjonalnie)
- Smoke testy po deploy

**Charakterystyka**:

- Szybkość: ~5-15s per flow
- Izolacja: per test (cleanup users)
- Setup: jednorazowy (Supabase projekt + env vars)
- Uruchamiane: przed merge do master + przed release

**CI Configuration**:

```yaml
# .github/workflows/e2e-tests.yml
jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    # Only on master or release branches
    if: github.ref == 'refs/heads/master' || startsWith(github.ref, 'refs/tags/')

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          TEST_BASE_URL: ${{ secrets.TEST_BASE_URL }}
          PUBLIC_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_KEY }}

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

---

### 5.4. Środowisko `prod`

**Zastosowanie** (ograniczone):

- Smoke testy po wdrożeniu:
  - Login z prawdziwym kontem testowym
  - Odczyt dashboardu
  - Podstawowe operacje CRUD
- Monitoring uptime/health checks

**NIE używamy do**:

- ❌ Rozwojowych testów
- ❌ Testów destrukcyjnych
- ❌ Load testing

**Charakterystyka**:

- Uruchamiane: tylko po deploy
- Zakres: minimal smoke (2-3 critical paths)
- Timeout: krótki (fail fast)

---

## 6. Narzędzia do testowania

### Stack technologiczny

```yaml
Unit Testing:
  framework: Vitest
  runner: Vitest (watch mode)
  coverage: Vitest Coverage (v8 provider)
  mocking: Vitest (built-in)
  environment: jsdom (React) / node (pure TS)

UI Testing:
  framework: React Testing Library
  runner: Vitest
  mocking: MSW (Mock Service Worker) - API responses
  assertions: @testing-library/jest-dom
  user_interactions: @testing-library/user-event

Integration Testing:
  framework: Vitest
  database: Testcontainers (PostgreSqlContainer)
  api_testing: Playwright API Testing
  migrations: Supabase migrations (from ./supabase/migrations/)
  cleanup: truncate between tests

E2E Testing:
  framework: Playwright
  browsers: Chromium (primary), Firefox/WebKit (optional)
  visual_regression: Playwright Screenshots (built-in)
  email_testing: Ethereal Email (ethereal.email)
  auth: Supabase Cloud (real Auth/GoTrue)

Quality & Analysis:
  linting: ESLint
  formatting: Prettier
  type_checking: TypeScript (strict mode)
  mutation_testing: Stryker Mutator (optional, for critical logic)

CI/CD:
  platform: GitHub Actions
  workflows:
    - lint + unit (every push)
    - integration (every PR)
    - e2e (merge to master + releases)
```

### Dlaczego te narzędzia?

#### **Vitest** (zamiast Jest)

✅ Natywna integracja z Vite/Astro  
✅ Znacznie szybszy (~10x) dzięki ESM  
✅ Out-of-the-box TypeScript support  
✅ Hot Module Reload dla testów (watch mode)  
✅ API kompatybilne z Jest (łatwa migracja)  
✅ Single config dla unit + integration

#### **Playwright** (zamiast Cypress)

✅ Lepsza wydajność i stabilność  
✅ Natywne wsparcie dla wielu przeglądarek  
✅ Built-in API testing (nie potrzeba Supertest)  
✅ Auto-waiting i retry logic  
✅ Lepsze headless mode dla CI  
✅ Trace viewer dla debugging

#### **Testcontainers** (zamiast docker-compose)

✅ Dynamiczne tworzenie kontenerów per test suite  
✅ Programmatic control (seed, cleanup)  
✅ Pełna izolacja między testami  
✅ Działa identycznie lokalnie i w CI  
✅ Brak manual setup

#### **MSW** (Mock Service Worker)

✅ Mockowanie API na poziomie network  
✅ Działa w testach i przeglądarce  
✅ Deterministyczne odpowiedzi API  
✅ Symulacja błędów i edge cases

#### **Supabase Cloud** dla E2E (nie lokalne)

✅ Prawdziwy Supabase Auth (GoTrue)  
✅ SMTP skonfigurowane (wysyłka maili)  
✅ Zero setup dla deweloperów  
✅ Identyczne jak produkcja

### Instalacja i konfiguracja

```bash
# Package.json dependencies
npm install -D \
  vitest \
  @vitest/coverage-v8 \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  @playwright/test \
  @testcontainers/postgresql \
  msw \
  jsdom

# Optional: mutation testing
npm install -D @stryker-mutator/core @stryker-mutator/vitest
```

### Scripts w package.json

```json
{
  "scripts": {
    "test": "npm run test:unit && npm run test:integration",

    "test:unit": "vitest run src/**/*.test.{ts,tsx}",
    "test:unit:watch": "vitest watch src/**/*.test.{ts,tsx}",
    "test:unit:coverage": "vitest run --coverage src/**/*.test.{ts,tsx}",

    "test:integration": "vitest run tests/integration/**/*.integration.test.ts",
    "test:integration:watch": "vitest watch tests/integration/**/*.integration.test.ts",

    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:headed": "playwright test --headed",

    "test:mutation": "stryker run",

    "test:all": "npm run test && npm run test:e2e"
  }
}
```

### Struktura katalogów testowych

```
/home/karolina/Desktop/10xDEVS/DEVS_code/10x-project/
├── src/
│   ├── lib/
│   │   ├── utils.ts
│   │   └── utils.test.ts              # Unit test obok kodu
│   ├── components/
│   │   └── transactions/
│   │       ├── TransactionForm.tsx
│   │       └── TransactionForm.test.tsx
│   └── ...
│
├── tests/
│   ├── setup-unit.ts                   # Global setup dla unit
│   ├── setup-integration.ts            # Testcontainers setup
│   │
│   ├── integration/                    # Testy integracyjne API
│   │   ├── transactions.integration.test.ts
│   │   ├── goals.integration.test.ts
│   │   └── metrics.integration.test.ts
│   │
│   ├── e2e/                            # Testy E2E (Playwright)
│   │   ├── auth.spec.ts
│   │   ├── dashboard.spec.ts
│   │   ├── transactions.spec.ts
│   │   └── helpers/
│   │       ├── ethereal.ts
│   │       └── test-data.ts
│   │
│   └── helpers/                        # Shared helpers
│       ├── test-auth.ts
│       ├── test-db.ts
│       └── factories.ts
│
├── vitest.config.ts                    # Config dla unit + integration
├── playwright.config.ts                # Config dla E2E
└── stryker.config.json                 # Optional: mutation testing
```

### Konfiguracje

**vitest.config.ts**:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  test: {
    // Unit tests
    include: ["src/**/*.test.{ts,tsx}", "tests/integration/**/*.integration.test.ts"],

    globals: true,
    environment: "jsdom",

    setupFiles: ["./tests/setup-unit.ts"],

    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}", "src/types.ts", "src/env.d.ts"],
      // Targets
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

**playwright.config.ts**:

```typescript
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

export default defineConfig({
  testDir: "./tests/e2e",

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["list"],
    ["junit", { outputFile: "test-results/junit.xml" }],
  ],

  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:4321",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    // Timeout per action
    actionTimeout: 10000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start dev server lokalnie
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:4321",
        reuseExistingServer: true,
        timeout: 120000,
      },
});
```

### CI/CD Workflows

**GitHub Actions** - 3 osobne workflow:

```yaml
# .github/workflows/unit-tests.yml
name: Unit Tests

on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - run: npm ci

      - name: Run unit tests
        run: npm run test:unit:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/coverage-final.json
```

```yaml
# .github/workflows/integration-tests.yml
name: Integration Tests

on: [pull_request]

jobs:
  integration:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - run: npm ci

      # Docker już jest dostępny w GitHub Actions
      - name: Run integration tests
        run: npm run test:integration
        env:
          NODE_ENV: test
```

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on:
  push:
    branches: [master]
  release:
    types: [published]

jobs:
  e2e:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          TEST_BASE_URL: ${{ secrets.TEST_BASE_URL }}
          PUBLIC_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_KEY }}

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

### Monitoring i metryki

- **Coverage reports**: Codecov lub własny HTML report
- **Test results**: JUnit XML dla integracji z GitHub
- **E2E artifacts**: Screenshots i videos w przypadku failures
- **Performance**: Playwright trace viewer dla slow tests

---

## 7. Harmonogram testów i implementacji

### Faza 1: Fundamenty testowania (Tydzień 1-2)

**Cel**: Ustanowienie infrastruktury testowej i pokrycie logiki biznesowej.

**Zadania**:

1. **Setup środowiska testowego**:
   - Konfiguracja Vitest + TypeScript
   - Setup Testcontainers dla testów integracyjnych
   - Konfiguracja projektu Supabase Cloud (test)
   - Setup GitHub Actions workflows (podstawowe)

2. **Testy unit - logika finansowa** (PRIORYTET):
   - Parsowanie kwot (różne formaty: kropka, przecinek, spacje)
   - Bankierskie zaokrąglanie w agregacjach
   - Obliczenia miesięczne (Dochód, Wydatki, Odłożone netto, Wolne środki)
   - Walidacje schematów (Zod schemas)

3. **Testy unit - serwisy** (mock DB):
   - `transaction.service` (podstawowa logika bez DB)
   - `goal.service` (walidacje, obliczenia progress)
   - `rate-limit.service` (okna czasowe)

**Deliverables**:

- ✅ Vitest działa w watch mode
- ✅ >80% coverage dla logiki finansowej
- ✅ CI uruchamia testy unit na każdym push

**Metryka sukcesu**: Wszystkie kluczowe funkcje biznesowe pokryte testami unit (happy path + error + edge cases).

---

### Faza 2: Testy integracyjne API (Tydzień 2-3)

**Cel**: Pokrycie wszystkich endpointów API z prawdziwą bazą danych.

**Zadania**:

1. **Setup Testcontainers**:
   - Konfiguracja PostgreSQL container
   - Automatyczne uruchamianie migracji Supabase
   - Helpers dla seed/cleanup danych
   - Fake auth middleware dla testów

2. **Testy API - Transakcje**:
   - POST /api/v1/transactions (create)
   - PUT /api/v1/transactions/[id] (update)
   - DELETE /api/v1/transactions/[id] (soft-delete)
   - GET /api/v1/transactions (list + filtry + paginacja)
   - Wszystkie scenariusze: happy path, błędy walidacji, edge cases

3. **Testy API - Cele**:
   - CRUD operations
   - Priorytet (tylko jeden aktywny)
   - Archiwizacja
   - Goal events (wpłaty/wypłaty)

4. **Testy API - Metryki**:
   - GET /api/v1/metrics/monthly
   - GET /api/v1/metrics/expenses-by-category
   - GET /api/v1/metrics/priority-goal
   - Weryfikacja obliczeń z różnymi zestawami danych

5. **Testy funkcjonalności cross-cutting**:
   - RLS (użytkownik widzi tylko swoje dane)
   - Soft-delete (niewidoczność usuniętych)
   - Audit log (wpisy dla każdej zmiany)

**Deliverables**:

- ✅ Wszystkie endpointy API pokryte testami integracyjnymi
- ✅ Testcontainers działają lokalnie i w CI
- ✅ CI uruchamia testy integracyjne na każdym PR

**Metryka sukcesu**: 100% endpointów API ma co najmniej 3 testy (happy, error, edge).

---

### Faza 3: Testy komponentów UI (Tydzień 3-4)

**Cel**: Pokrycie React components z perspektywy użytkownika.

**Zadania**:

1. **Setup React Testing Library + MSW**:
   - Konfiguracja jsdom environment
   - Setup MSW handlers dla API
   - Helpers dla renderowania z context providers

2. **Testy formularzy**:
   - TransactionForm (add/edit)
   - GoalForm (create/edit)
   - GoalEventForm (deposit/withdraw)
   - Auth forms (w zakresie UI, bez prawdziwego auth)

3. **Testy list i widoków**:
   - TransactionsList (filtry, paginacja, empty states)
   - GoalsList (sorting, archiving)
   - Dashboard cards (wyświetlanie metryk)

4. **Testy interakcji**:
   - Optimistic updates + rollback
   - Walidacje inline
   - Error handling (toasty, komunikaty)
   - Loading states

**Deliverables**:

- ✅ Wszystkie kluczowe komponenty pokryte testami
- ✅ MSW mockuje API responses
- ✅ >70% coverage dla komponentów

**Metryka sukcesu**: Każdy formularz i widok ma testy happy path + error handling.

---

### Faza 4: Testy E2E (Tydzień 4-5)

**Cel**: Pokrycie krytycznych user flows z prawdziwym auth i infrastrukturą.

**Zadania**:

1. **Setup Playwright + Supabase Cloud**:
   - Konfiguracja projektu test w Supabase
   - Setup Ethereal Email dla weryfikacji maili
   - Helpers dla cleanup test users
   - Playwright setup w CI

2. **E2E - Auth flows**:
   - Rejestracja → weryfikacja email → login
   - Login z błędnymi credentials
   - Reset hasła (full flow)
   - Rate limiting (3/30min)
   - Wylogowanie

3. **E2E - Transakcje**:
   - Login → dodanie pierwszej transakcji → weryfikacja na liście i dashboardzie
   - Edycja transakcji → aktualizacja metryk
   - Usunięcie transakcji → zniknięcie z widoków
   - Filtry i paginacja

4. **E2E - Cele**:
   - Utworzenie celu priorytetowego
   - Wpłata do celu → weryfikacja dashboardu
   - Wypłata z celu → walidacja min. 0
   - Archiwizacja celu

5. **E2E - Dashboard i nawigacja**:
   - Nawigacja po miesiącach (prev/next)
   - Weryfikacja 4 kart metryk
   - Wykres wydatków wg kategorii
   - Progress celu priorytetowego

**Deliverables**:

- ✅ Playwright uruchomiony lokalnie i w CI
- ✅ Wszystkie krytyczne user flows pokryte
- ✅ Ethereal Email integration działa

**Metryka sukcesu**: Minimum 10 E2E testów pokrywających wszystkie kluczowe user stories z PRD.

---

### Faza 5: Stabilizacja i regresja (Tydzień 5-6)

**Cel**: Dopracowanie testów, CI/CD i przygotowanie do produkcji.

**Zadania**:

1. **Optymalizacja CI/CD**:
   - Parallel runs dla testów unit
   - Retry logic dla flaky E2E tests
   - Artifacts (screenshots, videos, coverage reports)
   - Badge'e w README (coverage, build status)

2. **Visual regression** (opcjonalnie):
   - Screenshots kluczowych widoków
   - Baseline images
   - Automatyczne porównywanie w CI

3. **Mutation testing** (opcjonalnie, dla krytycznej logiki):
   - Setup Stryker dla logiki finansowej
   - Analiza coverage quality
   - Dodanie brakujących testów

4. **Dokumentacja testowa**:
   - README w /tests/ z instrukcjami
   - Przykłady uruchamiania testów lokalnie
   - Troubleshooting guide
   - Opisy test helpers i factories

5. **Smoke tests na prod**:
   - Minimalne E2E (login, dashboard, add transaction)
   - Health check endpoints
   - Post-deployment verification

**Deliverables**:

- ✅ Pełny zestaw testów regresyjnych
- ✅ CI/CD w pełni zautomatyzowane
- ✅ Dokumentacja testowa
- ✅ Smoke tests na prod

**Metryka sukcesu**:

- Zero known severity 1 bugs
- All CI checks pass
- <5% flaky E2E tests
- Coverage >80% (unit), >90% (integration API)

---

### Ciągłe wykonywanie (Ongoing)

**Strategia testowania na różnych etapach**:

| Etap                         | Testy uruchamiane              | Czas      | Blokujące? |
| ---------------------------- | ------------------------------ | --------- | ---------- |
| **Development (watch mode)** | Unit tests                     | ~instant  | Nie        |
| **Pre-commit hook**          | Unit + linting                 | <30s      | Tak        |
| **Push / PR**                | Unit + Integration             | ~2-5min   | Tak        |
| **Merge to master**          | Unit + Integration + E2E smoke | ~10-15min | Tak        |
| **Release**                  | Full suite (wszystkie)         | ~20-30min | Tak        |
| **Post-deploy (prod)**       | Smoke E2E                      | ~2-3min   | Monitoring |

**Developer workflow**:

```bash
# 1. Development - watch mode
npm run test:unit:watch

# 2. Before commit - quick check
npm run test:unit

# 3. Before push - integration
npm run test

# 4. Opcjonalnie - E2E lokalnie
npm run test:e2e:ui  # Playwright UI mode
```

**Pre-commit hook** (Husky):

```bash
# .husky/pre-commit
#!/bin/sh
npm run test:unit
npm run lint
```

---

## 8. Kryteria akceptacji testów

### 8.1. Pokrycie funkcjonalne

**Wymagania minimalne**:

- ✅ Wszystkie kluczowe user stories z PRD (auth, transakcje, cele, dashboard, audit_log) mają:
  - Co najmniej **jeden happy path** przetestowany automatycznie
  - Co najmniej **jeden scenariusz błędu** (walidacje, błędy API)
  - Co najmniej **jeden przypadek brzegowy** (edge case)
- ✅ 100% endpointów API pokrytych testami integracyjnymi
- ✅ Wszystkie formularze UI pokryte testami komponentowymi
- ✅ Krytyczne user flows pokryte testami E2E (minimum 10 flows)

**Metryka**:

```
Total test count (target):
- Unit tests: ~150-200
- Integration tests: ~50-80
- UI component tests: ~40-60
- E2E tests: ~10-15

Total: ~250-355 tests
```

### 8.2. Jakość kodu i testów

**Coverage targets**:

- Unit tests:
  - Lines: ≥80%
  - Functions: ≥80%
  - Branches: ≥75%
  - **Logika finansowa: 100%** (krytyczna)
- Integration tests (API):
  - Endpoints coverage: 100%
  - Business logic paths: ≥90%
- UI tests:
  - Components coverage: ≥70%
  - Critical forms: 100%

**Quality gates**:

- ✅ Zero console.errors w testach
- ✅ Zero flaky tests (jeśli test failuje losowo → napraw lub disable)
- ✅ Wszystkie testy mają czytelne nazewnictwo (describe/it)
- ✅ Test setup i cleanup są deterministyczne
- ✅ Brak hardcoded delays (tylko smart waits: waitFor, await expect)

### 8.3. Jakość danych i obliczeń

**Krytyczne wymogi**:

- ✅ **Brak znanych błędów w obliczeniach finansowych** (potwierdzone testami unit + integration)
- ✅ Bankierskie zaokrąglanie poprawnie zaimplementowane i przetestowane
- ✅ Agregacje miesięczne (Dochód, Wydatki, Odłożone netto, Wolne środki) zgodne ze wzorami z PRD
- ✅ Progress celów obliczany prawidłowo (z uwzględnieniem wpłat i wypłat)
- ✅ Backdate i korekty historyczne aktualizują agregatów poprawnie

**Przypadki testowe**:

- Różne formaty kwot: "1234,56", "1 234.50", "0,01"
- Skrajne kwoty: 0.01 PLN, 999999999.99 PLN
- Różne miesiące: styczeń (1), grudzień (12), lata przestępne
- Operacje na granicy miesięcy: 31.01 vs 01.02

### 8.4. Stabilność systemu

**Defekty**:

- ✅ **Zero otwartych defektów Severity 1** (blokujące funkcjonalność)
- ✅ Otwarte defekty Severity 2 opisane, priorytetyzowane i zaakceptowane przez PO
- ✅ Defekty Severity 3 (kosmetyczne) udokumentowane w backlogu

**Severity definitions**:

- **Severity 1**: Crash, data loss, broken auth, broken critical flow (transakcje/cele)
- **Severity 2**: Partial feature broken, workaround exists, visual bugs in key areas
- **Severity 3**: Cosmetic issues, minor UX problems, edge case bugs

**CI/CD stability**:

- ✅ Pipeline success rate ≥95% (bez flaky tests)
- ✅ Average pipeline time: <10 min (unit + integration)
- ✅ E2E pipeline time: <15 min
- ✅ Zero manual steps required (fully automated)

### 8.5. Wydajność (basic sanity, bez dedicated performance testing)

**Akceptowalne czasy odpowiedzi** (observed during integration tests):

- API GET requests (list): <500ms dla typowych rozmiarów (50 items)
- API POST/PUT/DELETE: <200ms
- Dashboard metrics: <1s (all 3 API calls combined)
- Page loads (E2E): <3s (initial + hydration)

**Uwaga**: To są **sanity checks**, nie pełne testy wydajnościowe. Świadomie pomijamy:

- ❌ Load testing (concurrent users)
- ❌ Stress testing (breaking points)
- ❌ Soak testing (long-running stability)

Uzasadnienie: MVP, małe obciążenie spodziewane, Supabase skaluje automatycznie.

### 8.6. Bezpieczeństwo

**Zakres na tym etapie**: **OGRANICZONY** (świadoma decyzja)

**Testujemy tylko funkcjonalnie**:

- ✅ RLS policies (użytkownik widzi tylko swoje dane) - testy integracyjne
- ✅ Soft-delete (brak dostępu do usuniętych) - testy integracyjne
- ✅ Rate limiting (3/30 min dla verify/reset) - testy E2E
- ✅ Podstawowa walidacja inputów (Zod schemas) - testy unit

**Świadomie POMIJAMY**:

- ❌ Penetration testing
- ❌ OWASP Top 10 (SQL injection, XSS, CSRF, etc.)
- ❌ Security audits
- ❌ Automated vulnerability scanning (Snyk, Dependabot - opcjonalnie można dodać)

**Uzasadnienie**:

- MVP scope
- Supabase ma built-in zabezpieczenia (RLS, SQL injection protection)
- Można dodać w post-MVP
- PO akceptuje to ryzyko

**Akcje post-MVP** (backlog):

- [ ] Dodać automated security scanning (npm audit, Snyk)
- [ ] Code review z focus na security
- [ ] Penetration testing przed public release

### 8.7. Dokumentacja testowa

**Wymagania**:

- ✅ README w `/tests/` z instrukcjami setup i run
- ✅ Każdy test ma czytelną nazwę (BDD style: "should X when Y")
- ✅ Skomplikowane test cases mają komentarze
- ✅ Helpers i utilities są udokumentowane (JSDoc)
- ✅ CI/CD pipeline opisany w dokumentacji

**Przykład dobrej nazwy testu**:

```typescript
// ❌ Bad
test('transaction test 1', () => { ... });

// ✅ Good
test('should create transaction with valid data and update monthly metrics', () => { ... });

// ✅ Even better (BDD style)
describe('POST /api/v1/transactions', () => {
  describe('when user provides valid data', () => {
    it('should create transaction and return 201', () => { ... });
    it('should update monthly income/expenses', () => { ... });
    it('should create audit log entry', () => { ... });
  });

  describe('when user provides invalid amount', () => {
    it('should return 400 with validation error', () => { ... });
  });
});
```

### 8.8. Release readiness checklist

**Przed każdym releasem**:

- [ ] ✅ All CI checks pass (unit + integration + E2E)
- [ ] ✅ Coverage targets met (≥80% unit, 100% API endpoints)
- [ ] ✅ Zero Severity 1 defects open
- [ ] ✅ All Severity 2 defects triaged and accepted
- [ ] ✅ E2E tests pass 3 consecutive times (no flakiness)
- [ ] ✅ Smoke tests on staging pass
- [ ] ✅ Documentation updated (if public APIs changed)
- [ ] ✅ Changelog updated

**Post-deploy verification** (production smoke):

- [ ] Login works (real test user)
- [ ] Dashboard loads with correct data
- [ ] Can create transaction
- [ ] Can create goal
- [ ] Email delivery works (verify + reset)

**Rollback criteria**:

- Smoke tests fail on production
- Severity 1 defect discovered post-deploy
- > 5% error rate in monitoring (if available)

---

## 9. Role i odpowiedzialności

### 9.1. QA Engineer / Test Lead

**Odpowiedzialności**:

- ✅ Utrzymanie i aktualizacja tego planu testów
- ✅ Projektowanie scenariuszy testowych (happy path + error + edge cases)
- ✅ Code review testów pisanych przez deweloperów
- ✅ Automatyzacja testów E2E (Playwright)
- ✅ Monitoring jakości (coverage, flaky tests, CI stability)
- ✅ Raportowanie statusu testów (weekly/release reports)
- ✅ Triaging defektów (severity assignment)
- ✅ Utrzymanie test helpers i utilities

**Deliverables**:

- Test plan (ten dokument)
- E2E test suite (Playwright)
- Test reports przed każdym releasem
- Quality metrics dashboard (opcjonalnie)

**Tools**:

- Playwright (E2E)
- GitHub Issues (bug tracking)
- CI/CD monitoring

---

### 9.2. Developers (Frontend + Backend)

**Odpowiedzialności**:

- ✅ Pisanie testów unit dla swoich modułów (funkcje, serwisy, utils)
- ✅ Pisanie testów integracyjnych dla API endpoints
- ✅ Pisanie testów komponentowych dla UI (React)
- ✅ Utrzymanie testów przy zmianach kodu (refactoring)
- ✅ Naprawa błędów wykrytych przez testy automatyczne
- ✅ Naprawa defektów zgłoszonych przez QA
- ✅ Zapewnienie, że PR ma testy przed review
- ✅ Local testing przed push (pre-commit hook)

**Definition of Done** dla feature:

- [ ] Kod zaimplementowany
- [ ] Testy unit napisane (happy + error + edge)
- [ ] Testy integracyjne napisane (dla API)
- [ ] Testy UI napisane (dla komponentów React)
- [ ] Wszystkie testy przechodzą lokalnie
- [ ] CI checks pass
- [ ] Code review approved
- [ ] Dokumentacja zaktualizowana (jeśli potrzeba)

**Praktyki**:

- Test-Driven Development (opcjonalnie, zalecane dla logiki finansowej)
- Pair programming dla skomplikowanych testów
- Watch mode podczas development (`npm run test:unit:watch`)

---

### 9.3. Product Owner / Project Manager

**Odpowiedzialności**:

- ✅ Priorytetyzacja funkcji i defektów
- ✅ Akceptacja user stories (definition of done includes tests)
- ✅ Akceptacja, że zakres bezpieczeństwa jest ograniczony w MVP
- ✅ Decyzje o release readiness (na podstawie raportów QA)
- ✅ Zarządzanie backlogiem defektów
- ✅ Komunikacja z stakeholderami o jakości

**Kluczowe decyzje**:

- Czy Severity 2 defekty blokują release?
- Jakie features są must-have vs nice-to-have w następnym sprincie?
- Czy akceptujemy technical debt w testach (do spłacenia później)?

**Raportowanie** (otrzymuje od QA):

- Weekly test status report
- Pre-release quality report (defects, coverage, risks)
- Post-release smoke test results

---

### 9.4. DevOps / Infrastructure Engineer

**Odpowiedzialności**:

- ✅ Konfiguracja i utrzymanie CI/CD pipelines (GitHub Actions)
- ✅ Setup projektów Supabase (dev, test, prod)
- ✅ Zarządzanie secrets w CI (Supabase keys, API tokens)
- ✅ Monitoring testów w CI (failure alerts, retry logic)
- ✅ Optymalizacja pipeline speed (caching, parallel runs)
- ✅ Backup i restore strategia (+ smoke test odtworzenia)
- ✅ Post-deploy smoke tests automation

**Infrastructure setup**:

- GitHub Actions workflows:
  - unit-tests.yml
  - integration-tests.yml
  - e2e-tests.yml
  - deploy.yml (z post-deploy smoke)
- Supabase projects:
  - Dev (dla lokalnego development)
  - Test (dla E2E w CI)
  - Prod (z smoke tests post-deploy)
- Secrets management:
  - GitHub Secrets dla CI
  - `.env.test` templates dla lokalnego development

**Monitoring**:

- CI pipeline success rate (target: ≥95%)
- Average pipeline duration (target: <10 min dla unit+integration)
- Flaky test detection (tests that fail intermittently)
- Cost monitoring (CI minutes, Supabase usage)

---

### 9.5. Tech Lead / Architect

**Odpowiedzialności**:

- ✅ Architektura testowa (strategia, narzędzia, best practices)
- ✅ Code review krytycznych testów (zwłaszcza logika finansowa)
- ✅ Mentoring zespołu w testowaniu (knowledge sharing)
- ✅ Decyzje techniczne (np. czy dodać mutation testing)
- ✅ Refactoring test infrastructure (gdy rośnie complexity)
- ✅ Zapewnienie test maintainability (DRY, helpers, patterns)

**Technical decisions**:

- Wybór narzędzi (Vitest vs Jest, Playwright vs Cypress) ✅ Decided
- Test architecture (Testcontainers vs docker-compose) ✅ Decided
- Coverage targets (80% vs 90%?) ✅ Decided
- Mutation testing (now vs later?) → Opcjonalnie, później

**Knowledge sharing**:

- Tech talks o testowaniu (np. "How to write good integration tests")
- Documentation best practices
- Code review feedback z focus na quality

---

### 9.6. Współpraca i komunikacja

**Daily standup**:

- Deweloper: "Skończyłem feature X, wszystkie testy przechodzą"
- QA: "Znalazłem bug w Y, utworzyłem issue #123"
- DevOps: "CI ma problem z flaky testem Z, potrzebuje pomocy"

**Weekly sync**:

- Review quality metrics (coverage, defects, CI stability)
- Priorytetyzacja bug fixes
- Planning test automation tasks

**Pre-release meeting**:

- QA prezentuje release readiness report
- PO decyduje czy release jest go/no-go
- DevOps potwierdza gotowość infrastruktury

**Escalation path**:

```
Severity 1 defect found
  → QA creates issue + notifies team immediately (Slack/email)
  → Tech Lead assigns developer
  → Fix + tests w <24h
  → QA verifies fix
  → Deploy hotfix (if already in prod)

Flaky test detected
  → Developer investigates
  → Fix lub disable test (z TODO)
  → Create issue to fix properly later
```

---

## 10. Procedury raportowania błędów

### 10.1. Wykrywanie błędów

**Źródła**:

- ✅ Automatyczne testy (unit, integration, E2E) - failure w CI
- ✅ Manualne testy QA
- ✅ Code review (potential bugs)
- ✅ Development (developer znalazł bug)
- ✅ Production monitoring (post-deploy)
- ✅ User reports (jeśli już w użyciu)

### 10.2. Zgłaszanie defektu

**Platforma**: GitHub Issues (lub Jira, jeśli używane)

**Template issue**:

```markdown
## Bug Report

**Title**: [Component/Feature] Brief description

**Environment**:

- [ ] Dev (local)
- [ ] Test (CI / Supabase test project)
- [ ] Prod

**Version/Commit**: `abc123def` (commit hash lub tag)

**Severity**:

- [ ] Severity 1 - Blocker (crash, data loss, broken critical flow)
- [ ] Severity 2 - Major (feature partially broken, workaround exists)
- [ ] Severity 3 - Minor (cosmetic, edge case)

---

### Description

Clear description of what went wrong.

### Steps to Reproduce

1. Go to `/transactions`
2. Click "Add Transaction"
3. Enter amount "1234,56"
4. Select category "Food"
5. Click "Save"
6. Observe error

### Expected Result

Transaction should be created and appear in the list with amount 1234.56 PLN.

### Actual Result

Error message: "Invalid amount format"

### Screenshots/Videos

[Attach if applicable]

### Logs
```

// Console errors (Frontend)
TypeError: Cannot read property 'id' of undefined
at TransactionForm.tsx:45

// API response (if applicable)
{
"error": "Invalid amount format",
"code": "VALIDATION_ERROR"
}

```

### Additional Context
- Browser: Chrome 120.0
- User: test@example.com (if relevant)
- Related to: #123 (if applicable)

### Proposed Fix (optional)
Suggestion how to fix, if known.
```

**Wymagane pola**:

- Title (descriptive)
- Environment
- Severity
- Steps to reproduce
- Expected vs Actual result

**Opcjonalne ale zalecane**:

- Screenshots/videos (dla UI bugs)
- Logs (console, API responses, Supabase logs)
- Proposed fix

### 10.3. Klasyfikacja defektów

#### Severity 1 - BLOCKER (Critical)

**Definicja**: Błąd blokujący kluczową funkcjonalność, brak workaround.

**Przykłady**:

- ❌ Application crash / white screen
- ❌ Cannot login (auth completely broken)
- ❌ Cannot create/edit/delete transactions
- ❌ Data loss (transakcje/cele znikają)
- ❌ Poważne błędy obliczeń finansowych (np. saldo jest ujemne gdy powinno być dodatnie)
- ❌ Security breach (dane jednego usera widoczne dla innego)

**SLA**:

- Response time: <2h (podczas business hours)
- Fix target: <24h
- Requires: Immediate team notification

**Actions**:

- Stop release (if found before deploy)
- Hotfix (if found in production)
- All hands on deck

---

#### Severity 2 - MAJOR (Important)

**Definicja**: Istotny błąd funkcjonalny, ale istnieje workaround lub dotyczy mniej krytycznej funkcji.

**Przykłady**:

- ⚠️ Filtry transakcji nie działają (ale można zobaczyć wszystkie)
- ⚠️ Banner "korekty historyczne" nie pojawia się
- ⚠️ Optimistic update działa, ale rollback nie działa przy błędzie
- ⚠️ Progress bar celu pokazuje niepoprawny procent (ale kwoty są OK)
- ⚠️ Pagination nie działa (ale pierwsze 50 items jest widoczne)
- ⚠️ Email weryfikacyjny nie wysyła (ale można użyć innego emaila)

**SLA**:

- Response time: <1 business day
- Fix target: Before next release (1-2 weeks)
- Requires: Triage by PO (czy blokuje release?)

**Actions**:

- Może blokować release (decyzja PO)
- Priorytet w backlogu
- Dokumentacja workaround

---

#### Severity 3 - MINOR (Cosmetic / Enhancement)

**Definicja**: Błąd kosmetyczny, UX improvement, edge case o minimalnym wpływie.

**Przykłady**:

- 🟡 Typo w tekście
- 🟡 Spacing/alignment w UI
- 🟡 Icon niepoprawny (ale funkcjonalność działa)
- 🟡 Tooltip brakujący (ale feature jest intuicyjny)
- 🟡 Edge case: długa nazwa celu (100+ znaków) wychodzi poza ramkę
- 🟡 Validation message mogłaby być bardziej czytelna

**SLA**:

- Response time: Best effort
- Fix target: Nice to have (może poczekać kilka release'ów)
- Requires: PO priorytetyzuje w backlogu

**Actions**:

- Nie blokuje release
- Fix gdy jest wolny slot
- Może być zgrupowany z innymi małymi fixami

---

### 10.4. Cykl życia defektu

```
NEW
  ↓
TRIAGED (severity assigned, owner assigned)
  ↓
IN PROGRESS (developer working on fix)
  ↓
READY FOR TEST (fix merged, ready for QA verification)
  ↓
CLOSED (verified fixed) / REOPENED (still broken)
```

**Workflow**:

1. **NEW** → Issue created
   - Labels: `bug`, `needs-triage`
   - QA or developer creates issue

2. **TRIAGED** → QA/Tech Lead reviews
   - Assign severity
   - Assign owner (developer)
   - Add to milestone (if Severity 1-2)
   - Labels update: remove `needs-triage`, add `severity-1/2/3`

3. **IN PROGRESS** → Developer working
   - Create branch: `fix/issue-123-transaction-amount-validation`
   - Write fix + tests
   - Push PR with reference: "Fixes #123"
   - Labels update: `in-progress`

4. **READY FOR TEST** → PR merged
   - Developer marks issue as ready for QA
   - QA tests on same environment where bug was found
   - Labels update: `ready-for-test`

5. **CLOSED** / **REOPENED**
   - QA verifies fix:
     - ✅ If fixed → Close issue with comment "Verified on [environment] [commit]"
     - ❌ If still broken → Reopen with comment explaining what's still wrong
   - Labels update: `closed` or `reopened`

**Verification checklist** (QA):

- [ ] Steps to reproduce no longer produce the bug
- [ ] Expected result is achieved
- [ ] No new bugs introduced (regression testing)
- [ ] Automated test added (ask developer)
- [ ] Tested on same environment as original bug

### 10.5. Raporty i metryki

#### Weekly Test Status Report

**Audience**: PO, Tech Lead, Team

**Format**: GitHub Discussion lub Slack post

**Content**:

```markdown
# Test Status Report - Week 48, 2024

## Test Execution

- Unit tests: 187 passed, 0 failed ✅
- Integration tests: 62 passed, 1 failed ⚠️ (investigating)
- E2E tests: 12 passed, 0 failed ✅
- Total: 261 tests

## Coverage

- Unit: 84% (target: 80%) ✅
- Integration: 95% (target: 90%) ✅
- UI: 72% (target: 70%) ✅

## Defects Summary

- Severity 1: 0 open 🟢
- Severity 2: 3 open (2 in progress, 1 triaged) 🟡
- Severity 3: 8 open (backlog) ⚪

## CI/CD Health

- Pipeline success rate: 96% (target: 95%) ✅
- Average duration: 8m 32s (target: <10m) ✅
- Flaky tests: 1 (investigating #234)

## Blockers

- None

## Next Week Focus

- Fix Severity 2 bugs before release
- Improve E2E test coverage for goals module
```

---

#### Pre-Release Quality Report

**Audience**: PO, Stakeholders

**Format**: Detailed document (GitHub Discussion)

**Content**:

```markdown
# Release Readiness Report - v1.2.0

**Release date**: 2024-12-15
**Commit**: abc123def

---

## Test Results

### Automated Tests

| Test Type   | Total   | Passed  | Failed | Skipped |
| ----------- | ------- | ------- | ------ | ------- |
| Unit        | 187     | 187     | 0      | 0       |
| Integration | 62      | 62      | 0      | 0       |
| E2E         | 12      | 12      | 0      | 0       |
| **TOTAL**   | **261** | **261** | **0**  | **0**   |

✅ All tests passing

### Coverage

- Unit: 84% ✅
- Integration: 95% ✅
- Critical business logic: 100% ✅

---

## Defects Status

### Severity 1 (Blockers)

- **0 open** ✅

### Severity 2 (Major)

- **1 open** - #245: Filtry transakcji nie zapisują się w localStorage
  - Status: Triaged, not blocking release (workaround: user can re-apply filters)
  - Plan: Fix in v1.2.1 (next week)

### Severity 3 (Minor)

- **8 open** - cosmetic issues, documented in backlog
  - Not blocking release

---

## Functional Coverage

### User Stories Coverage

| Story                | Unit | Integration | E2E | Status |
| -------------------- | ---- | ----------- | --- | ------ |
| US-001: Registration | ✅   | ✅          | ✅  | Full   |
| US-002: Login        | ✅   | ✅          | ✅  | Full   |
| US-007: Add Expense  | ✅   | ✅          | ✅  | Full   |
| US-016: Dashboard    | ✅   | ✅          | ✅  | Full   |
| ...                  |      |             |     |        |

✅ All critical user stories fully covered

---

## Known Risks

### Accepted Risks

1. **Limited security testing** (no penetration testing, no OWASP audit)
   - Mitigation: RLS tested functionally, Supabase has built-in protections
   - Plan: Security audit post-MVP (Q1 2025)

2. **No performance/load testing**
   - Mitigation: Sanity checks pass, Supabase scales automatically
   - Plan: Add k6 tests if performance issues arise

3. **Severity 2 bug #245** (filters not persisting)
   - Mitigation: Workaround documented for users
   - Plan: Fix in v1.2.1 (1 week after release)

---

## CI/CD Stability

- Pipeline success rate: 97% (last 30 days) ✅
- Flaky tests: 0 (all fixed) ✅
- Average pipeline time: 8m 20s ✅

---

## Recommendation

**🟢 GO for release**

Justification:

- All critical tests passing
- Zero Severity 1 defects
- 1 Severity 2 defect accepted by PO (non-blocking)
- Coverage targets met
- CI stable

---

## Post-Deploy Verification Plan

Smoke tests to run on production:

1. Login with test account
2. Dashboard loads with data
3. Create transaction
4. Create goal
5. Email delivery (verify + reset)

Time estimate: 5-10 minutes
Auto-rollback if any smoke test fails.
```

---

#### Post-Release Report

**Audience**: Team, Stakeholders

**Format**: Brief summary

**Content**:

```markdown
# Post-Deploy Report - v1.2.0

**Deploy date**: 2024-12-15 14:30 UTC
**Environment**: Production

## Smoke Tests

- ✅ Login: Passed
- ✅ Dashboard: Passed
- ✅ Create transaction: Passed
- ✅ Create goal: Passed
- ✅ Email delivery: Passed (verified email received in 30s)

## Monitoring (first 2 hours)

- Uptime: 100%
- Error rate: 0%
- P95 response time: 180ms (good)

## User Feedback

- No issues reported

## Conclusion

✅ Deployment successful, no issues detected.
```

---

### 10.6. Bug Tracking Best Practices

**Do's**:

- ✅ Provide clear steps to reproduce
- ✅ Include screenshots/videos for UI bugs
- ✅ Include logs (console, API, Supabase)
- ✅ Test on latest code before reporting
- ✅ Search for duplicates before creating new issue
- ✅ Add relevant labels
- ✅ Reference related issues (#123)

**Don'ts**:

- ❌ Vague titles ("It doesn't work")
- ❌ No steps to reproduce
- ❌ Mixing multiple bugs in one issue
- ❌ Not specifying environment
- ❌ Reporting bugs in production before testing in dev/test
- ❌ Closing bugs without QA verification

**Examples**:

❌ **Bad issue**:

```
Title: Bug in transactions

The transactions page is broken.
```

✅ **Good issue**:

```
Title: [Transactions] Amount validation rejects valid format "1 234,56"

Environment: Dev (local)
Severity: Severity 2

Steps to reproduce:
1. Login as test@example.com
2. Go to /transactions
3. Click "Add Transaction"
4. Enter amount "1 234,56" (with space as thousand separator)
5. Click "Save"

Expected: Transaction created with amount 1234.56 PLN
Actual: Error "Invalid amount format"

Note: Format "1234,56" (without space) works correctly.
This is a regression from v1.1.0 where spaces were accepted.

Logs:
> ValidationError: Amount must match format /^\d+[.,]\d{2}$/

Related: #123 (original implementation of amount parsing)
```

---

### 10.7. Escalation

**When to escalate**:

- Severity 1 defect found (anytime)
- Multiple Severity 2 defects found before release (risk assessment needed)
- Flaky tests blocking CI (> 3 consecutive failures)
- Production incident

**How to escalate**:

1. Create GitHub issue (as usual)
2. Notify team immediately:
   - Slack: @channel in #development
   - Email: team@finflow.com (if after hours)
3. Add label: `urgent`, `severity-1`
4. Tag Tech Lead in issue

**Response**:

- Tech Lead assigns developer ASAP
- Developer provides ETA
- Team stays updated (daily standup or more frequently)
- QA verifies fix priority #1

---

## 11. Podsumowanie i kluczowe decyzje

### 11.1. Finalna strategia testowa - 3 poziomy

Ten plan testów przyjmuje **3-poziomową strategię** testowania, zoptymalizowaną pod kątem szybkości i izolacji:

| Poziom          | Narzędzia                   | Auth          | Database             | Uruchamianie       | Cel              |
| --------------- | --------------------------- | ------------- | -------------------- | ------------------ | ---------------- |
| **Unit**        | Vitest                      | Brak          | Brak (mocki)         | Każdy save (watch) | Logika biznesowa |
| **Integration** | Vitest + Testcontainers     | **FAKE**      | Postgres (container) | Każdy PR           | API + DB         |
| **E2E**         | Playwright + Supabase Cloud | **PRAWDZIWY** | Supabase Cloud       | Merge to master    | User flows       |

**Kluczowa innowacja**: Rozdzielenie testów logiki biznesowej (fake auth) od testów auth flow (prawdziwy Supabase).

### 11.2. Decyzje technologiczne

#### ✅ Wybrane narzędzia (finalne)

```yaml
Testing Framework: Vitest (not Jest)
Reasoning:
  - Natywna integracja z Vite/Astro
  - 10x szybszy dzięki ESM
  - Single config dla unit + integration

UI Testing: React Testing Library + MSW
Reasoning:
  - Industry standard
  - MSW dla deterministycznego mockowania API
  - Testowanie z perspektywy użytkownika

API Testing: Playwright API Testing (not Supertest)
Reasoning:
  - Unified tooling (używamy już Playwright do E2E)
  - Lepsze retry logic i timeouts
  - Built-in fixtures

E2E Framework: Playwright (not Cypress)
Reasoning:
  - Lepsza wydajność i stabilność
  - Auto-waiting i retry logic
  - Lepsze headless mode dla CI

Integration DB: Testcontainers (not docker-compose)
Reasoning:
  - Dynamiczne tworzenie kontenerów per test suite
  - Programmatic control
  - Działa identycznie lokalnie i w CI

E2E Environment: Supabase Cloud (not local Supabase CLI)
Reasoning:
  - Deweloper nie ma lokalnego Supabase
  - Prawdziwy Auth flow (GoTrue)
  - Zero setup dla zespołu

Email Testing: Ethereal Email
Reasoning:
  - Darmowy test SMTP
  - API do pobierania maili
  - Idealne do testowania verify/reset flow
```

#### ❌ Odrzucone opcje

```yaml
Jest: Odrzucony → Wolniejszy niż Vitest, gorsze ESM support
Cypress: Odrzucony → Gorsze w CI, wolniejsze, mniej features
Supertest: Odrzucony → Playwright API ma lepsze capabilities
docker-compose: Odrzucony → Mniej flexible niż Testcontainers
Supabase CLI locally: Odrzucony → Developer nie ma lokalnie + overkill dla integration tests
k6/Artillery: Odrzucony → Performance testing pominięte w MVP
```

### 11.3. Strategia auth w testach (kluczowe!)

**Problem**: Jak testować API wymagające autoryzacji bez uruchamiania pełnego Supabase Auth?

**Rozwiązanie**: Rozdzielenie odpowiedzialności

#### Testy integracyjne API (fake auth)

```typescript
// Testujemy: logikę biznesową, nie auth
const testUserId = await seedTestUser();
const mockToken = createMockToken(testUserId);

// Middleware w test mode akceptuje mock tokeny
const response = await request(app)
  .post("/api/v1/transactions")
  .set("Authorization", `Bearer ${mockToken}`)
  .send({ amount: 10000 });

expect(response.status).toBe(201);
```

**Korzyści**:

- ⚡ Szybkie (bez prawdziwego auth)
- 🎯 Focused (testujemy business logic, nie auth)
- 🔄 Deterministyczne (fake userId)
- 💰 Darmowe (bez external API calls)

#### Testy E2E (prawdziwy auth)

```typescript
// Testujemy: pełny user flow włącznie z auth
await page.goto("/auth/register");
await page.fill('[name="email"]', email);
await page.fill('[name="password"]', password);
await page.click('button[type="submit"]');

// Prawdziwy Supabase wyśle email
const verificationLink = await ethereal.getLastVerificationLink(email);
await page.goto(verificationLink);

// Prawdziwe logowanie
await login(page, email, password);
expect(page).toHaveURL("/dashboard");
```

**Korzyści**:

- 🎭 Realistic (jak prawdziwy user)
- 🔒 Testuje auth security
- 📧 Testuje email flow
- ✅ Confidence w produkcyjnej integracji

### 11.4. Pominięte w MVP (świadome decyzje)

#### Performance Testing

**Decyzja**: Pominięte całkowicie w MVP

**Uzasadnienie**:

- Małe oczekiwane obciążenie
- Supabase skaluje automatycznie
- Basic sanity checks wystarczą (response time <500ms w integration tests)
- Można dodać k6 później jeśli będzie potrzeba

**Ryzyko**: Akceptowalne dla MVP

---

#### Security Testing

**Decyzja**: Tylko funkcjonalne (RLS, rate limiting), bez dedicated security testing

**Uzasadnienie**:

- Supabase ma wbudowane zabezpieczenia (SQL injection protection)
- RLS testowane funkcjonalnie w integration tests
- OWASP Top 10 i pentesty są overkill dla MVP
- Można dodać post-MVP (automated scanning, security audit)

**Ryzyko**: Akceptowalne, PO świadomy

---

#### Mutation Testing

**Decyzja**: Opcjonalne, nie required dla MVP

**Uzasadnienie**:

- Dodatkowy overhead (Stryker setup + CI time)
- High coverage (>80%) + code review wystarczą na start
- Można dodać selektywnie dla krytycznej logiki finansowej

**Plan**: Rozważyć w Faza 5 (stabilizacja) jeśli zostanie czas

---

#### Visual Regression Testing

**Decyzja**: Opcjonalne (Playwright screenshots)

**Uzasadnienie**:

- Nice to have, nie must-have
- Manual review w PR wystarcza dla MVP
- Można dodać baseline screenshots później

**Plan**: Włączyć jeśli będą problemy z regresją UI

### 11.5. Metryki sukcesu

**Po implementacji pełnego planu oczekujemy**:

```yaml
Test Count:
  Unit: ~150-200 tests
  Integration: ~50-80 tests
  UI Component: ~40-60 tests
  E2E: ~10-15 tests
  Total: ~250-355 tests

Coverage:
  Unit (logika biznesowa): ≥80% (finansowa: 100%)
  Integration (API): 100% endpoints
  UI Components: ≥70%

CI/CD:
  Pipeline success rate: ≥95%
  Unit + Integration time: <10 min
  E2E time: <15 min

Quality:
  Severity 1 defects: 0
  Flaky tests: <5%
  Test maintainability: High (DRY, helpers, clear naming)

Team Velocity:
  Dev writes tests while coding (not after)
  PR review includes test review
  Regression bugs: Minimal (caught by automated tests)
```

### 11.6. Następne kroki (implementacja)

**Priorytetowa kolejność**:

1. **Week 1-2**: Setup + Unit tests dla logiki finansowej ✅ MUST
2. **Week 2-3**: Integration tests dla API (wszystkie endpointy) ✅ MUST
3. **Week 3-4**: UI component tests (formularze, listy) ✅ MUST
4. **Week 4-5**: E2E tests (auth + critical flows) ✅ MUST
5. **Week 5-6**: Stabilizacja + dokumentacja ✅ MUST
6. **Post-MVP**: Visual regression, mutation testing, security audit ⭐ NICE TO HAVE

**Gotowość do release**:

- [ ] Wszystkie MUST kroki ukończone (1-5)
- [ ] Coverage targets met
- [ ] Zero Severity 1 defects
- [ ] CI fully automated
- [ ] Smoke tests pass on staging

### 11.7. Kontakt i feedback

Ten plan testów jest **living document** - będzie aktualizowany gdy zespół zdobędzie więcej doświadczenia.

**Feedback mile widziany**:

- Czy strategia testowa jest jasna?
- Czy coś jest overkill / underkill?
- Czy są niewykryte risk areas?

**Osoba odpowiedzialna za plan**: QA Lead / Test Engineer

**Ostatnia aktualizacja**: 2024-12-07

**Wersja**: 2.0 (major update - zmiana stack technologiczny + strategia auth)
