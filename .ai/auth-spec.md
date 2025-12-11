## Specyfikacja modułu rejestracji, logowania i odzyskiwania hasła (Auth) – FinFlow

Stan na: 2025-12-01
Zakres: US-001 (Rejestracja), US-002 (Logowanie), US-003 (Wylogowanie), US-004 (Reset hasła). Zgodność z resztą PRD (m.in. US-033/034 o limitach, US-071 o dostępie tylko po weryfikacji) oraz stackiem z `.ai/tech-stack.md`.

### Założenia i zależności

- Frontend: Astro 5 (output "server", adapter Node), React 19 (wyspy), Tailwind 4, shadcn/ui, sonner/toast.
- Backend: Supabase (Auth + DB z RLS). PROD: RLS włączone dla wszystkich tabel zgodnie z PRD (6.1d). DEV: w repo istnieją tymczasowe migracje wyłączające RLS na wybranych tabelach (ułatwienia deweloperskie); nie dotyczy produkcji.
- Aplikacja pozostaje „prawie‑SPA na Astro”: brak SSR danych domenowych; Minimalne użycie SSR/middleware wyłącznie do przekierowań auth (coarse gating), cała logika sesji i danych przez `@supabase/supabase-js` w przeglądarce.
- E-maile: Supabase Auth SMTP (Postmark) z możliwością przełączenia SMTP na Resend/Brevo bez zmian w kodzie (konfiguracja środowiskowa).
- Limity (3/30 min) dla: ponownej wysyłki weryfikacji (verify) i resetu hasła – egzekwowane po stronie naszych endpointów API przed wywołaniem Supabase Auth.

### Pytania/niuansy (nie blokują wdrożenia, przyjmujemy domyślne odpowiedzi w tej specyfikacji)

1. Czy ponowna weryfikacja e-mail (US-033/US-071) ma działać także bez zalogowania? Przyjmujemy: tak – formularz na stronie logowania przyjmuje e-mail i nie ujawnia, czy konto istnieje.
2. Czy ekrany auth mają używać odrębnego layoutu? Przyjmujemy: tak – wariant uproszczony nagłówka (bez nawigacji aplikacji).
3. Czy wymagana jest strona „/me” od razu? W PRD pojawia się w US-081 – poza zakresem tego wdrożenia, ale przewidziane miejsce integracji.

---

## 1. ARCHITEKTURA INTERFEJSU UŻYTKOWNIKA

### 1.1 Strony Astro (auth i non-auth)

Nowe strony (Astro) – tylko kompozycja layoutu i „wysp” (bez logiki danych serwerowych):

- `src/pages/auth/login.astro` – ekran logowania (US-002).
- `src/pages/auth/register.astro` – ekran rejestracji (US-001).
- `src/pages/auth/reset-password.astro` – żądanie resetu hasła (US-004 – wysyłka linku).
- `src/pages/auth/update-password.astro` – ustawienie nowego hasła po kliknięciu w link z e-mail (US-004 – finalizacja).
- `src/pages/auth/verify.astro` – ekran informacyjny po kliknięciu linku weryfikacyjnego (opcjonalny „success/failure”), przekierowania zgodnie z parametrami Supabase. Używany do czytelnej komunikacji w UX; nie przetwarza danych.

Zmiany na stronach chronionych (non-auth):

- `src/pages/index.astro`, `dashboard.astro`, `transactions.astro`, `goals*.astro`, `audit-log.astro`: brak SSR danych; pozostaje istniejąca struktura. Widoki pozostają dostępne wyłącznie, gdy użytkownik jest zalogowany i zweryfikowany (gating client-side + coarse gating w middleware – patrz 2.4).

### 1.2 Layouty

- Istniejący `src/layouts/Layout.astro` – pozostaje domyślny.
- Nowy `src/layouts/AuthLayout.astro` (prosty wariant bez globalnej nawigacji, CTA do rejestracji/logowania, linki do Polityki/Regulaminu). Strony w `/auth/*` używają AuthLayout.

