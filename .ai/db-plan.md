### Schemat bazy danych FinFlow (PostgreSQL)

Poniżej kompletny, znormalizowany schemat (3NF) z ograniczeniami domenowymi, indeksami, RLS i elementami operacyjnymi pod wymagania PRD i ustalenia sesji.

### 1. Lista tabel z kolumnami, typami i ograniczeniami

- Tabela: `profiles`
  - This table is managed by Supabase Auth

  - Kolumny:
    - `user_id uuid primary key` — identyfikator użytkownika, 1:1 z kontem auth; insert zarządzany serwisowo
    - `email_confirmed boolean not null default false`
    - `created_at timestamptz not null default now()`
    - `updated_at timestamptz not null default now()`
  - Ograniczenia:
    - PK: (`user_id`)

- Tabela: `transaction_categories` (słownik globalny, tylko odczyt dla klientów)
  - Kolumny:
    - `code text primary key` — np. GROCERIES, TRANSPORT, ...
    - `kind text not null check (kind in ('INCOME','EXPENSE'))`
    - `label_pl text not null`
    - `is_active boolean not null default true`
    - `created_at timestamptz not null default now()`
    - `updated_at timestamptz not null default now()`
  - Ograniczenia:
    - PK: (`code`)
    - CHECK: `kind` w zbiorze {INCOME, EXPENSE}

- Tabela: `goal_types` (słownik globalny, tylko odczyt dla klientów)
  - Kolumny:
    - `code text primary key` — np. AUTO, VACATION, ...
    - `label_pl text not null`
    - `is_active boolean not null default true`
    - `created_at timestamptz not null default now()`
    - `updated_at timestamptz not null default now()`
  - Ograniczenia:
    - PK: (`code`)

- Tabela: `goals`
  - Kolumny:
    - `id uuid primary key default gen_random_uuid()`
    - `user_id uuid not null references profiles(user_id) on delete cascade`
    - `name text not null check (char_length(name) between 1 and 100)`
    - `type_code text not null references goal_types(code)`
    - `target_amount_cents integer not null check (target_amount_cents > 0)`
    - `current_balance_cents integer not null default 0 check (current_balance_cents >= 0)`
    - `is_priority boolean not null default false`
    - `archived_at timestamptz` — archiwizacja, brak twardego usunięcia
    - `deleted_at timestamptz` — soft-delete (ukrywane przez RLS)
    - `deleted_by uuid` — kto zainicjował soft-delete
    - `created_at timestamptz not null default now()`
    - `updated_at timestamptz not null default now()`
    - `created_by uuid not null default auth.uid()`
    - `updated_by uuid not null default auth.uid()`
  - Ograniczenia:
    - PK: (`id`)
    - FK: (`user_id`) → `profiles(user_id)` (ON DELETE CASCADE)
    - FK: (`type_code`) → `goal_types(code)`
    - CHECK: `NOT (is_priority AND archived_at IS NOT NULL)` — brak priorytetu dla zarchiwizowanych

- Tabela: `goal_events` (operacje salda celu)
  - Kolumny:
    - `id uuid primary key default gen_random_uuid()`
    - `user_id uuid not null references profiles(user_id) on delete cascade`
    - `goal_id uuid not null references goals(id) on delete cascade`
    - `type text not null check (type in ('DEPOSIT','WITHDRAW'))`
    - `amount_cents integer not null check (amount_cents > 0)`
    - `occurred_on date not null check (occurred_on <= current_date)`
    - `month date not null generated always as (date_trunc('month', occurred_on)) stored`
    - `client_request_id text not null` — idempotencja
    - `created_at timestamptz not null default now()`
    - `created_by uuid not null default auth.uid()`
  - Ograniczenia:
    - PK: (`id`)
    - FK: (`user_id`) → `profiles(user_id)` (ON DELETE CASCADE)
    - FK: (`goal_id`) → `goals(id)` (ON DELETE CASCADE)
    - UNIQUE: (`user_id`, `client_request_id`)
    - CHECK: `occurred_on <= current_date`
    - CHECK: `amount_cents > 0`

