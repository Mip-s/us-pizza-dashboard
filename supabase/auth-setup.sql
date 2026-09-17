-- =====================================================================
-- US Pizza Dashboard: Role-based authentication setup
-- Roles: operations_team (sees everything), area_manager (multiple outlets),
--        outlet_manager (exactly one outlet)
-- Run this in the Supabase SQL editor.
--
-- Note: outlet_alert_status is a VIEW built on top of the base tables
-- `outlets`, `outlet_alert_messages`, and `outlet_status`. Views cannot have
-- RLS policies of their own — RLS must be applied to the base tables, and
-- the view must be marked security_invoker so it enforces the *querying*
-- user's RLS instead of the view owner's.
-- =====================================================================

-- 1. Profile table: one row per authenticated user, holding their role.
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null check (role in ('operations_team', 'area_manager', 'outlet_manager')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Users can read their own profile (needed so the app can look up its own role).
create policy "Users can read own profile"
  on profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 2. Manager <-> outlet assignments (junction table).
--    outlet_manager: exactly one row.
--    area_manager: one row per outlet they oversee.
--    operations_team: no rows needed here (their role alone grants full access).
create table if not exists manager_outlets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outlet_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, outlet_id)
);

alter table manager_outlets enable row level security;

create policy "Users can read own outlet assignments"
  on manager_outlets
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 3. Helper function: does the current user have Operations Team access (sees everything)?
create or replace function is_operations_team()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where user_id = auth.uid() and role = 'operations_team'
  );
$$;

-- 4. Helper function: is the current user assigned to this outlet
--    (as outlet_manager or area_manager)?
create or replace function has_outlet_access(target_outlet_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from manager_outlets
    where user_id = auth.uid() and outlet_id = target_outlet_id
  );
$$;

-- 5. Lock down the BASE TABLES that back outlet_alert_status
--    (outlets, outlet_alert_messages) and outlet_status directly.

-- outlets (outlet_id is the primary key column here, named "outlet_id")
alter table outlets enable row level security;
drop policy if exists "Allow public read access" on outlets;
drop policy if exists "Scoped read access" on outlets;
create policy "Scoped read access"
  on outlets
  for select
  to authenticated
  using (is_operations_team() or has_outlet_access(outlet_id));

-- outlet_alert_messages
alter table outlet_alert_messages enable row level security;
drop policy if exists "Allow public read access" on outlet_alert_messages;
drop policy if exists "Scoped read access" on outlet_alert_messages;
create policy "Scoped read access"
  on outlet_alert_messages
  for select
  to authenticated
  using (is_operations_team() or has_outlet_access(outlet_id));

-- outlet_status
alter table outlet_status enable row level security;
drop policy if exists "Allow public read access" on outlet_status;
drop policy if exists "Scoped read access" on outlet_status;
create policy "Scoped read access"
  on outlet_status
  for select
  to authenticated
  using (is_operations_team() or has_outlet_access(outlet_id));

-- 6. Make the view enforce the querying user's RLS (not the view owner's).
alter view outlet_alert_status set (security_invoker = true);

-- =====================================================================
-- How to create a user (do this per admin/manager you want to onboard):
--
-- 1. Supabase Dashboard -> Authentication -> Users -> Add user
--    (set email + password, or use "Invite").
-- 2. Copy the new user's UUID.
-- 3. Insert their profile:
--
--    insert into profiles (user_id, full_name, role)
--    values ('<user-uuid>', 'Jane Doe', 'operations_team');
--    -- role: 'operations_team' | 'area_manager' | 'outlet_manager'
--
-- 4. If role is 'area_manager' or 'outlet_manager', assign their outlet(s):
--
--    insert into manager_outlets (user_id, outlet_id)
--    values
--      ('<user-uuid>', '<outlet-uuid-1>'),
--      ('<user-uuid>', '<outlet-uuid-2>'); -- add more rows for area managers
-- =====================================================================