### 1.3 Komponenty React (wyspy) – formularze i logika client-side

Nowe komponenty w `src/components/system/auth/`:

- `LoginForm.tsx` (US-002)
  - Pola: email, password.
  - Akcja: `supabase.auth.signInWithPassword({ email, password })` (browser client).
  - Obsługa nieweryfikowanego konta:
    - Jeśli Supabase zwróci błąd `email_not_confirmed` (brak sesji) → pokaż komunikat „Zweryfikuj e‑mail” + CTA „Wyślij ponownie”.
    - Jeśli logowanie się powiedzie, ale `user.email_confirmed_at == null` → natychmiast `signOut()` i identyczny komunikat z CTA „Wyślij ponownie”.
    - Jeśli zweryfikowany → `window.location.href = "/dashboard"`.
  - Błędy: błędny login/hasło → toast „Nieprawidłowe dane logowania”. Błędy sieciowe → toast + możliwość ponowienia (US-070).
  - UI: linki do „Zarejestruj się”, „Nie pamiętasz hasła?” oraz sekcja „Nie otrzymałeś maila? Wyślij ponownie” (poniżej, patrz `ResendVerificationForm.tsx`).

- `RegisterForm.tsx` (US-001)
  - Pola: email, password (+ powtórzenie hasła po stronie UI).
  - Walidacja hasła: min. 10 znaków, ≥1 litera i ≥1 cyfra (client + server-ready z Zod).
  - Akcja: `supabase.auth.signUp({ email, password, options: { emailRedirectTo: <APP_ORIGIN>/auth/verify } })`.
  - Po sukcesie: ekran z informacją „Sprawdź skrzynkę – link ważny 30 min” (US-001). Nie logujemy automatycznie nieweryfikowanego użytkownika.
  - Błędy: konflikt (istniejący e-mail) → komunikat neutralny („Jeśli konto istnieje, otrzymasz wiadomość”). Nie ujawniamy istnienia konta.

- `ResetPasswordRequestForm.tsx` (US-004 – żądanie)
  - Pole: email.
  - Akcja: wywołuje nasz endpoint `POST /api/v1/auth/reset-password` (patrz 2.1), który egzekwuje limit 3/30 i dopiero wtedy woła Supabase.
  - Po sukcesie: komunikat „Jeśli konto istnieje, wysłaliśmy link resetu (ważny 30 min)”. Nie ujawniamy istnienia konta.
  - 429: używa `useRateLimit()` i globalnego `RateLimitBanner` (scope `"reset_password"`) do prezentacji pozostałego czasu.

- `UpdatePasswordForm.tsx` (US-004 – finalizacja)
  - Pola: new_password, confirm_password.
  - Flow: po wejściu na `/auth/update-password?code=...`:
    - `supabase.auth.exchangeCodeForSession(code)` (wymagana biblioteka v2) dla sesji tymczasowej.
    - Następnie `supabase.auth.updateUser({ password: new_password })`.
    - Po sukcesie: komunikat „Hasło zaktualizowane” → przekierowanie do `/auth/login`.
  - Błędy: nieprawidłowy/zużyty link → ekran neutralny z możliwością wygenerowania nowego resetu.

- `ResendVerificationForm.tsx` (US-033/US-071 – dostępny z login/register/verify screens)
  - Pole: email.
  - Akcja: `POST /api/v1/auth/resend-verification` (limit 3/30). Nie ujawniamy istnienia konta.
  - 429: `useRateLimit()` + `RateLimitBanner` (scope `"verify_email"`).

Wspólne elementy UI:

- Form controls z `src/components/ui/*` (shadcn/ui), spójne komunikaty po polsku, toasty przez sonner.
- Globalne bannery: istniejący `RateLimitBanner.tsx` oraz `OfflineBanner.tsx`/`GlobalErrorBoundary.tsx` już w projekcie – formularze emituje stany zgodne z `useRateLimit()` i centralnym VM (typy w `src/types.ts`).

