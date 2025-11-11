-- ==============================================================================
-- Migration: Create Base Schema
-- Description: Initialize database extensions, profiles table, and dictionary tables
-- Tables: profiles, transaction_categories, goal_types
-- Author: FinFlow Database Schema
-- Created: 2025-11-09
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSIONS
-- ==============================================================================

-- pgcrypto: Required for gen_random_uuid() function
create extension if not exists pgcrypto;

-- pg_trgm: Required for trigram-based text search on transaction notes
create extension if not exists pg_trgm;

-- ==============================================================================
-- 2. PROFILES TABLE
-- ==============================================================================

-- profiles: User profile information linked 1:1 with Supabase Auth
-- Managed by service role, tracks email confirmation status
create table profiles (
  user_id uuid primary key,
  email_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add table comment
comment on table profiles is 'User profiles with 1:1 relationship to Supabase Auth users';
comment on column profiles.user_id is 'Primary key, matches auth.users.id';
comment on column profiles.email_confirmed is 'Email verification status, gates access to core features';

-- Enable RLS on profiles table
-- Access will be restricted through policies defined in later migration
alter table profiles enable row level security;

-- ==============================================================================
-- 3. TRANSACTION_CATEGORIES TABLE (Global Dictionary)
-- ==============================================================================

-- transaction_categories: Global dictionary of transaction categories
-- Read-only for clients, managed by service role
-- Enforces type-category consistency through composite foreign key
create table transaction_categories (
  code text primary key,
  kind text not null check (kind in ('INCOME', 'EXPENSE')),
  label_pl text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add table comments
comment on table transaction_categories is 'Global dictionary of transaction categories with income/expense classification';
comment on column transaction_categories.code is 'Unique category code (e.g., GROCERIES, TRANSPORT)';
comment on column transaction_categories.kind is 'Transaction type: INCOME or EXPENSE';
comment on column transaction_categories.label_pl is 'Polish language label for UI display';
comment on column transaction_categories.is_active is 'Flag to soft-disable categories without deletion';

-- Create composite unique index for FK relationship with transactions
-- This enables transactions table to reference (code, kind) for type consistency
create unique index transaction_categories_code_kind_idx 
  on transaction_categories(code, kind);

-- Optional: Index for filtering active categories by kind
create index idx_tc_kind_active 
  on transaction_categories(kind) 
  where is_active = true;

-- Enable RLS (publicly readable through policy)
alter table transaction_categories enable row level security;

-- ==============================================================================
-- 4. GOAL_TYPES TABLE (Global Dictionary)
-- ==============================================================================

-- goal_types: Global dictionary of savings goal types
-- Read-only for clients, managed by service role
create table goal_types (
  code text primary key,
  label_pl text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add table comments
comment on table goal_types is 'Global dictionary of savings goal types (e.g., AUTO, VACATION)';
comment on column goal_types.code is 'Unique goal type code';
comment on column goal_types.label_pl is 'Polish language label for UI display';
comment on column goal_types.is_active is 'Flag to soft-disable goal types without deletion';

-- Optional: Index for filtering active goal types
create index idx_gt_active 
  on goal_types(code) 
  where is_active = true;

-- Enable RLS (publicly readable through policy)
alter table goal_types enable row level security;

-- ==============================================================================
-- 5. SEED DATA FOR DICTIONARIES
-- ==============================================================================

-- Seed transaction_categories with common Polish financial categories
insert into transaction_categories (code, kind, label_pl, is_active) values
  -- Income categories
  ('SALARY', 'INCOME', 'Wynagrodzenie', true),
  ('BONUS', 'INCOME', 'Premia', true),
  ('BUSINESS', 'INCOME', 'Działalność gospodarcza', true),
  ('INVESTMENT', 'INCOME', 'Inwestycje', true),
  ('GIFT', 'INCOME', 'Prezent/Darowizna', true),
  ('OTHER_INCOME', 'INCOME', 'Inne przychody', true),
  
  -- Expense categories
  ('GROCERIES', 'EXPENSE', 'Zakupy spożywcze', true),
  ('TRANSPORT', 'EXPENSE', 'Transport', true),
  ('HOUSING', 'EXPENSE', 'Mieszkanie', true),
  ('UTILITIES', 'EXPENSE', 'Media', true),
  ('HEALTHCARE', 'EXPENSE', 'Zdrowie', true),
  ('ENTERTAINMENT', 'EXPENSE', 'Rozrywka', true),
  ('EDUCATION', 'EXPENSE', 'Edukacja', true),
  ('CLOTHING', 'EXPENSE', 'Odzież', true),
  ('DINING', 'EXPENSE', 'Restauracje', true),
  ('SUBSCRIPTIONS', 'EXPENSE', 'Subskrypcje', true),
  ('INSURANCE', 'EXPENSE', 'Ubezpieczenia', true),
  ('DEBT', 'EXPENSE', 'Spłata długów', true),
  ('OTHER_EXPENSE', 'EXPENSE', 'Inne wydatki', true);

-- Seed goal_types with common savings goals
insert into goal_types (code, label_pl, is_active) values
  ('AUTO', 'Samochód', true),
  ('VACATION', 'Wakacje', true),
  ('EMERGENCY', 'Fundusz awaryjny', true),
  ('HOUSE', 'Dom/Mieszkanie', true),
  ('EDUCATION', 'Edukacja', true),
  ('WEDDING', 'Ślub', true),
  ('RETIREMENT', 'Emerytura', true),
  ('ELECTRONICS', 'Elektronika', true),
  ('RENOVATION', 'Remont', true),
  ('INVESTMENT', 'Inwestycje', true),
  ('OTHER', 'Inny cel', true);

-- ==============================================================================
-- END OF MIGRATION
-- ==============================================================================

