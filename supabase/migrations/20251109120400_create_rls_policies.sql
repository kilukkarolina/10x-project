-- ==============================================================================
-- Migration: Create RLS Policies
-- Description: Row Level Security policies for all tables
-- Author: FinFlow Database Schema
-- Created: 2025-11-09
-- ==============================================================================

-- ==============================================================================
-- HELPER FUNCTION: Check if user is verified
-- ==============================================================================

-- is_verified_user: Helper function to check if current user has verified email
create or replace function is_verified_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 
    from profiles 
    where user_id = auth.uid() 
      and email_confirmed = true
  );
$$;

comment on function is_verified_user() is 'Check if current authenticated user has verified their email';

-- ==============================================================================
-- 1. PROFILES TABLE POLICIES
-- ==============================================================================

-- profiles: Users can read their own profile
-- INSERT/UPDATE/DELETE managed by service role only

-- SELECT policy for authenticated users (own profile only)
create policy "authenticated_users_can_read_own_profile"
  on profiles
  for select
  to authenticated
  using (user_id = auth.uid());

-- No policy for anon users (cannot read profiles)
-- No INSERT/UPDATE/DELETE policies (service role only)

comment on policy "authenticated_users_can_read_own_profile" on profiles is 
  'Authenticated users can read their own profile data';

-- ==============================================================================
-- 2. TRANSACTION_CATEGORIES TABLE POLICIES
-- ==============================================================================

-- transaction_categories: Public read-only dictionary
-- All users (including anon) can read active categories

-- SELECT policy for anonymous users
create policy "anon_users_can_read_categories"
  on transaction_categories
  for select
  to anon
  using (true);

-- SELECT policy for authenticated users
create policy "authenticated_users_can_read_categories"
  on transaction_categories
  for select
  to authenticated
  using (true);

comment on policy "anon_users_can_read_categories" on transaction_categories is 
  'Anonymous users can read all transaction categories';
comment on policy "authenticated_users_can_read_categories" on transaction_categories is 
  'Authenticated users can read all transaction categories';

-- ==============================================================================
-- 3. GOAL_TYPES TABLE POLICIES
-- ==============================================================================

-- goal_types: Public read-only dictionary
-- All users (including anon) can read active goal types

-- SELECT policy for anonymous users
create policy "anon_users_can_read_goal_types"
  on goal_types
  for select
  to anon
  using (true);

-- SELECT policy for authenticated users
create policy "authenticated_users_can_read_goal_types"
  on goal_types
  for select
  to authenticated
  using (true);

comment on policy "anon_users_can_read_goal_types" on goal_types is 
  'Anonymous users can read all goal types';
comment on policy "authenticated_users_can_read_goal_types" on goal_types is 
  'Authenticated users can read all goal types';

-- ==============================================================================
-- 4. GOALS TABLE POLICIES
-- ==============================================================================

-- goals: Verified users can CRUD their own goals
-- Soft delete only (no DELETE policy, done via UPDATE)

-- SELECT policy for authenticated verified users
create policy "verified_users_can_read_own_goals"
  on goals
  for select
  to authenticated
  using (
    user_id = auth.uid() 
    and is_verified_user()
  );

-- INSERT policy for authenticated verified users
create policy "verified_users_can_create_goals"
  on goals
  for insert
  to authenticated
  with check (
    user_id = auth.uid() 
    and is_verified_user()
  );

-- UPDATE policy for authenticated verified users (own goals only)
create policy "verified_users_can_update_own_goals"
  on goals
  for update
  to authenticated
  using (
    user_id = auth.uid() 
    and is_verified_user()
  )
  with check (
    user_id = auth.uid() 
    and is_verified_user()
  );

-- No DELETE policy (soft delete via UPDATE of deleted_at)

comment on policy "verified_users_can_read_own_goals" on goals is 
  'Verified users can read their own goals';
comment on policy "verified_users_can_create_goals" on goals is 
  'Verified users can create new goals';
