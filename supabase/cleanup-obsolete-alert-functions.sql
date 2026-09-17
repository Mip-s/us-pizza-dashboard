-- =====================================================================
-- Cleanup: remove objects made obsolete by supabase/improve-alert-triggers.sql
--
-- Run this AFTER `improve-alert-triggers.sql` has been applied
-- successfully (its new triggers/functions are already active), to drop
-- the now-unused originals it superseded. Safe to run multiple times.
-- =====================================================================

-- 1. `on_outlet_status_change()` + `outlet_alert_trigger` (on `outlets`)
--    are superseded by `recalc_and_alert_outlet()` fired from
--    `trg_outlet_status_recalc` (on `outlet_status`) and
--    `trg_update_outlet_status` (on `downtime_log`). The trigger itself
--    is already dropped by improve-alert-triggers.sql; this also drops
--    the now-orphaned function.
DROP TRIGGER IF EXISTS outlet_alert_trigger ON outlets;
DROP FUNCTION IF EXISTS on_outlet_status_change();

-- 2. `update_outlet_status_on_downtime()` was the original trigger
--    function bound to `trg_update_outlet_status` on `downtime_log`.
--    improve-alert-triggers.sql replaced that trigger to point at
--    `trg_fn_downtime_log_recalc()` instead, leaving this one orphaned.
DROP FUNCTION IF EXISTS update_outlet_status_on_downtime();

-- =====================================================================
-- Verify nothing references the dropped functions anymore (should return
-- zero rows for both):
-- =====================================================================
-- SELECT tgname, tgrelid::regclass, tgfoid::regproc
-- FROM pg_trigger
-- WHERE tgfoid::regproc::text IN ('on_outlet_status_change', 'update_outlet_status_on_downtime');