### 1.4 Podział odpowiedzialności: Astro vs React

- Strony Astro: kompozycja layoutu, umieszczenie „wysp” formularzy, meta/SEO, ewentualnie prosty SSR redirect (coarse gating) bez pobierania danych domenowych.
- Komponenty React: cała logika auth w przeglądarce, walidacje UI (Zod), wywołania Supabase JS (signIn/signUp/signOut/exchangeCodeForSession/updateUser) oraz naszych endpointów (tylko akcje z limitami: resend/reset).

### 1.5 Walidacje i komunikaty błędów (UI)

- E-mail: format RFC 5322 (Zod `email()`), white-lista domen – nie wymagamy.
- Hasło: min. 10 znaków, ≥1 litera i ≥1 cyfra. UI pokazuje precyzyjne wskazówki. Hasła nie są logowane.
- Komunikaty:
  - Auth nieudane: „Nieprawidłowy e-mail lub hasło” (bez zdradzania, czy konto istnieje).
  - Konto nieweryfikowane: „Zweryfikuj adres e‑mail, aby się zalogować” + CTA „Wyślij ponownie” (obsługa błędu `email_not_confirmed` oraz scenariusza sesji bez potwierdzenia).
  - Link resetu/weryfikacji: „Jeśli konto istnieje, wyślemy wiadomość. Link ważny 30 min.”
  - 429: baner z czasem do odblokowania (na podstawie `retry_after_seconds`).
  - Błędy sieciowe: toast + akcja „Spróbuj ponownie” (US-070).

### 1.6 Najważniejsze scenariusze (end-to-end)

- Rejestracja (US-001): wypełnij → `signUp` → komunikat „sprawdź e-mail” → klik w link (30 min) → `/auth/verify` → logowanie → gating zweryfikowanego statusu.
- Logowanie (US-002): `signInWithPassword` → jeśli `email_confirmed_at == null` → `signOut` + CTA `ResendVerificationForm`; inaczej redirect do `/dashboard`.
- Wylogowanie (US-003): przycisk w prawym górnym rogu nawigacji (`Navigation.tsx`) → `supabase.auth.signOut()` → redirect do `/auth/login`.
- Reset (US-004): `/auth/reset-password` (email) → `POST /api/v1/auth/reset-password` (limit 3/30) → e-mail z linkiem (30 min) → `/auth/update-password?code=...` → ustaw hasło → redirect do `/auth/login`.

---

## 2. LOGIKA BACKENDOWA

### 2.1 Endpointy API (REST v1)

Nowe zasoby w `src/pages/api/v1/auth/` (czysto serwerowe; nie wyciekają sekretów do klienta):

- `POST /api/v1/auth/reset-password`
  - Body: `{ email: string }`
  - Akcja: walidacja (Zod) → sprawdź limiter (scope `"reset_password"`, 3/30) → jeśli OK, wywołaj Supabase `auth.resetPasswordForEmail(email, { redirectTo: <APP_ORIGIN>/auth/update-password } )` (po stronie serwera) → `204 No Content`.
  - 429: `application/json` w formacie `ErrorResponseDTO` z `retry_after_seconds`.
  - 4xx: niepoprawny email → `422` (komunikat PL).
  - 5xx: błąd zewnętrzny → `502/500` (spójny format).

- `POST /api/v1/auth/resend-verification`
  - Body: `{ email: string }`
  - Akcja: walidacja → limiter (scope `"verify_email"`, 3/30) → jeśli OK, wywołaj Supabase wysyłkę weryfikacji (preferowane: `auth.resend({ type: "signup", email })`; alternatywnie `auth.admin.generateLink(...)` z serwisowym kluczem, jeśli konfiguracja wymaga) → `204 No Content`.
  - Zawsze odpowiedź neutralna (nie ujawnia istnienia konta).
  - Błędy i 429 jak wyżej.

