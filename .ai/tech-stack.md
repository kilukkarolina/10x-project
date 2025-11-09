Świetnie — wariant A z Astro 5 + React 19 + shadcn/ui, Supabase Free i Postmark „free” jest wykonalny dla MVP z jednym ważnym zastrzeżeniem: Postmark zazwyczaj nie ma trwałego darmowego planu produkcyjnego (zwykle to limit/test). Możemy to obejść tak, by nadal nie płacić za e‑maile: skonfiguruj Postmark jako pierwszy dostawca (na start/testy), a w razie wyczerpania limitu przełączysz samą konfigurację SMTP na Resend/Brevo (darmowe pule) — bez zmian w kodzie.

### Architektura – wariant A (prawie‑SPA na Astro)
- Frontend: Astro statyczny + jeden duży „React island” (panel po zalogowaniu), Tailwind 4, shadcn/ui. Brak SSR — dane przez `@supabase/supabase-js`.
- Backend: Supabase (Postgres + RLS, Auth, Edge Functions).
- E‑mail: Supabase Auth wysyła przez SMTP Postmark (domena z DKIM/SPF/DMARC). Fallback SMTP: Resend/Brevo, gdyby darmowy limit Postmark okazał się testowy.

### Co zrobić krok po kroku (skrócone)
- Wersje: zablokuj wersje Astro 5 / React 19 / Tailwind 4 / shadcn/ui, przetestuj hydrację komponentów.
- Supabase:
  - RLS on dla wszystkich tabel.
  - Tabele: `transactions`, `goals`, `goal_events`, `audit_log`, `rate_limits`.
  - Idempotencja: unikalny indeks dla `goal_events` (np. `(user_id, goal_id, payload_hash, time_bucket)`).
  - „Bankierskie” zaokrąglanie: funkcja SQL half-even i użycie jej w agregacjach.
  - Soft-delete: kolumna `deleted_at` i polityki.
- Auth + limity PRD:
  - Supabase Auth z własnym SMTP (Postmark). Wymuś tylko‑zweryfikowani w aplikacji.
  - Limity 3/30 min dla verify/reset: wołaj Supabase Auth przez własną Edge Function, która sprawdza `rate_limits` (wtedy wyświetlisz baner z czasem do odblokowania).
- Audit_log i retencja 30 dni:
  - Trigger na CREATE/UPDATE/DELETE.
  - Czyszczenie: cykliczny job (GitHub Actions cron wywołujący RPC) — bez kosztów.
- Backup + comiesięczny restore:
  - GitHub Actions (cron) robi `pg_dump` i testowy restore do projektu „dev-restore” + smoke test — nadal 0 PLN.
- Bezpieczeństwo:
  - Wymuś HTTPS na hostingu, ustaw `SameSite/Lax`, `Secure` dla cookies.
  - Sanityzacja notatek (XSS) po stronie UI.
- Hosting:
  - Skoro akceptujesz koszt hostingu: hostuj FE na DigitalOcean App Platform (statycznie) lub, jeśli chcesz jednak oszczędzić, na Cloudflare Pages (free).

### Konfiguracja SMTP w Supabase (Postmark)
W panelu Supabase (Authentication → SMTP) ustaw:
```
Host: smtp.postmarkapp.com
Port: 587
Username/Password: zgodnie z danymi z Postmark (Server Token wg dokumentacji)
From: FinFlow <no-reply@twojadomena.pl>
```
Po weryfikacji DKIM/SPF/DMARC w Postmark jakość dostarczalności spełni PRD. Jeśli limit „free” się skończy, zmieniasz tylko SMTP na Resend/Brevo — bez modyfikacji kodu.

### Czy spełnimy PRD „za free” (poza hostingiem)?
- Tak, dla skali MVP i testów: Auth, RLS, limity 3/30, audit_log 30 dni, idempotencja, rounding, agregaty, spójny format błędów (przez Edge Functions) — wszystko jest osiągalne na Supabase Free + CI/CD w GitHub Actions + Postmark (o ile mieścisz się w darmowych/gratisowych limitach startowych). Gdy Postmark przestanie być „free”, przełączysz SMTP na Resend/Brevo.

- Najważniejsze ryzyko: Postmark „free” nie jest planem długoterminowym produkcyjnie. Mitigacja: adapter SMTP i szybki fallback (zmiana konfiguracji), plus twarde limity 3/30 i blokada floodingu.

- Stabilność ≥99% (linia 720 w `prd.md`) — osiągalna przy: optimistic updates + szybki rollback, idempotencja zapisów, limiter na verify/reset, monitoring błędów na FE i retry z backoff.

- Koszt: płacisz tylko za hosting FE. Supabase i e‑mail pozostają w „free” dopóki mieszczą się w limitach.

- Minimalna konfiguracja środowiska (przykład):
```bash
# Supabase Auth SMTP (Postmark)
AUTH_SMTP_HOST=smtp.postmarkapp.com
AUTH_SMTP_PORT=587
AUTH_SMTP_USER=<POSTMARK_USERNAME_Z_DOKUMENTACJI>
AUTH_SMTP_PASS=<POSTMARK_SERVER_TOKEN>
AUTH_EMAIL_FROM="FinFlow <no-reply@twojadomena.pl>"
```

- Fallback bez kosztów: zmiana powyższych 4 zmiennych na Resend/Brevo.

- Dodatkowo: trzymaj adapter „EmailProvider” w kodzie (jedno miejsce zmiany providera), żeby przełączenie było natychmiastowe.

- Wniosek: przy wariancie A i Twoich założeniach zrobimy MVP bez dodatkowych opłat (poza hostingiem i domeną); kluczowe jest przygotowanie szybkiego fallbacku SMTP na wypadek limitów Postmark.

- Krótko:
  - OK na Supabase Free + Postmark „free” (z limitem) i płatny hosting.
  - Zrób adapter SMTP i fallback do Resend/Brevo.
  - Resztę wymagań PRD domykamy w Supabase (RLS, Edge Functions, triggery, cron przez Actions).