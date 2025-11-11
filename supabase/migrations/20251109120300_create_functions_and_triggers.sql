-- ==============================================================================
-- Migration: Create Functions and Triggers
-- Description: Business logic functions, audit triggers, and metric maintenance
-- Functions: bankers_round, add_goal_event
-- Triggers: audit logging, monthly metrics updates, updated_at timestamps
-- Author: FinFlow Database Schema
-- Created: 2025-11-09
-- ==============================================================================

-- ==============================================================================
-- 1. UTILITY FUNCTIONS
-- ==============================================================================

-- bankers_round: Banker's rounding (round half to even) for currency display
-- Used when converting groszy to PLN for UI display
-- Example: bankers_round(123.5) = 124, bankers_round(124.5) = 124
create or replace function bankers_round(val numeric)
returns numeric
language sql
immutable
parallel safe
as $$
  select case
    when val - floor(val) = 0.5 and floor(val)::bigint % 2 = 0 then floor(val)
    when val - floor(val) = 0.5 then ceil(val)
    else round(val)
  end;
$$;

comment on function bankers_round(numeric) is 'Banker''s rounding (round half to even) for fair currency rounding in UI';

-- ==============================================================================
-- 2. UPDATED_AT TRIGGER FUNCTION
-- ==============================================================================

-- Generic trigger function to update updated_at timestamp
-- Applies to: goals, transactions, profiles, etc.
create or replace function trigger_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function trigger_set_updated_at() is 'Generic trigger function to automatically set updated_at on row updates';

-- ==============================================================================
-- 3. ADD_GOAL_EVENT FUNCTION
-- ==============================================================================