- Tabela: `transactions`
  - Kolumny:
    - `id uuid primary key default gen_random_uuid()`
    - `user_id uuid not null references profiles(user_id) on delete cascade`
    - `type text not null check (type in ('INCOME','EXPENSE'))`
    - `category_code text not null`
    - `amount_cents integer not null check (amount_cents > 0)`
    - `occurred_on date not null check (occurred_on <= current_date)`
    - `month date not null generated always as (date_trunc('month', occurred_on)) stored`
    - `note text check (note is null or (char_length(note) <= 500 and note !~ '[[:cntrl:]]'))`
    - `client_request_id text not null` — idempotencja
    - `deleted_at timestamptz`
    - `deleted_by uuid`
    - `created_at timestamptz not null default now()`
    - `updated_at timestamptz not null default now()`
    - `created_by uuid not null default auth.uid()`
    - `updated_by uuid not null default auth.uid()`
  - Ograniczenia:
    - PK: (`id`)
    - FK: (`user_id`) → `profiles(user_id)` (ON DELETE CASCADE)
    - FK złożony spójności typu/kategorii: (`category_code`, `type`) → `transaction_categories(code, kind)`
    - UNIQUE: (`user_id`, `client_request_id`)
    - CHECK: `occurred_on <= current_date`
    - CHECK: `amount_cents > 0`

- Tabela: `monthly_metrics` (pochodna, utrzymywana inkrementalnie + reconcile)
  - Kolumny:
    - `user_id uuid not null references profiles(user_id) on delete cascade`
    - `month date not null`
    - `income_cents bigint not null default 0`
    - `expenses_cents bigint not null default 0`
    - `net_saved_cents bigint not null default 0` — Σ(DEPOSIT−WITHDRAW) w miesiącu
    - `free_cash_flow_cents bigint not null default 0` — Dochód − Wydatki − Netto_odłożone
    - `refreshed_at timestamptz not null default now()`
  - Ograniczenia:
    - PK: (`user_id`, `month`)
    - CHECK: `month = date_trunc('month', month)`

- Tabela: `audit_log` (retencja 30 dni)
  - Kolumny:
    - `id uuid primary key default gen_random_uuid()`
    - `owner_user_id uuid not null` — właściciel danych
    - `actor_user_id uuid not null` — wykonawca akcji
    - `entity_type text not null` — np. 'transaction' | 'goal' | 'goal_event'
    - `entity_id uuid not null`
    - `action text not null check (action in ('CREATE','UPDATE','DELETE'))`
    - `before jsonb`
    - `after jsonb`
    - `performed_at timestamptz not null default now()`
  - Ograniczenia:
    - PK: (`id`)

- Tabela: `rate_limits` (tylko service role; dla verify/reset)
  - Kolumny:
    - `id bigserial primary key`
    - `user_id uuid not null`
    - `action text not null` — np. 'verify_email', 'reset_password'
    - `occurred_at timestamptz not null default now()`
    - `bucket_30m timestamptz not null generated always as (date_trunc('hour', occurred_at) + (floor(extract(minute from occurred_at)/30)::int || ' minutes')::interval) stored`
  - Ograniczenia:
    - PK: (`id`)

### 2. Relacje między tabelami

- `profiles (1) — (N) goals` przez `goals.user_id`
- `profiles (1) — (N) transactions` przez `transactions.user_id`
- `profiles (1) — (N) goal_events` przez `goal_events.user_id`
- `goals (1) — (N) goal_events` przez `goal_events.goal_id`
- `transaction_categories (1) — (N) transactions` przez FK złożony (`category_code`, `type`) → (`code`, `kind`)
- `goal_types (1) — (N) goals` przez `goals.type_code`
- `profiles (1) — (N) monthly_metrics` przez (`user_id`,`month`)
- `profiles (1) — (N) audit_log` przez `audit_log.owner_user_id`
- `profiles (1) — (N) rate_limits` przez `rate_limits.user_id`

Kardynalność:
- Jeden użytkownik ma wiele transakcji/celów/zdarzeń i wpisów w logu.
- Jeden cel ma wiele zdarzeń (`goal_events`).
- Kategorie i typy celów są słownikami globalnymi (wiele rekordów zależnych).

### 3. Indeksy

- Rozszerzenia:
  - Wymagane: `pgcrypto` (dla `gen_random_uuid()`), `pg_trgm` (GIN po `transactions.note`)

- `profiles`
  - PK: `profiles_pkey(user_id)`