Uwaga: logowanie i rejestracja idą bezpośrednio przez `@supabase/supabase-js` w przeglądarce (brak dodatkowego proxy po naszej stronie), zgodnie z przyjętym modelem „brak SSR danych”. Endpointy tworzymy wyłącznie tam, gdzie musimy twardo egzekwować polityki (limity, spójny format błędów).

### 2.2 Walidacja danych wejściowych

- Zod schematy w `src/lib/schemas/auth.ts`:
  - `EmailSchema = z.string().email().max(254)`
  - `PasswordSchema = z.string().min(10).regex(/[A-Za-z]/, "Hasło musi zawierać literę").regex(/[0-9]/, "Hasło musi zawierać cyfrę")`
  - `ResetPasswordRequestSchema = z.object({ email: EmailSchema })`
  - `ResendVerificationRequestSchema = z.object({ email: EmailSchema })`
- Strony React używają tych samych schematów (import ze wspólnego modułu) dla walidacji client-side, a API – server-side (źródło prawdy).

### 2.3 Obsługa wyjątków i format błędów

- Spójny `ErrorResponseDTO` (`src/types.ts`): `error`, `message`, opcjonalnie `details`, `retry_after_seconds`.
- Mapowanie wyjątków:
  - Zod `ZodError` → `422` z `details` per pole.
  - Limit (patrz 2.5) → `429` z `retry_after_seconds`.
  - Błędy Supabase (sieć/usługa) → `502` (lub `500` jeśli nieokreślone).
  - Pozostałe → `500`.
- Wszystkie odpowiedzi JSON z `Content-Type: application/json` (poza `204`).

### 2.4 SSR/middleware – zgodność z `astro.config.mjs`

Aktualny middleware:

```1:8:src/middleware/index.ts
import { defineMiddleware } from "astro:middleware";

import { supabaseClient } from "../db/supabase.client";

export const onRequest = defineMiddleware((context, next) => {
  context.locals.supabase = supabaseClient;
  return next();
});
```

Plan rozszerzenia (bez SSR danych):

- Pozostawiamy przypięcie `locals.supabase` (klient bez persystencji, do użycia w API).
- Dodajemy „coarse gating” tylko dla ścieżek chronionych (np. `/dashboard`, `/transactions`, `/goals*`, `/audit-log`) bazując na minimalnej heurystyce obecności tokenów Supabase w cookies (np. `sb-access-token`/`sb-refresh-token`). Jeśli ich brak → redirect 302 do `/auth/login`. Nie walidujemy tokenu po stronie serwera – szczegółowa weryfikacja pozostaje po stronie client-side (zgodnie z założeniem „brak SSR danych”). To zmniejsza migotanie i nie wymusza SSR danych.
- Strony `/auth/*` nigdy nie wymagają sesji; zawsze dostępne.

Uwaga: Heurystyka cookies jest „best effort” (nie rozstrzyga ważności tokenu); faktyczny stan auth zawsze domykamy w React kliencie.

### 2.5 Limitowanie (3 żądania / 30 minut) i tabela `rate_limits`

- Wykorzystujemy istniejącą tabelę `rate_limits` (wg migracji w repo), której klucz identyfikacyjny stanowi `user_id` + `action` + 30‑minutowy bucket (`bucket_30m`).
- Dostęp wyłącznie z kluczem serwisowym (service role) – zapis/odczyt wykonujemy po stronie serwera.
- Algorytm (na serwerze):
  1. Normalizuj e‑mail (`trim().toLowerCase()`).
  2. Spróbuj rozwiązać `user_id` po e‑mailu (Supabase Admin API).
  3. Jeśli `user_id` znaleziony:
     - Policz próby w bieżącym oknie 30 min (indeks `idx_rl_bucket`).
     - Jeśli limit ≥3 → `429` + `retry_after_seconds = ceil((koniec_okna - now)/1000)`.
     - Wstaw rekord (action: `"verify_email"` lub `"reset_password"`).
  4. Jeśli `user_id` nie znaleziony:
     - Dla MVP stosujemy in‑memory limiter na węźle (klucz: hash(email), scope) z TTL=30 min, w celu ograniczenia floodu. Odpowiedź nadal neutralna.
     - Kierunek dalszy: dodatkowa tabela dla hash(email) lub Redis (poza MVP).
