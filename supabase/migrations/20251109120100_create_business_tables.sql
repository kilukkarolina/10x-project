-- ==============================================================================
-- Migration: Create Business Tables
-- Description: Create core business tables for transactions, goals, and goal events
-- Tables: goals, goal_events, transactions
-- Author: FinFlow Database Schema
-- Created: 2025-11-09
-- ==============================================================================

-- ==============================================================================
-- 1. GOALS TABLE
-- ==============================================================================

-- goals: User savings goals with target amounts and current balance
-- Supports archiving and soft-delete, priority flag for active goals
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  type_code text not null references goal_types(code),
  target_amount_cents integer not null check (target_amount_cents > 0),
  current_balance_cents integer not null default 0 check (current_balance_cents >= 0),
  is_priority boolean not null default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  
  -- Business constraint: archived goals cannot be priority
  constraint chk_goals_priority_not_archived 
    check (not (is_priority and archived_at is not null))
);

-- Add table comments
comment on table goals is 'User savings goals with target amounts and current balance tracking';
comment on column goals.name is 'User-defined goal name, 1-100 characters';
comment on column goals.type_code is 'References goal_types dictionary';
comment on column goals.target_amount_cents is 'Target amount in Polish groszy (1 PLN = 100 groszy)';
comment on column goals.current_balance_cents is 'Current saved amount, updated via goal_events';
comment on column goals.is_priority is 'Only one active goal can be priority per user';
comment on column goals.archived_at is 'Soft archival timestamp, archived goals excluded from active views';
comment on column goals.deleted_at is 'Soft delete timestamp for user-initiated deletion';
comment on column goals.deleted_by is 'User ID who initiated soft delete';

-- Primary key index (automatic)
-- goals_pkey on (id)

-- General keyset pagination index for user's goals
create index idx_goals_user_keyset 
  on goals(user_id, id desc);

-- Partial index for active (non-deleted, non-archived) goals
create index idx_goals_active 
  on goals(user_id) 
  where deleted_at is null and archived_at is null;

-- Unique index ensuring only one priority goal per user (among non-archived)
create unique index uniq_goals_priority 
  on goals(user_id) 
  where is_priority = true and archived_at is null;

-- Foreign key index for cascading deletes
create index idx_goals_user 
  on goals(user_id);

-- Enable RLS
alter table goals enable row level security;

-- ==============================================================================
-- 2. GOAL_EVENTS TABLE
-- ==============================================================================

-- goal_events: Immutable log of deposits/withdrawals to/from goals
-- Inserted through secure RPC function to maintain balance consistency
-- Supports idempotency through client_request_id
create table goal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  type text not null check (type in ('DEPOSIT', 'WITHDRAW')),
  amount_cents integer not null check (amount_cents > 0),
  occurred_on date not null check (occurred_on <= current_date),
  
  -- Generated column for efficient monthly aggregations
  month date not null generated always as (make_date(extract(year from occurred_on)::int, extract(month from occurred_on)::int, 1)) stored,
  
  -- Idempotency key to prevent duplicate operations
  client_request_id text not null,
  
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  
  -- Unique constraint for idempotency per user
  constraint uniq_goal_events_request unique (user_id, client_request_id)
);

-- Add table comments
comment on table goal_events is 'Immutable log of goal balance changes (deposits/withdrawals)';
comment on column goal_events.type is 'DEPOSIT adds to balance, WITHDRAW subtracts';
comment on column goal_events.amount_cents is 'Amount in groszy, always positive';
comment on column goal_events.occurred_on is 'Event date, cannot be in future';
comment on column goal_events.month is 'Generated column for efficient monthly aggregations';
comment on column goal_events.client_request_id is 'Idempotency key from client to prevent duplicates';

-- Primary key index (automatic)
-- goal_events_pkey on (id)

-- Idempotency unique index (automatic from constraint)
-- uniq_goal_events_request on (user_id, client_request_id)

-- Index for filtering and aggregating by user and month
create index idx_ge_user_month 
  on goal_events(user_id, month, type);

-- Index for goal-specific aggregations by month
create index idx_ge_goal_month 
  on goal_events(goal_id, month);

-- Foreign key indexes
create index idx_ge_user 
  on goal_events(user_id);
  
create index idx_ge_goal 
  on goal_events(goal_id);

-- Enable RLS
alter table goal_events enable row level security;

-- ==============================================================================
-- 3. TRANSACTIONS TABLE
-- ==============================================================================

-- transactions: User income and expense records
-- Supports soft-delete, idempotency, and full-text search on notes
-- Enforces category-type consistency through composite FK
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  type text not null check (type in ('INCOME', 'EXPENSE')),
  category_code text not null,
  amount_cents integer not null check (amount_cents > 0),
  occurred_on date not null check (occurred_on <= current_date),
  
  -- Generated column for efficient monthly aggregations
  month date not null generated always as (make_date(extract(year from occurred_on)::int, extract(month from occurred_on)::int, 1)) stored,
  
  -- Optional note with validation (max 500 chars, no control characters)
  note text check (note is null or (char_length(note) <= 500 and note !~ '[[:cntrl:]]')),
  
  -- Idempotency key to prevent duplicate transactions
  client_request_id text not null,
  
  -- Soft delete fields
  deleted_at timestamptz,
  deleted_by uuid,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  
  -- Unique constraint for idempotency per user
  constraint uniq_transactions_request unique (user_id, client_request_id),
  
  -- Composite foreign key ensures category matches transaction type
  -- References transaction_categories(code, kind)
  constraint fk_transactions_category 
    foreign key (category_code, type) 
    references transaction_categories(code, kind)
);

-- Add table comments
comment on table transactions is 'User financial transactions (income and expenses) with soft delete support';
comment on column transactions.type is 'Transaction type: INCOME or EXPENSE';
comment on column transactions.category_code is 'Must match type through composite FK to transaction_categories';
comment on column transactions.amount_cents is 'Amount in groszy, always positive';
comment on column transactions.occurred_on is 'Transaction date, cannot be in future';
comment on column transactions.month is 'Generated column for efficient monthly aggregations';
comment on column transactions.note is 'Optional note, max 500 chars, no control characters';
comment on column transactions.client_request_id is 'Idempotency key from client';
comment on column transactions.deleted_at is 'Soft delete timestamp';
comment on column transactions.deleted_by is 'User ID who soft-deleted the transaction';

-- Primary key index (automatic)
-- transactions_pkey on (id)

-- Idempotency unique index (automatic from constraint)
-- uniq_transactions_request on (user_id, client_request_id)

-- Keyset pagination index for transaction list (descending date order)
-- Excludes soft-deleted records
create index idx_tx_keyset 
  on transactions(user_id, occurred_on desc, id desc) 
  where deleted_at is null;

-- Index for monthly aggregations by user
create index idx_tx_user_month 
  on transactions(user_id, month) 
  where deleted_at is null;

-- Index for filtering by type and month (dashboard queries)
create index idx_tx_user_type_month 
  on transactions(user_id, type, month) 
  where deleted_at is null;

-- Index for category-based filtering and aggregations
create index idx_tx_user_cat_month 
  on transactions(user_id, category_code, month) 
  where deleted_at is null;

-- GIN index for full-text search on notes using trigrams
-- Only indexes non-null, non-deleted transaction notes
create index idx_tx_note_trgm 
  on transactions using gin (note gin_trgm_ops) 
  where note is not null and deleted_at is null;

-- Foreign key index
create index idx_tx_user 
  on transactions(user_id);

-- Enable RLS
alter table transactions enable row level security;

-- ==============================================================================
-- END OF MIGRATION
-- ==============================================================================