- `transaction_categories`
  - PK: `transaction_categories_pkey(code)`
  - Dodatkowy indeks filtrujący aktywne: `idx_tc_kind_active(kind) where is_active` (opcjonalnie)

- `goal_types`
  - PK: `goal_types_pkey(code)`
  - Dodatkowy indeks filtrujący aktywne: `idx_gt_active() where is_active` (opcjonalnie)

- `goals`
  - PK: `goals_pkey(id)`
  - Keyset/przeglądy: `idx_goals_user_month(user_id, id desc)` — ogólne
  - Częściowe pod aktywne (nieusunięte): `idx_goals_active(user_id) where deleted_at is null and archived_at is null`
  - Unikat priorytetu: `uniq_goals_priority(user_id) where is_priority and archived_at is null`
  - FK: `idx_goals_user(user_id)`

- `goal_events`
  - PK: `goal_events_pkey(id)`
  - Idempotencja: `uniq_goal_events_request(user_id, client_request_id)`
  - Filtrowanie miesiąca: `idx_ge_user_month(user_id, month, type)`
  - Agregacje celu: `idx_ge_goal_month(goal_id, month)`
  - FK: `idx_ge_user(user_id)`, `idx_ge_goal(goal_id)`

- `transactions`
  - PK: `transactions_pkey(id)`
  - Idempotencja: `uniq_transactions_request(user_id, client_request_id)`
  - Keyset (lista, sort malejąco po dacie): `idx_tx_keyset(user_id, occurred_on desc, id desc) where deleted_at is null`
  - Miesiąc: `idx_tx_user_month(user_id, month) where deleted_at is null`
  - Typ+miesiąc: `idx_tx_user_type_month(user_id, type, month) where deleted_at is null`
  - Kategoria: `idx_tx_user_cat_month(user_id, category_code, month) where deleted_at is null`
  - Wyszukiwanie po notatce: `idx_tx_note_trgm using gin (note gin_trgm_ops) where note is not null and deleted_at is null`
  - FK: `idx_tx_user(user_id)`

- `monthly_metrics`
  - PK: `monthly_metrics_pkey(user_id, month)`
  - Filtrowanie: `idx_mm_user_month(user_id, month)`

- `audit_log`
  - PK: `audit_log_pkey(id)`
  - Oś czasu właściciela: `idx_al_owner_time(owner_user_id, performed_at desc)`
  - Po encji: `idx_al_owner_entity(owner_user_id, entity_type, entity_id, performed_at desc)`
  - JSONB (opcjonalnie, gdy potrzebne): `idx_al_after_gin using gin (after)` / `idx_al_before_gin using gin (before)`

- `rate_limits`
  - Agregacja limitów: `idx_rl_bucket(user_id, action, bucket_30m)`
  - Ostatnie zdarzenia: `idx_rl_recent(user_id, action, occurred_at desc)`

### 4. Zasady PostgreSQL (RLS i bezpieczeństwo)

- Ogólne:
  - Włącz RLS: `alter table <tabela> enable row level security;`
  - Gating „tylko zweryfikowani”: polityki odwołują się do `profiles`:
    - Warunek pomocniczy (wewnątrz USING/WITH CHECK): `auth.uid() = user_id and exists (select 1 from profiles p where p.user_id = auth.uid() and p.email_confirmed)`
  - Polityki nazwać i utrzymywać per operacja (SELECT/INSERT/UPDATE/DELETE).

- `profiles`
  - SELECT: właściciel — `USING (user_id = auth.uid())`
  - INSERT/UPDATE: tylko service role (brak polityk dla roli klienta)
  - DELETE: zabronione (brak polityki; hard-delete konta z procesu administracyjnego)

- `transaction_categories`, `goal_types`
  - SELECT: `USING (true)` — publiczny odczyt (lub ograniczony do ról aplikacyjnych)
  - INSERT/UPDATE/DELETE: tylko service role (brak polityk dla klientów)

- `goals`
  - SELECT: `USING (user_id = auth.uid() and exists(select 1 from profiles p where p.user_id=auth.uid() and p.email_confirmed))`
  - INSERT: `WITH CHECK (user_id = auth.uid() and exists(select 1 from profiles p where p.user_id=auth.uid() and p.email_confirmed))`
  - UPDATE: jak wyżej; zmianę `user_id` blokuje CHECK/trigger (lub `WITH CHECK (user_id = auth.uid())`)
  - DELETE: brak polityki (używamy soft-delete przez UPDATE `deleted_at`)

