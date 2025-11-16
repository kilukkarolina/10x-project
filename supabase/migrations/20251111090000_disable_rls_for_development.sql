-- ==============================================================================
-- Migration: Disable RLS for Development
-- Description: Temporarily disables RLS on key tables for testing without auth
-- Author: FinFlow Development
-- Created: 2025-11-11
-- ==============================================================================
-- 
-- WARNING: This migration is for DEVELOPMENT ONLY
-- RLS will be re-enabled once auth middleware is fully implemented
-- DO NOT deploy this to production
--
-- ==============================================================================

-- Disable RLS on transactions table
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;

-- Disable RLS on goals table (for future endpoints)
ALTER TABLE goals DISABLE ROW LEVEL SECURITY;

-- Disable RLS on goal_events table (for future endpoints)
ALTER TABLE goal_events DISABLE ROW LEVEL SECURITY;

-- Disable RLS on monthly_metrics table (for future endpoints)
ALTER TABLE monthly_metrics DISABLE ROW LEVEL SECURITY;

-- profiles table remains with RLS enabled (managed by Supabase Auth)
-- transaction_categories and goal_types already have public read access

-- Add comments for documentation
COMMENT ON TABLE transactions IS 'User transactions. RLS DISABLED for development - re-enable before production';
COMMENT ON TABLE goals IS 'User savings goals. RLS DISABLED for development - re-enable before production';
COMMENT ON TABLE goal_events IS 'Goal deposit/withdrawal events. RLS DISABLED for development - re-enable before production';
COMMENT ON TABLE monthly_metrics IS 'Monthly financial metrics. RLS DISABLED for development - re-enable before production';