- W API zwracamy jednolity `ErrorResponseDTO` z `retry_after_seconds`. UI (`useRateLimit()`) wyświetla baner i odliczanie.

### 2.6 Modele danych (DTO/komendy) – nowe dla auth

- `ResetPasswordRequestDTO`: `{ email: string }`
- `ResendVerificationRequestDTO`: `{ email: string }`
- Odpowiedzi powodzenia: `204 No Content` (bez treści, brak ujawniania istnienia konta).
- Odpowiedzi błędów: `ErrorResponseDTO` (patrz 2.3).

---

## 3. SYSTEM AUTENTYKACJI – Supabase + Astro

### 3.1 Klienci Supabase

- Przeglądarka (nowy): `src/db/supabase.browser.ts`
  - `createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } })`
  - Użycie tylko w komponentach React (formularze auth i inne wyspy).
- Serwer (istniejący): `src/db/supabase.client.ts`
  - Przeznaczenie: API routes (bez persystencji, brak auto‑refresh), przypinany do `context.locals.supabase` w middleware.
- Admin na serwerze (wymagany): `src/db/supabase.admin.ts`
  - `SUPABASE_SERVICE_ROLE_KEY` z env (tylko serwer). Używany do: zapisu/odczytu w `rate_limits`, rozwiązywania `user_id` po e‑mailu, ewentualnego generowania linków weryfikacyjnych.

### 3.2 Rejestracja (US-001)

- `signUp({ email, password, options: { emailRedirectTo: <APP_ORIGIN>/auth/verify } })` – Supabase wyśle e‑mail weryfikacyjny (30 min); klik prowadzi do `/auth/verify`.
- Polityka hasła egzekwowana po stronie UI (Zod) i w przyszłości po stronie API (jeśli dodamy serwerowe proxy rejestracji). Komunikaty po polsku.

### 3.3 Logowanie (US-002)

- `signInWithPassword({ email, password })` w kliencie.
- Obsługa nieweryfikowanego konta:
  - Jeśli Supabase zwróci `email_not_confirmed` (brak sesji) → komunikat + CTA „Wyślij ponownie” (US-071).
  - Jeśli logowanie udane, ale `user.email_confirmed_at == null` → `signOut()` + identyczny CTA.
- W razie błędu: neutralny komunikat bez ujawniania konta.

### 3.4 Wylogowanie (US-003)

- Przycisk w `src/components/system/Navigation.tsx` (prawy górny róg): `supabase.auth.signOut()` → redirect do `/auth/login`.
- Dodatkowo czyścimy lokalny stan filtrów, jeśli dotyczy (UX – opcjonalne).

### 3.5 Reset hasła (US-004)

- Żądanie: `POST /api/v1/auth/reset-password` (limit 3/30). Serwer woła Supabase z `redirectTo: <APP_ORIGIN>/auth/update-password`.
- Finalizacja: `/auth/update-password?code=...` → `exchangeCodeForSession(code)` → `updateUser({ password })`.
- Błędy linku: ekran informacyjny z możliwością ponownego wygenerowania resetu.

### 3.6 Ponowna wysyłka weryfikacji (US-033/US-071)

- `POST /api/v1/auth/resend-verification` (limit 3/30). Neutralne odpowiedzi. UI integruje baner limitu.

### 3.7 Bezpieczeństwo i konfiguracja

- Środowisko:
  - `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` (FE/serwer).
  - `SUPABASE_SERVICE_ROLE_KEY` (tylko serwer, jeśli użyjemy admin API).
  - `AUTH_EMAIL_FROM` – dla spójności domeny nadawcy (konfiguracja w panelu Supabase SMTP/Postmark).