comment on policy "verified_users_can_update_own_goals" on goals is 
  'Verified users can update their own goals (including soft delete)';

-- ==============================================================================
-- 5. GOAL_EVENTS TABLE POLICIES
-- ==============================================================================

-- goal_events: Verified users can read their own events
-- INSERT only through add_goal_event() function (SECURITY DEFINER)
-- No UPDATE/DELETE policies (immutable records)

-- SELECT policy for authenticated verified users
create policy "verified_users_can_read_own_goal_events"
  on goal_events
  for select
  to authenticated
  using (
    user_id = auth.uid() 
    and is_verified_user()
  );

-- No INSERT policy (must use add_goal_event() function)
-- No UPDATE/DELETE policies (immutable)

comment on policy "verified_users_can_read_own_goal_events" on goal_events is 
  'Verified users can read their own goal events. Creation only via add_goal_event() function.';

-- ==============================================================================
-- 6. TRANSACTIONS TABLE POLICIES
-- ==============================================================================

-- transactions: Verified users can CRUD their own transactions
-- Soft delete only (no DELETE policy)

-- SELECT policy for authenticated verified users
create policy "verified_users_can_read_own_transactions"
  on transactions
  for select
  to authenticated
  using (
    user_id = auth.uid() 
    and is_verified_user()
  );

-- INSERT policy for authenticated verified users
create policy "verified_users_can_create_transactions"
  on transactions
  for insert
  to authenticated
  with check (
    user_id = auth.uid() 
    and is_verified_user()
  );

-- UPDATE policy for authenticated verified users (own transactions only)
create policy "verified_users_can_update_own_transactions"
  on transactions
  for update
  to authenticated
  using (
    user_id = auth.uid() 
    and is_verified_user()
  )
  with check (
    user_id = auth.uid() 
    and is_verified_user()
  );

-- No DELETE policy (soft delete via UPDATE of deleted_at)

comment on policy "verified_users_can_read_own_transactions" on transactions is 
  'Verified users can read their own transactions';
comment on policy "verified_users_can_create_transactions" on transactions is 
  'Verified users can create new transactions';
comment on policy "verified_users_can_update_own_transactions" on transactions is 
  'Verified users can update their own transactions (including soft delete)';

-- ==============================================================================
-- 7. MONTHLY_METRICS TABLE POLICIES
-- ==============================================================================

-- monthly_metrics: Verified users can read their own metrics
-- INSERT/UPDATE/DELETE managed by triggers only

-- SELECT policy for authenticated verified users
create policy "verified_users_can_read_own_metrics"
  on monthly_metrics
  for select
  to authenticated
  using (
    user_id = auth.uid() 
    and is_verified_user()
  );

-- No INSERT/UPDATE/DELETE policies (managed by triggers)

comment on policy "verified_users_can_read_own_metrics" on monthly_metrics is 
  'Verified users can read their own monthly metrics. Updates are managed by triggers.';

-- ==============================================================================
-- 8. AUDIT_LOG TABLE POLICIES
-- ==============================================================================

-- audit_log: Users can read their own audit logs
-- INSERT managed by triggers, no UPDATE/DELETE

-- SELECT policy for authenticated users (own audit logs only)
create policy "authenticated_users_can_read_own_audit_log"
  on audit_log
  for select
  to authenticated
  using (owner_user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies (managed by triggers and retention jobs)

comment on policy "authenticated_users_can_read_own_audit_log" on audit_log is 
  'Authenticated users can read their own audit logs. Logs are created by triggers.';

-- ==============================================================================
-- 9. RATE_LIMITS TABLE POLICIES
-- ==============================================================================

-- rate_limits: No client access
-- All operations performed by service role only (Edge Functions)
-- No policies needed - RLS is enabled but denies all client access by default

comment on table rate_limits is 
  'Rate limiting data - service role access only. No client policies.';

-- ==============================================================================
-- END OF MIGRATION
-- ==============================================================================

