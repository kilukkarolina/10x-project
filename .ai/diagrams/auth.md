<authentication_analysis>

- Przepływy autentykacji (wg PRD i spec):
  - Rejestracja z e‑mailem weryfikacyjnym (US‑001).
  - Weryfikacja e‑mail (klik w link → ekran /auth/verify).
  - Logowanie e‑mail/hasło (US‑002) z obsługą konta nieweryfikowanego.
  - Coarse gating w middleware na podstawie cookies Supabase.
  - Wylogowanie (US‑003) i redirect do /auth/login.
  - Reset hasła: żądanie (limit 3/30) + finalizacja po kodzie (US‑004).
  - Ponowna wysyłka weryfikacji (limit 3/30) (US‑033/US‑071).
  - Odświeżanie tokenu po stronie przeglądarki (autoRefreshToken).
  - Wygaśnięcie tokenu i reakcja (signOut + redirect).

- Aktorzy:
  - Przeglądarka (React + @supabase/supabase-js).
  - Middleware (Astro) – coarse gating, bez SSR danych domenowych.
  - Astro API (tylko operacje z limitami: reset/resend).
  - Supabase Auth (signUp/signIn/signOut, verify, reset, refresh).

- Tokeny i odświeżanie:
  - Przeglądarka: persistSession=true, autoRefreshToken=true (po wdrożeniu
    `src/db/supabase.browser.ts`).
  - Middleware: wykrywa obecność cookies `sb-access-token`/`sb-refresh-token`
    i w razie braku przekierowuje na /auth/login (heurystyka).
  - Brak pełnej weryfikacji tokenu po stronie serwera (MVP); sesja domykana
    w kliencie. Błąd odświeżenia → signOut + redirect.

- Opis kroków (skrót):
  - Rejestracja: Browser → Auth: signUp(..., emailRedirectTo=/auth/verify),
    e‑mail ważny 30 min, neutralne komunikaty.
  - Logowanie: Browser → Auth: signInWithPassword; jeśli brak weryfikacji,
    CTA „Wyślij ponownie” przez API (limit 3/30). Gdy ok, redirect /dashboard.
  - Gating: wejście na chronione ścieżki bez cookies → 302 do /auth/login.
  - Reset: Browser → API: reset-password (limit) → Auth wysyła link z
    redirectTo=/auth/update-password; finalizacja przez exchangeCodeForSession
    + updateUser({ password }).
  - Wylogowanie: Browser → Auth: signOut(); redirect /auth/login.

</authentication_analysis>

<mermaid_diagram>

```mermaid
sequenceDiagram
autonumber
participant Browser
participant Auth as Supabase Auth

Note over Browser,Auth: Rejestracja i weryfikacja (US‑001)
Browser->>Auth: signUp(email,password,redirect=/auth/verify)
Auth-->>Browser: 200 (email wysłany, 30 min)
Browser->>Browser: Pokaż „Sprawdź e‑mail”
Browser->>Auth: Klik w link weryfikacyjny
Auth-->>Browser: Redirect /auth/verify
Browser->>Browser: Potwierdzenie
```

</mermaid_diagram>

<mermaid_diagram>

```mermaid
sequenceDiagram
autonumber
participant Browser
participant API as Astro API
participant Auth as Supabase Auth

Note over Browser,Auth: Logowanie i ponowna weryfikacja (US‑002/US‑071)
Browser->>Auth: signInWithPassword(email,password)
alt Konto nieweryfikowane
  Auth-->>Browser: email_not_confirmed
  Browser->>API: POST /auth/resend-verification
  alt Limit 3/30
    API-->>Browser: 429 {retry_after_seconds}
    Browser->>Browser: RateLimitBanner start
  else OK
    API-->>Browser: 204 No Content
  end
else Zweryfikowane
  Auth-->>Browser: {access,refresh} cookies
  Browser->>Browser: Redirect → /dashboard
end
```

</mermaid_diagram>

<mermaid_diagram>

```mermaid
sequenceDiagram
autonumber
participant Browser
participant Middleware

Note over Browser,Middleware: Coarse gating (chronione ścieżki)
Browser->>Middleware: GET /dashboard|/goals|/transactions
alt Brak cookies sb-access/refresh
  Middleware-->>Browser: 302 → /auth/login
else Cookies obecne
  Middleware-->>Browser: 200 OK
end
```

</mermaid_diagram>

<mermaid_diagram>

```mermaid
sequenceDiagram
autonumber
participant Browser
participant API as Astro API
participant Auth as Supabase Auth

Note over Browser,API: Reset hasła – żądanie (US‑004)
Browser->>API: POST /auth/reset-password
API->>Auth: resetPasswordForEmail(redirect=/auth/update-password)
alt Limit 3/30
  API-->>Browser: 429 {retry_after_seconds}
  Browser->>Browser: RateLimitBanner start
else OK
  API-->>Browser: 204 No Content
end

Note over Browser,Auth: Reset hasła – finalizacja
Browser->>Auth: /auth/update-password?code=...
Browser->>Auth: exchangeCodeForSession(code)
Auth-->>Browser: Sesja tymczasowa
Browser->>Auth: updateUser({password})
Auth-->>Browser: 200 (hasło zmienione)
Browser->>Browser: Redirect → /auth/login
```

</mermaid_diagram>

<mermaid_diagram>

```mermaid
sequenceDiagram
autonumber
participant Browser
participant Auth as Supabase Auth

Note over Browser,Auth: Odświeżanie i wygaśnięcie tokenu
Browser->>Auth: autoRefreshToken (w tle)
alt Odświeżenie nie powiodło się
  Auth-->>Browser: refresh error
  Browser->>Auth: signOut()
  Browser-->>Browser: Redirect → /auth/login
else Odświeżono OK
  Auth-->>Browser: nowe tokeny
end
```

</mermaid_diagram>

<mermaid_diagram>

```mermaid
sequenceDiagram
autonumber
participant Browser
participant Auth as Supabase Auth

Note over Browser,Auth: Wylogowanie (US‑003)
Browser->>Auth: signOut()
Browser->>Browser: Wyczyść stan lokalny
Browser->>Browser: Redirect → /auth/login
```

</mermaid_diagram>


