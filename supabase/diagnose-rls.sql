-- =====================================================================
-- Diagnostic: run these one at a time in the Supabase SQL editor and
-- share the output. This will tell us exactly why an outlet_manager can
-- see other outlets.
-- =====================================================================

-- 1. Confirm RLS is actually enabled on the base tables.
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relname in ('outlets', 'outlet_alert_messages', 'outlet_status', 'profiles', 'outlet_managers', 'area_managers');

-- 2. List all policies currently active on these tables (look for any
--    leftover permissive policy, e.g. an old "Allow public read access"
--    that never got dropped, which would OR together with our scoped one).
select schemaname, tablename, policyname, roles, cmd, qual
from pg_policies
where tablename in ('outlets', 'outlet_alert_messages', 'outlet_status', 'outlet_managers', 'area_managers');

-- 3. Confirm the view is security_invoker (so it enforces the caller's RLS,
--    not the view owner's).
select relname, reloptions
from pg_class
where relname in ('outlet_alert_status', 'outlet_with_managers');

-- 4. Check the actual profiles + outlet_managers / area_managers rows for your test
--    manager account (replace with their real email).
select u.id as user_id, u.email, p.role
from auth.users u
join profiles p on p.user_id = u.id
where u.email = 'REPLACE_WITH_MANAGER_EMAIL';

select * from outlet_managers
where user_id = (select id from auth.users where email = 'REPLACE_WITH_MANAGER_EMAIL');

select * from area_managers
where user_id = (select id from auth.users where email = 'REPLACE_WITH_MANAGER_EMAIL');
