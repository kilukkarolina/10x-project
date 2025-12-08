-- ==============================================================================
-- Migration: Enable RLS on All Tables
-- Description: Re-enables Row Level Security on all tables and ensures complete
--              CRUD policies are in place for production readiness
-- Author: FinFlow Database Schema
-- Created: 2025-12-08
-- ==============================================================================
-- 
-- This migration re-enables RLS that was previously disabled for development.
-- All policies from 20251109120400_create_rls_policies.sql are still active.
-- This migration only re-enables RLS enforcement on tables.
--
-- Tables affected:
--   - transactions
--   - goals  
--   - goal_events
--   - monthly_metrics
--   - audit_log
--
-- ==============================================================================

-- ==============================================================================
-- 1. RE-ENABLE RLS ON CORE BUSINESS TABLES
-- ==============================================================================

-- Enable RLS on transactions table
-- Policy coverage: SELECT, INSERT, UPDATE (verified users, own data)
-- No DELETE policy - soft deletes only via UPDATE
alter table transactions enable row level security;

comment on table transactions is 
  'User financial transactions. RLS ENABLED with policies for verified users to manage their own data.';

-- Enable RLS on goals table  
-- Policy coverage: SELECT, INSERT, UPDATE (verified users, own data)
-- No DELETE policy - soft deletes only via UPDATE
alter table goals enable row level security;

comment on table goals is 
  'User savings goals. RLS ENABLED with policies for verified users to manage their own data.';

-- Enable RLS on goal_events table
-- Policy coverage: SELECT only (verified users, own data)
-- INSERT via add_goal_event() function (SECURITY DEFINER)
-- No UPDATE/DELETE - immutable audit trail
alter table goal_events enable row level security;

comment on table goal_events is 
  'Goal deposit/withdrawal events. RLS ENABLED. Read-only for users, creation via add_goal_event() function.';

-- Enable RLS on monthly_metrics table
-- Policy coverage: SELECT only (verified users, own data)
-- INSERT/UPDATE/DELETE managed by database triggers
alter table monthly_metrics enable row level security;

comment on table monthly_metrics is 
  'Monthly financial metrics. RLS ENABLED. Read-only for users, maintained by triggers.';

-- Enable RLS on audit_log table
-- Policy coverage: SELECT only (authenticated users, own logs)
-- INSERT managed by database triggers
-- No UPDATE/DELETE - immutable audit trail
alter table audit_log enable row level security;

comment on table audit_log is 
  'Audit log of data changes. RLS ENABLED. Read-only for users, created by triggers.';

-- ==============================================================================
-- 2. VERIFY RLS STATUS ON ALL TABLES
-- ==============================================================================

-- The following tables already have RLS enabled and policies:
--   - profiles: SELECT only (authenticated users, own profile)
--   - transaction_categories: SELECT for all (public dictionary)
--   - goal_types: SELECT for all (public dictionary)
--   - rate_limits: No client access (service role only)

-- ==============================================================================
-- 3. EXISTING POLICIES SUMMARY
-- ==============================================================================

-- This migration does NOT create new policies. All policies were created in 
-- migration 20251109120400_create_rls_policies.sql and are still active:
--
-- PROFILES:
--   ✓ authenticated_users_can_read_own_profile (SELECT)
--
-- TRANSACTION_CATEGORIES:
--   ✓ anon_users_can_read_categories (SELECT)
--   ✓ authenticated_users_can_read_categories (SELECT)
--
-- GOAL_TYPES:
--   ✓ anon_users_can_read_goal_types (SELECT)
--   ✓ authenticated_users_can_read_goal_types (SELECT)
--
-- GOALS:
--   ✓ verified_users_can_read_own_goals (SELECT)
--   ✓ verified_users_can_create_goals (INSERT)
--   ✓ verified_users_can_update_own_goals (UPDATE)
--   ✗ No DELETE policy - soft delete only via UPDATE
--
-- GOAL_EVENTS:
--   ✓ verified_users_can_read_own_goal_events (SELECT)
--   ✗ No INSERT policy - use add_goal_event() function
--   ✗ No UPDATE/DELETE - immutable records
--
-- TRANSACTIONS:
--   ✓ verified_users_can_read_own_transactions (SELECT)
--   ✓ verified_users_can_create_transactions (INSERT)
--   ✓ verified_users_can_update_own_transactions (UPDATE)
--   ✗ No DELETE policy - soft delete only via UPDATE
--
-- MONTHLY_METRICS:
--   ✓ verified_users_can_read_own_metrics (SELECT)
--   ✗ No INSERT/UPDATE/DELETE - managed by triggers
--
-- AUDIT_LOG:
--   ✓ authenticated_users_can_read_own_audit_log (SELECT)
--   ✗ No INSERT/UPDATE/DELETE - managed by triggers
--
-- RATE_LIMITS:
--   ✗ No policies - service role access only
--
-- ==============================================================================
-- 4. SECURITY VERIFICATION
-- ==============================================================================

-- Verify that all user-facing tables have RLS enabled
do $$
declare
  v_table_name text;
  v_rls_enabled boolean;
  v_tables text[] := array[
    'profiles',
    'transaction_categories', 
    'goal_types',
    'goals',
    'goal_events',
    'transactions',
    'monthly_metrics',
    'audit_log',
    'rate_limits'
  ];
begin
  foreach v_table_name in array v_tables
  loop
    select relrowsecurity into v_rls_enabled
    from pg_class
    where relname = v_table_name
      and relnamespace = 'public'::regnamespace;
    
    if not v_rls_enabled then
      raise exception 'RLS is NOT enabled on table: %', v_table_name;
    end if;
    
    raise notice 'RLS verified enabled on table: %', v_table_name;
  end loop;
  
  raise notice 'SUCCESS: RLS is enabled on all required tables';
end $$;

-- ==============================================================================
-- END OF MIGRATION
-- ==============================================================================