- Cookies/tokeny: pozostajemy przy standardowej obsłudze Supabase (SameSite=Lax, Secure w produkcji). Brak własnych cookies aplikacji do auth.
- HTTPS: wymuszone w produkcji (US-043) – konfiguracja na poziomie hostingu/reverse proxy; opcjonalnie redirect w middleware poza DEV.
- Linki verify/reset: tokeny jednorazowe, ważne 30 min (konfiguracja Supabase); po użyciu nieważne (US-084).
- Nie ujawniamy istnienia kont: odpowiedzi endpointów zawsze neutralne.
- i18n: Komunikaty po polsku z centralnego słownika (np. `src/lib/i18n/pl.ts` – do dodania, jeśli jeszcze nie istnieje).

### 3.8 Zgodność z resztą aplikacji

- Brak zmian w API domenowym: istniejące endpointy `transactions`, `goals`, `metrics`, `audit-log` pozostają bez zmian.
- Gating dostępu: strony domenowe wymagają zalogowania + weryfikacji (coarse gating w middleware + właściwe sprawdzenie w kliencie). Nie wprowadzamy SSR danych.
- Błędy i limity: UI korzysta z istniejących mechanizmów (`GlobalErrorBoundary`, `RateLimitBanner`, `useRateLimit()`), zachowując spójny format błędów (`ErrorResponseDTO`).

---

## 4. Zmiany w strukturze projektu (do implementacji)

Pliki/ścieżki do dodania:

- Strony:
  - `src/pages/auth/login.astro`
  - `src/pages/auth/register.astro`
  - `src/pages/auth/reset-password.astro`
  - `src/pages/auth/update-password.astro`
  - `src/pages/auth/verify.astro` (opcjonalnie prosty ekran stanu)
- Layout:
  - `src/layouts/AuthLayout.astro`
- Komponenty React:
  - `src/components/system/auth/LoginForm.tsx`
  - `src/components/system/auth/RegisterForm.tsx`
  - `src/components/system/auth/ResetPasswordRequestForm.tsx`
  - `src/components/system/auth/UpdatePasswordForm.tsx`
  - `src/components/system/auth/ResendVerificationForm.tsx`
- Supabase klienci:
  - `src/db/supabase.browser.ts` (persistSession+autoRefresh – do użycia w przeglądarce)
  - `src/db/supabase.admin.ts` (wymagany, tylko serwer)
- Schematy walidacji:
  - `src/lib/schemas/auth.ts` (Zod: Email, Password, Reset, Resend)
- Endpointy API:
  - `src/pages/api/v1/auth/reset-password.ts` (POST)
  - `src/pages/api/v1/auth/resend-verification.ts` (POST)
- Middleware:
  - Rozszerzenie `src/middleware/index.ts` o coarse gating (redirect na `/auth/login` przy braku cookies Supabase) dla chronionych ścieżek.

Uwaga o stylu/konwencjach kodu:

- TypeScript 5, wyłącznie podwójne cudzysłowy i średniki; guard clauses, spójny `ErrorResponseDTO`; brak zbędnych `else`.

---

## 5. Kontrakty i mapowanie UI ↔ API

### 5.1 Auth – działania bez naszego API (bezpośrednio Supabase z przeglądarki)

- Rejestracja: `supabase.auth.signUp({ email, password, options: { emailRedirectTo } })`
- Logowanie: `supabase.auth.signInWithPassword({ email, password })`
- Wylogowanie: `supabase.auth.signOut()`
- Finalizacja resetu: `supabase.auth.exchangeCodeForSession(code)` → `supabase.auth.updateUser({ password })`

### 5.2 Auth – działania przez nasze API (limity i spójny format błędów)

- `POST /api/v1/auth/reset-password`
  - Request: `{ email: string }`
  - Response: `204` lub `429/422/5xx` w formacie `ErrorResponseDTO`
- `POST /api/v1/auth/resend-verification`
  - Request: `{ email: string }`
  - Response: `204` lub `429/422/5xx` w formacie `ErrorResponseDTO`