- `transactions`
  - SELECT/INSERT/UPDATE: analogicznie jak `goals` (wymóg weryfikacji + właściciel)
  - DELETE: brak polityki (soft-delete przez UPDATE `deleted_at`)

- `goal_events`
  - SELECT: `USING (user_id = auth.uid() and exists(select 1 from profiles p where p.user_id=auth.uid() and p.email_confirmed))`
  - INSERT: brak polityki dla klienta — wstawianie wyłącznie przez funkcję `rpc.add_goal_event()` (SECURITY DEFINER), która:
    - Sprawdza właściciela i, że `goal.archived_at is null`
    - Wykonuje `SELECT ... FOR UPDATE` na `goals` i waliduje saldo (WITHDRAW nie może zejść < 0)
    - Wstawia rekord `goal_events` (idempotencja po `(user_id, client_request_id)`)
    - Aktualizuje `goals.current_balance_cents` w jednej transakcji
  - UPDATE/DELETE: brak polityk (brak edycji/DELETE; ewentualne korekty przez osobną, kontrolowaną procedurę)

- `monthly_metrics`
  - SELECT: właściciel (jak wyżej)
  - INSERT/UPDATE/DELETE: tylko funkcje serwisowe/trigger (brak polityk dla klienta)

- `audit_log`
  - SELECT: `USING (owner_user_id = auth.uid())`
  - INSERT: wyłącznie triggery (C/U/D na tabelach biznesowych)
  - UPDATE/DELETE: zabronione

- `rate_limits`
  - Brak dostępu z klienta; operacje wyłącznie z roli serwisowej/Edge Function.

Bezpieczeństwo dodatkowe:
- Nie tworzyć DELETE-polityk dla danych biznesowych; zamiast tego soft-delete (UPDATE `deleted_at`).
- W funkcjach `SECURITY DEFINER` ustawić bezpieczny `search_path` i wymusić walidacje domenowe (np. `occurred_on <= current_date`).

### 5. Dodatkowe uwagi projektowe

- Identyfikatory:
  - Preferowany `uuidv7` generowany po stronie klienta (lepsza lokalność indeksów), fallback `gen_random_uuid()`; pole `id uuid` pozostaje kompatybilne.
  - Indeksy keyset bazują na `(occurred_on desc, id desc)` dla stabilnej paginacji.

- Zaokrąglanie i prezentacja:
  - Kwoty przechowywane w groszach (`integer`), agregaty w `bigint`.
  - Funkcja widokowa `bankers_round(numeric)` (HALF-EVEN) do zastosowania przy prezentacji PLN (do zdefiniowania w migracjach).

- Spójność typu/kategorii:
  - Złożony FK (`transactions.category_code`, `transactions.type`) → (`transaction_categories.code`, `transaction_categories.kind`) gwarantuje spójność słownika.

- Utrzymanie danych pochodnych:
  - `monthly_metrics` aktualizowane triggerami po `INSERT/UPDATE/soft-delete` w `transactions` oraz po dodaniu zdarzenia w `goal_events`; dodatkowy nocny reconcile przez job (Scheduler/Actions).
  - `audit_log` uzupełniany triggerami C/U/D na tabelach biznesowych, retencja 30 dni (job czyszczący).

- Walidacje domenowe:
  - `occurred_on <= current_date` na transakcjach i zdarzeniach celów.
  - `WITHDRAW` nie może zejść poniżej zera — egzekwowane w `rpc.add_goal_event`.
  - `note` maks. 500 znaków i bez znaków kontrolnych (CHECK).

- Wydajność:
  - Indeksy częściowe z `where deleted_at is null` minimalizują koszty soft-delete.
  - GIN `pg_trgm` na `transactions.note` wspiera filtr tekstowy.
  - Indeksy `(user_id, month)` i `(user_id, type, month)` optymalizują dashboard i listy.

- Operacje administracyjne:
  - Hard-delete konta użytkownika (24h) kaskadowo usuwa dane powiązane (z zachowaniem retencji `audit_log` przez 30 dni).
  - `rate_limits` egzekwowane w Edge Function (limity 3/30 min), brak ekspozycji do klienta.


