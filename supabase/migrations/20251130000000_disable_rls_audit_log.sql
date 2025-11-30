-- ==============================================================================
-- Migration: Disable RLS for audit_log (Development)
-- Description: Disables RLS on audit_log table for testing without auth
-- Author: FinFlow Development
-- Created: 2025-11-30
-- ==============================================================================
-- 
-- WARNING: This migration is for DEVELOPMENT ONLY
-- RLS will be re-enabled once auth middleware is fully implemented
-- DO NOT deploy this to production
--
-- ==============================================================================

-- Disable RLS on audit_log table
ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;

-- Add comment for documentation
COMMENT ON TABLE audit_log IS 'Audit log of data changes. RLS DISABLED for development - re-enable before production';

