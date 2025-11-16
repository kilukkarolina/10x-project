# Checklist: Re-Enable RLS for Production

## Ważne: RLS jest obecnie WYŁĄCZONY

Migracja `20251111090000_disable_rls_for_development.sql` wyłączyła RLS na następujących tabelach:
- ✅ `transactions`
- ✅ `goals`
- ✅ `goal_events`
- ✅ `monthly_metrics`

**To jest tymczasowe rozwiązanie dla development/testowania bez auth.**

---

## Przed deployem do production - checklist:

### 1. ✅ Zaimplementuj pełny auth middleware

**Wymagane zmiany w** `src/middleware/index.ts`:

```typescript
import { defineMiddleware } from "astro:middleware";
import { supabaseClient } from "@/db/supabase.client";

export const onRequest = defineMiddleware(async (context, next) => {
  // Get session from cookies or headers
  const accessToken = context.cookies.get("sb-access-token")?.value;
  const refreshToken = context.cookies.get("sb-refresh-token")?.value;

  if (accessToken && refreshToken) {
    const { data: { user }, error } = await supabaseClient.auth.getUser(accessToken);
    
    if (!error && user) {
      // Set user in context
      context.locals.user = user;
      
      // Create user-specific supabase client
      context.locals.supabase = createClient<Database>(
        import.meta.env.SUPABASE_URL,
        import.meta.env.SUPABASE_KEY,
        {
          auth: {
            persistSession: false,
          },
          global: {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        }
      );
    }
  }

  // Set default supabase client if no user
  if (!context.locals.supabase) {
    context.locals.supabase = supabaseClient;
  }

  return next();
});
```

**Aktualizuj** `src/env.d.ts`:

```typescript
declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient<Database>;
      user?: User;  // Add user type
    }
  }
}
```

### 2. ✅ Aktualizuj endpointy - używaj context.locals.user

**W** `src/pages/api/v1/transactions/index.ts`:

```typescript
export async function POST(context: APIContext) {
  // Check auth
  if (!context.locals.user) {
    return new Response(JSON.stringify({
      error: "Unauthorized",
      message: "User not authenticated"
    }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const body = await context.request.json();
    const command = CreateTransactionSchema.parse(body);
    
    // Use authenticated user ID instead of DEFAULT_USER_ID
    const transaction = await createTransaction(
      context.locals.supabase,  // User-specific client with auth header
      context.locals.user.id,    // Real user ID from session
      command
    );
    
    return new Response(JSON.stringify(transaction), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
    
  } catch (error) {
    // ... error handling
  }
}
```

### 3. ✅ Utwórz migrację do re-enable RLS

**Nowa migracja**: `YYYYMMDD_re_enable_rls_for_production.sql`

```sql
-- ==============================================================================
-- Migration: Re-Enable RLS for Production
-- Description: Re-enables RLS on all tables for security
-- Author: FinFlow Production
-- Created: YYYY-MM-DD
-- ==============================================================================

-- Re-enable RLS on transactions table
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Re-enable RLS on goals table
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

-- Re-enable RLS on goal_events table
ALTER TABLE goal_events ENABLE ROW LEVEL SECURITY;

-- Re-enable RLS on monthly_metrics table
ALTER TABLE monthly_metrics ENABLE ROW LEVEL SECURITY;

-- Update comments
COMMENT ON TABLE transactions IS 'User transactions. RLS ENABLED for security.';
COMMENT ON TABLE goals IS 'User savings goals. RLS ENABLED for security.';
COMMENT ON TABLE goal_events IS 'Goal deposit/withdrawal events. RLS ENABLED for security.';
COMMENT ON TABLE monthly_metrics IS 'Monthly financial metrics. RLS ENABLED for security.';

-- Verify RLS is enabled
DO $$
DECLARE
  rls_status RECORD;
BEGIN
  FOR rls_status IN 
    SELECT tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename IN ('transactions', 'goals', 'goal_events', 'monthly_metrics')
  LOOP
    IF NOT rls_status.rowsecurity THEN
      RAISE EXCEPTION 'RLS not enabled on table: %', rls_status.tablename;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'RLS successfully enabled on all tables';
END $$;
```

### 4. ✅ Usuń DEFAULT_USER_ID z produkcyjnego kodu

**W** `src/db/supabase.client.ts`:

```typescript
// Remove or comment out DEFAULT_USER_ID export
// export const DEFAULT_USER_ID = "4eef0567-df09-4a61-9219-631def0eb53e";

// Update comment to remove development notes
```

### 5. ✅ Testy przed deployem

#### Test 1: RLS verification
```sql
-- Run as anon user (should return 0 rows)
SELECT * FROM transactions;

-- Should fail with RLS error
INSERT INTO transactions (user_id, type, category_code, amount_cents, occurred_on, client_request_id, created_by, updated_by)
VALUES ('some-user-id', 'EXPENSE', 'GROCERIES', 1000, '2025-11-11', gen_random_uuid(), 'some-user-id', 'some-user-id');
```

#### Test 2: Auth flow
- [ ] User może się zalogować
- [ ] User może tworzyć swoje transakcje
- [ ] User NIE może widzieć transakcji innych userów
- [ ] User NIE może modyfikować transakcji innych userów

#### Test 3: Endpoint z prawdziwą sesją
```bash
# Login first to get session token
curl -X POST https://your-supabase-url/auth/v1/token?grant_type=password \
  -H "apikey: your_anon_key" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Use access_token in subsequent requests
curl -X POST https://your-app.com/api/v1/transactions \
  -H "Authorization: Bearer your_access_token" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

### 6. ✅ Deployment checklist

- [ ] Auth middleware zaimplementowany i przetestowany
- [ ] Wszystkie endpointy używają `context.locals.user.id`
- [ ] DEFAULT_USER_ID usunięty z produkcyjnego kodu
- [ ] Migracja RLS re-enable uruchomiona na production DB
- [ ] RLS policies zweryfikowane (wszystkie enabled)
- [ ] Testy manualne z prawdziwymi sesjami przeszły
- [ ] Testy E2E przeszły
- [ ] Security audit wykonany

---

## Quick Reference: Sprawdź status RLS

```sql
-- Check RLS status for all tables
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Should return true for production:
-- transactions: true
-- goals: true
-- goal_events: true
-- monthly_metrics: true
```

---

## Contact / Notes

Po włączeniu RLS i implementacji auth:
- Zaktualizuj ten dokument z datą wdrożenia
- Zarchiwizuj instrukcje development (DEFAULT_USER_ID)
- Zaktualizuj README z informacją o security


