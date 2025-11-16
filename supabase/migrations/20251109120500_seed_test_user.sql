-- ==============================================================================
-- Migration: Seed Test User for Development
-- Description: Adds DEFAULT_USER_ID to profiles for testing without auth
-- Author: FinFlow Development
-- Created: 2025-11-11
-- ==============================================================================

-- Insert test user into profiles table
-- This user corresponds to test user in auth.users
-- Email: hareyo4707@wivstore.com
-- User ID: 4eef0567-df09-4a61-9219-631def0eb53e
INSERT INTO profiles (user_id, email_confirmed, created_at, updated_at)
VALUES (
  '4eef0567-df09-4a61-9219-631def0eb53e',
  true,  -- email_confirmed = true (matches confirmed_at in auth.users)
  '2025-11-11 09:03:39.343841+00',  -- Match auth.users created_at
  '2025-11-11 09:03:39.396862+00'   -- Match auth.users updated_at
)
ON CONFLICT (user_id) DO UPDATE SET
  email_confirmed = EXCLUDED.email_confirmed,
  updated_at = EXCLUDED.updated_at;

-- Add comment for documentation
COMMENT ON TABLE profiles IS 'User profiles. Test user 4eef0567-df09-4a61-9219-631def0eb53e (hareyo4707@wivstore.com) is seeded for development.';

