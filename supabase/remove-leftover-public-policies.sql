-- =====================================================================
-- Fix: remove leftover permissive "anon read" policies that were still
-- targeting the `public` role (which includes authenticated users too).
-- These were OR'd with our scoped policies, silently granting every
-- logged-in user full read access regardless of role/outlet.
-- =====================================================================

drop policy if exists "Allow anon read outlets" on outlets;
drop policy if exists "Allow anon read outlet_status" on outlet_status;
drop policy if exists "Allow anon read alerts" on outlet_alert_messages;
drop policy if exists "Allow insert alerts" on outlet_alert_messages;

-- Verify only the scoped policies remain:
select schemaname, tablename, policyname, roles, cmd, qual
from pg_policies
where tablename in ('outlets', 'outlet_alert_messages', 'outlet_status');
