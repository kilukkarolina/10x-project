-- ==============================================================================
-- Migration: Create Auxiliary Tables
-- Description: Create supporting tables for metrics, audit, and rate limiting
-- Tables: monthly_metrics, audit_log, rate_limits
-- Author: FinFlow Database Schema
-- Created: 2025-11-09
-- ==============================================================================

-- ==============================================================================
-- 1. MONTHLY_METRICS TABLE
-- ==============================================================================

-- monthly_metrics: Derived table with monthly aggregations
-- Maintained incrementally through triggers + nightly reconciliation
-- Tracks income, expenses, savings, and free cash flow per user per month
create table monthly_metrics (
  user_id uuid not null references profiles(user_id) on delete cascade,
  month date not null,
  
  -- Monthly income total in groszy
  income_cents bigint not null default 0,
  
  -- Monthly expenses total in groszy
  expenses_cents bigint not null default 0,
  
  -- Net amount deposited to goals (deposits - withdrawals) in groszy
  net_saved_cents bigint not null default 0,
  
  -- Free cash flow: income - expenses - net_saved
  -- Represents money available after expenses and goal savings
  free_cash_flow_cents bigint not null default 0,
  
  -- Last refresh timestamp for reconciliation tracking
  refreshed_at timestamptz not null default now(),
  
  -- Composite primary key: one row per user per month
  primary key (user_id, month),
  
  -- Ensure month is start of month (first day)
  constraint chk_mm_month_start check (extract(day from month) = 1)
);

-- Add table comments
comment on table monthly_metrics is 'Derived monthly financial metrics per user, maintained by triggers and reconciliation';
comment on column monthly_metrics.income_cents is 'Sum of INCOME transactions for the month';
comment on column monthly_metrics.expenses_cents is 'Sum of EXPENSE transactions for the month';
comment on column monthly_metrics.net_saved_cents is 'Sum of DEPOSIT minus WITHDRAW goal events for the month';
comment on column monthly_metrics.free_cash_flow_cents is 'Calculated as: income - expenses - net_saved';
comment on column monthly_metrics.refreshed_at is 'Last update timestamp for reconciliation checks';

-- Primary key index (automatic)
-- monthly_metrics_pkey on (user_id, month)

-- Index for date-range queries
create index idx_mm_user_month 
  on monthly_metrics(user_id, month);

-- Enable RLS (managed by service role, read-only for verified users)
alter table monthly_metrics enable row level security;

-- ==============================================================================
-- 2. AUDIT_LOG TABLE
-- ==============================================================================

-- audit_log: Immutable audit trail of data changes
-- Populated by triggers on business tables (transactions, goals, goal_events)
-- 30-day retention enforced by scheduled job
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  
  -- Owner of the data being changed
  owner_user_id uuid not null,
  
  -- User who performed the action (can differ in multi-user scenarios)
  actor_user_id uuid not null,
  
  -- Entity type being audited
  entity_type text not null,
  
  -- ID of the specific entity instance
  entity_id uuid not null,
  
  -- Action performed
  action text not null check (action in ('CREATE', 'UPDATE', 'DELETE')),
  
  -- State before change (null for CREATE)
  before jsonb,
  
  -- State after change (null for DELETE)
  after jsonb,
  
  -- Timestamp of the action
  performed_at timestamptz not null default now()
);

-- Add table comments
comment on table audit_log is 'Immutable audit trail with 30-day retention, populated by triggers';
comment on column audit_log.owner_user_id is 'User who owns the data being changed';
comment on column audit_log.actor_user_id is 'User who performed the action';
comment on column audit_log.entity_type is 'Type of entity: transaction, goal, or goal_event';
comment on column audit_log.entity_id is 'UUID of the specific entity instance';
comment on column audit_log.action is 'CREATE, UPDATE, or DELETE';
comment on column audit_log.before is 'JSONB snapshot before change (null for CREATE)';
comment on column audit_log.after is 'JSONB snapshot after change (null for DELETE)';
comment on column audit_log.performed_at is 'Timestamp when action occurred';

-- Primary key index (automatic)
-- audit_log_pkey on (id)

-- Index for user's audit timeline (most recent first)
create index idx_al_owner_time 
  on audit_log(owner_user_id, performed_at desc);

-- Index for entity-specific audit trail
create index idx_al_owner_entity 
  on audit_log(owner_user_id, entity_type, entity_id, performed_at desc);

-- Optional GIN indexes on JSONB columns for advanced queries
-- Commented out initially as they can be expensive; enable if needed
-- create index idx_al_after_gin on audit_log using gin (after);
-- create index idx_al_before_gin on audit_log using gin (before);

-- Enable RLS (users can read their own audit logs)
alter table audit_log enable row level security;

-- ==============================================================================
-- 3. RATE_LIMITS TABLE
-- ==============================================================================

-- rate_limits: Rate limiting for sensitive operations
-- Accessed only by service role (Edge Functions)
-- Tracks email verification and password reset attempts
-- 30-minute bucket granularity for rate limit calculations
create table rate_limits (
  id bigserial primary key,
  
  -- User being rate limited
  user_id uuid not null,
  
  -- Action being rate limited (e.g., 'verify_email', 'reset_password')
  action text not null,
  
  -- Timestamp of the attempt
  occurred_at timestamptz not null default now(),
  
  -- 30-minute bucket for efficient rate limit queries
  -- Buckets are aligned to 00:00, 00:30, 01:00, 01:30, etc.
  -- Calculated via trigger
  bucket_30m timestamptz not null
);

-- Add table comments
comment on table rate_limits is 'Rate limiting log for sensitive operations, service-role only access';
comment on column rate_limits.user_id is 'User attempting the action';
comment on column rate_limits.action is 'Action type: verify_email, reset_password, etc.';
comment on column rate_limits.occurred_at is 'Timestamp of the attempt';
comment on column rate_limits.bucket_30m is '30-minute bucket for efficient rate limit checks, calculated via trigger';

-- Primary key index (automatic)
-- rate_limits_pkey on (id)

-- Index for rate limit bucket queries (e.g., count attempts in last 30 minutes)
create index idx_rl_bucket 
  on rate_limits(user_id, action, bucket_30m);

-- Index for recent attempts queries (ordered by most recent)
create index idx_rl_recent 
  on rate_limits(user_id, action, occurred_at desc);

-- Enable RLS (no client access - service role only)
alter table rate_limits enable row level security;

-- ==============================================================================
-- TRIGGER FOR BUCKET_30M CALCULATION
-- ==============================================================================

-- Function to calculate 30-minute bucket
create or replace function calculate_rate_limit_bucket()
returns trigger
language plpgsql
as $$
begin
  NEW.bucket_30m := timestamptz 'epoch' + 
    floor(extract(epoch from NEW.occurred_at) / 1800) * interval '1800 seconds';
  return NEW;
end;
$$;

-- Trigger to auto-calculate bucket_30m on insert
create trigger trg_rate_limits_bucket
  before insert on rate_limits
  for each row
  execute function calculate_rate_limit_bucket();

-- ==============================================================================
-- END OF MIGRATION
-- ==============================================================================