-- add_goal_event: Secure function to add goal events and update goal balance
-- SECURITY DEFINER ensures atomic balance updates within transaction
-- Validates ownership, checks goal is not archived, enforces balance constraints
-- Provides idempotency through client_request_id
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
begin
  -- Get current user ID
  v_user_id := auth.uid();
  
  -- Validate user is authenticated
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  
  -- Validate user is verified
  if not exists (
    select 1 from profiles 
    where user_id = v_user_id and email_confirmed = true
  ) then
    raise exception 'Email verification required';
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
    client_request_id
  ) values (
    v_user_id,
    p_goal_id,
    p_type,
    p_amount_cents,
    p_occurred_on,
    p_client_request_id
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

comment on function add_goal_event is 'Securely add goal event and update balance atomically. Validates ownership, balance constraints, and provides idempotency.';

-- ==============================================================================
-- 4. AUDIT LOG TRIGGER FUNCTIONS
-- ==============================================================================

-- audit_log_create: Trigger function for CREATE operations
create or replace function audit_log_create()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (
    owner_user_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before,
    after
  ) values (
    new.user_id,
    coalesce(auth.uid(), new.user_id),
    tg_argv[0]::text, -- entity_type passed as trigger argument
    new.id,
    'CREATE',
    null,
    to_jsonb(new)
  );
  return new;
end;
$$;

-- audit_log_update: Trigger function for UPDATE operations
create or replace function audit_log_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (
    owner_user_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before,
    after
  ) values (
    new.user_id,
    coalesce(auth.uid(), new.user_id),
    tg_argv[0]::text,
    new.id,
    'UPDATE',
    to_jsonb(old),
    to_jsonb(new)
  );
  return new;
end;
$$;

-- audit_log_delete: Trigger function for DELETE operations (soft delete)
create or replace function audit_log_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (
    owner_user_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before,
    after
  ) values (
    old.user_id,
    coalesce(auth.uid(), old.user_id),
    tg_argv[0]::text,
    old.id,
    'DELETE',
    to_jsonb(old),
    null
  );
  return old;
end;
$$;

comment on function audit_log_create() is 'Audit trigger for CREATE operations';
comment on function audit_log_update() is 'Audit trigger for UPDATE operations';
comment on function audit_log_delete() is 'Audit trigger for DELETE operations';

-- ==============================================================================
-- 5. MONTHLY METRICS TRIGGER FUNCTIONS
-- ==============================================================================

-- update_monthly_metrics_transaction: Update metrics when transaction changes
create or replace function update_monthly_metrics_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_month date;
  v_new_month date;
  v_old_amount bigint;
  v_new_amount bigint;
begin
  -- Handle INSERT
  if tg_op = 'INSERT' then
    if new.deleted_at is null then
      -- Add to monthly metrics
      insert into monthly_metrics (user_id, month, income_cents, expenses_cents)
      values (
        new.user_id,
        new.month,
        case when new.type = 'INCOME' then new.amount_cents else 0 end,
        case when new.type = 'EXPENSE' then new.amount_cents else 0 end
      )
      on conflict (user_id, month) do update set
        income_cents = monthly_metrics.income_cents + 
          case when new.type = 'INCOME' then new.amount_cents else 0 end,
        expenses_cents = monthly_metrics.expenses_cents + 
          case when new.type = 'EXPENSE' then new.amount_cents else 0 end,
        refreshed_at = now();
      
      -- Recalculate free cash flow for the month
      update monthly_metrics
      set free_cash_flow_cents = income_cents - expenses_cents - net_saved_cents
      where user_id = new.user_id and month = new.month;
    end if;
    return new;
  end if;
  
  -- Handle UPDATE
  if tg_op = 'UPDATE' then
    -- Transaction un-deleted (deleted_at: not null -> null)
    if old.deleted_at is not null and new.deleted_at is null then
      update monthly_metrics
      set 
        income_cents = income_cents + case when new.type = 'INCOME' then new.amount_cents else 0 end,
        expenses_cents = expenses_cents + case when new.type = 'EXPENSE' then new.amount_cents else 0 end,
        refreshed_at = now()
      where user_id = new.user_id and month = new.month;
      
      update monthly_metrics
      set free_cash_flow_cents = income_cents - expenses_cents - net_saved_cents
      where user_id = new.user_id and month = new.month;
      
    -- Transaction soft-deleted (deleted_at: null -> not null)
    elsif old.deleted_at is null and new.deleted_at is not null then
      update monthly_metrics
      set 
        income_cents = income_cents - case when old.type = 'INCOME' then old.amount_cents else 0 end,
        expenses_cents = expenses_cents - case when old.type = 'EXPENSE' then old.amount_cents else 0 end,
        refreshed_at = now()
      where user_id = old.user_id and month = old.month;
      
      update monthly_metrics
      set free_cash_flow_cents = income_cents - expenses_cents - net_saved_cents
      where user_id = old.user_id and month = old.month;
      
    -- Transaction modified (not deleted)
    elsif old.deleted_at is null and new.deleted_at is null then
      -- If month or type or amount changed, adjust both old and new months
      if old.month != new.month or old.type != new.type or old.amount_cents != new.amount_cents then
        -- Subtract from old month
        update monthly_metrics
        set 
          income_cents = income_cents - case when old.type = 'INCOME' then old.amount_cents else 0 end,
          expenses_cents = expenses_cents - case when old.type = 'EXPENSE' then old.amount_cents else 0 end,
          refreshed_at = now()
        where user_id = old.user_id and month = old.month;
        
        update monthly_metrics
        set free_cash_flow_cents = income_cents - expenses_cents - net_saved_cents
        where user_id = old.user_id and month = old.month;
        
        -- Add to new month
        insert into monthly_metrics (user_id, month, income_cents, expenses_cents)
        values (
          new.user_id,
          new.month,
          case when new.type = 'INCOME' then new.amount_cents else 0 end,
          case when new.type = 'EXPENSE' then new.amount_cents else 0 end
        )
        on conflict (user_id, month) do update set
          income_cents = monthly_metrics.income_cents + 
            case when new.type = 'INCOME' then new.amount_cents else 0 end,
          expenses_cents = monthly_metrics.expenses_cents + 
            case when new.type = 'EXPENSE' then new.amount_cents else 0 end,
          refreshed_at = now();
        
        update monthly_metrics
        set free_cash_flow_cents = income_cents - expenses_cents - net_saved_cents
        where user_id = new.user_id and month = new.month;
      end if;
    end if;
    return new;
  end if;
  
  -- Handle DELETE (hard delete, should not happen in normal operations)
  if tg_op = 'DELETE' then
    if old.deleted_at is null then
      update monthly_metrics
      set 
        income_cents = income_cents - case when old.type = 'INCOME' then old.amount_cents else 0 end,
        expenses_cents = expenses_cents - case when old.type = 'EXPENSE' then old.amount_cents else 0 end,
        refreshed_at = now()
      where user_id = old.user_id and month = old.month;
      
      update monthly_metrics
      set free_cash_flow_cents = income_cents - expenses_cents - net_saved_cents
      where user_id = old.user_id and month = old.month;
    end if;
    return old;
  end if;
  
  return null;
end;
$$;

comment on function update_monthly_metrics_transaction() is 'Incrementally update monthly_metrics when transactions change';

-- update_monthly_metrics_goal_event: Update metrics when goal event added
create or replace function update_monthly_metrics_goal_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta bigint;
begin
  -- Goal events are immutable (INSERT only)
  if tg_op = 'INSERT' then
    -- Calculate delta: DEPOSIT is positive, WITHDRAW is negative
    v_delta := case 
      when new.type = 'DEPOSIT' then new.amount_cents
      when new.type = 'WITHDRAW' then -new.amount_cents
      else 0
    end;
    
    -- Update or insert monthly metrics
    insert into monthly_metrics (user_id, month, net_saved_cents)
    values (new.user_id, new.month, v_delta)
    on conflict (user_id, month) do update set
      net_saved_cents = monthly_metrics.net_saved_cents + v_delta,
      refreshed_at = now();
    
    -- Recalculate free cash flow
    update monthly_metrics
    set free_cash_flow_cents = income_cents - expenses_cents - net_saved_cents
    where user_id = new.user_id and month = new.month;
    
    return new;
  end if;
  
  return null;
end;
$$;

comment on function update_monthly_metrics_goal_event() is 'Incrementally update monthly_metrics when goal events are added';

-- ==============================================================================
-- 6. CREATE TRIGGERS ON TABLES
-- ==============================================================================

-- Triggers for updated_at timestamp
create trigger set_updated_at_profiles
  before update on profiles
  for each row
  execute function trigger_set_updated_at();

create trigger set_updated_at_goals
  before update on goals
  for each row
  execute function trigger_set_updated_at();

create trigger set_updated_at_transactions
  before update on transactions
  for each row
  execute function trigger_set_updated_at();

create trigger set_updated_at_transaction_categories
  before update on transaction_categories
  for each row
  execute function trigger_set_updated_at();

create trigger set_updated_at_goal_types
  before update on goal_types
  for each row
  execute function trigger_set_updated_at();

-- Audit triggers for transactions
create trigger audit_transactions_create
  after insert on transactions
  for each row
  execute function audit_log_create('transaction');

create trigger audit_transactions_update
  after update on transactions
  for each row
  when (old.* is distinct from new.*)
  execute function audit_log_update('transaction');

-- Audit triggers for goals
create trigger audit_goals_create
  after insert on goals
  for each row
  execute function audit_log_create('goal');

create trigger audit_goals_update
  after update on goals
  for each row
  when (old.* is distinct from new.*)
  execute function audit_log_update('goal');

-- Audit triggers for goal_events
create trigger audit_goal_events_create
  after insert on goal_events
  for each row
  execute function audit_log_create('goal_event');

-- Monthly metrics triggers for transactions
create trigger update_metrics_transactions
  after insert or update or delete on transactions
  for each row
  execute function update_monthly_metrics_transaction();

-- Monthly metrics triggers for goal_events
create trigger update_metrics_goal_events
  after insert on goal_events
  for each row
  execute function update_monthly_metrics_goal_event();

-- ==============================================================================
-- END OF MIGRATION
-- ==============================================================================

