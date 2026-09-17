-- Run this if you already ran an earlier version of auth-setup.sql that
-- created `profiles` with role check constraint allowing 'hod' instead of
-- 'operations_team'. This updates the constraint to the current role names
-- without needing to drop/recreate the table (which would lose data).

alter table profiles drop constraint if exists profiles_role_check;

alter table profiles
  add constraint profiles_role_check
  check (role in ('operations_team', 'area_manager', 'outlet_manager'));

-- If you already inserted a row using the old 'hod' value, update it:
-- update profiles set role = 'operations_team' where role = 'hod';
