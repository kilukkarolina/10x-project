-- ==============================================================================
-- Migration: Modify RPC Functions for Development
-- Description: Temporarily modifies add_goal_event to use DEFAULT_USER_ID when auth.uid() is null
-- Author: FinFlow Development
-- Created: 2025-11-23
-- ==============================================================================
-- 
-- WARNING: This migration is for DEVELOPMENT ONLY
-- RPC function will be restored to require auth once auth middleware is fully implemented
-- DO NOT deploy this to production
--
-- ==============================================================================

-- Drop and recreate add_goal_event with development-friendly auth handling
create or replace function add_goal_event(
  p_goal_id uuid,
  p_type text,
  p_amount_cents integer,
  p_occurred_on date,
  p_client_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_goal_user_id uuid;
  v_goal_archived_at timestamptz;
  v_current_balance integer;
  v_new_balance integer;
  v_event_id uuid;
  v_existing_event_id uuid;
  v_default_user_id uuid := '4eef0567-df09-4a61-9219-631def0eb53e'::uuid; -- DEFAULT_USER_ID from seed
begin
  -- Get current user ID (use DEFAULT_USER_ID if auth.uid() is null - DEVELOPMENT ONLY)
  v_user_id := auth.uid();
  
  -- DEVELOPMENT MODE: Use default user when auth is not available
  if v_user_id is null then
    v_user_id := v_default_user_id;
  end if;
  
  -- Validate user exists and is verified (skip email check in development when using default user)
  if v_user_id != v_default_user_id then
    if not exists (
      select 1 from profiles 
      where user_id = v_user_id and email_confirmed = true
    ) then
      raise exception 'Email verification required';
    end if;
  end if;
  
  -- Validate event type
  if p_type not in ('DEPOSIT', 'WITHDRAW') then
    raise exception 'Invalid event type: must be DEPOSIT or WITHDRAW';
  end if;
  
  -- Validate amount
  if p_amount_cents <= 0 then
    raise exception 'Amount must be positive';
  end if;
  
  -- Validate date not in future
  if p_occurred_on > current_date then
    raise exception 'Event date cannot be in the future';
  end if;
  
  -- Check for existing event with same client_request_id (idempotency)
  select id into v_existing_event_id
  from goal_events
  where user_id = v_user_id 
    and client_request_id = p_client_request_id;
  
  if v_existing_event_id is not null then
    -- Idempotent: return existing event ID
    return v_existing_event_id;
  end if;
  
  -- Lock goal row and validate ownership + status
  select 
    g.user_id,
    g.archived_at,
    g.current_balance_cents
  into 
    v_goal_user_id,
    v_goal_archived_at,
    v_current_balance
  from goals g
  where g.id = p_goal_id
    and g.deleted_at is null
  for update;
  
  -- Validate goal exists and not soft-deleted
  if not found then
    raise exception 'Goal not found or has been deleted';
  end if;
  
  -- Validate user owns the goal
  if v_goal_user_id != v_user_id then
    raise exception 'Access denied: goal belongs to different user';
  end if;
  
  -- Validate goal is not archived
  if v_goal_archived_at is not null then
    raise exception 'Cannot modify archived goal';
  end if;
  
  -- Calculate new balance
  if p_type = 'DEPOSIT' then
    v_new_balance := v_current_balance + p_amount_cents;
  else -- WITHDRAW
    v_new_balance := v_current_balance - p_amount_cents;
    
    -- Validate withdrawal doesn't result in negative balance
    if v_new_balance < 0 then
      raise exception 'Insufficient balance: withdrawal would result in negative balance';
    end if;
  end if;
  
  -- Insert goal event
  insert into goal_events (
    user_id,
    goal_id,
    type,
    amount_cents,
    occurred_on,
    client_request_id,
    created_by
  ) values (
    v_user_id,
    p_goal_id,
    p_type,
    p_amount_cents,
    p_occurred_on,
    p_client_request_id,
    v_user_id
  )
  returning id into v_event_id;
  
  -- Update goal balance
  update goals
  set 
    current_balance_cents = v_new_balance,
    updated_at = now(),
    updated_by = v_user_id
  where id = p_goal_id;
  
  -- Return new event ID
  return v_event_id;
end;
$$;

comment on function add_goal_event is 'DEVELOPMENT MODE: Securely add goal event and update balance atomically. Uses DEFAULT_USER_ID when auth.uid() is null for testing.';