### 5.3 Kody odpowiedzi i UX

- 204 – neutralny sukces (zawsze bez ujawniania istnienia konta).
- 422 – walidacje (UI oznacza pola, toasty informacyjne).
- 429 – aktywacja `useRateLimit()` i `RateLimitBanner` z odliczaniem.
- 5xx – „Wystąpił błąd, spróbuj ponownie” + akcja retry.

---

## 6. Scenariusze brzegowe i odporność

- Wielokrotne kliknięcia (US-097): przyciski formularzy w stanie Loading/Disabled; idempotencja po stronie serwera nie jest wymagana dla reset/resend (ich „duplikacja” i tak kończy się na limiterze).
- Słabe łącze (US-070): toast + retry; w razie timeoutu – brak dublowania żądań.
- Niezgodność tokenu/ważności linku: czytelny ekran w `/auth/update-password` lub `/auth/verify` z informacją o wygaśnięciu i CTA ponownego żądania.
- Zgodność i format liczb/daty – nie dotyczy bezpośrednio auth, ale nie naruszamy istniejącej obsługi.

---

## 7. Wpływ na istniejące elementy

- Brak zmian w danych domenowych ani endpointach list/CRUD.
- Dodanie coarse gatingu w middleware z redirectem do `/auth/login` (bez SSR danych), co nie wpływa na już istniejące wyspy React.
- Integracja z istniejącymi komponentami systemowymi (`GlobalErrorBoundary`, `RateLimitBanner`, `OfflineBanner`) – spójny UX.

---

## 8. Minimalne kroki wdrożeniowe (kolejność sugerowana)

1. Dodać `supabase.browser.ts` i formularze React (Login, Register, ResetRequest, UpdatePassword, ResendVerification).
2. Dodać `supabase.admin.ts` (service role) – limiter i ewentualne generowanie linków.
3. Utworzyć strony `/auth/*` i `AuthLayout.astro`.
4. Zaimplementować endpointy `POST /api/v1/auth/reset-password` i `POST /api/v1/auth/resend-verification` + Zod schematy + integrację z `rate_limits` (user_id).
5. Rozszerzyć middleware o coarse gating chronionych ścieżek.
6. Podpiąć przycisk „Wyloguj” w `Navigation.tsx`.
7. Ustawić `emailRedirectTo`:
   - rejestracja: `<APP_ORIGIN>/auth/verify`
   - reset hasła: `<APP_ORIGIN>/auth/update-password`
8. Testy manualne ścieżek (US-001..004) + limity (US-033/034) i nieweryfikowane konto (US-071).

---

## 9. Compliance z PRD

- US-001: Rejestracja + e-mail weryfikacyjny (30 min), polityka haseł, ekran sukcesu.
- US-002: Logowanie, jasne komunikaty, dedykowana strona.
- US-003: Wylogowanie, przekierowanie do logowania.
- US-004: Reset hasła z limitem 3/30 i linkiem 30 min, polityka haseł.
- US-033/034: Limity 3/30 – endpointy z limiterem i prezentacją czasu do odblokowania.
- US-071: Dostęp tylko po weryfikacji – gating w UI + coarse middleware.
- US-043/084: HTTPS wymuszone w prod; linki e‑mail jednorazowe, ważne 30 min.
- Pozostałe wymagania jakościowe: spójny format błędów, toasty po polsku, brak SSR danych domenowych, zgodność z i18n i banerami.

---

## 10. Załączniki/odniesienia

- Konfiguracja Astro: `astro.config.mjs` (output "server", adapter Node).
- Klient Supabase (serwer): `src/db/supabase.client.ts` – przypinany do `locals` w middleware.
- Middleware bazowe (do rozszerzenia): `src/middleware/index.ts`.
- Hook i typy limitów: `src/components/system/hooks/useRateLimit.ts`, `src/types.ts` (`RateLimitScope`, `ErrorResponseDTO`).
