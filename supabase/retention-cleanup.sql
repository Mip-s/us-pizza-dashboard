-- =====================================================================
-- Data retention: automatically purge old, closed monitoring history
-- so downtime_log / outlet_alert_messages don't grow unbounded.
--
-- Tables cleaned (both are append-only history, safe to prune):
--   - downtime_log: only rows that are CLOSED (ended_at IS NOT NULL)
--     and ended more than 6 months ago. Rows with ended_at IS NULL are
--     an ongoing/unresolved outage and are NEVER deleted, no matter how
--     old started_at is.
--   - outlet_alert_messages: alert history older than 6 months.
--
-- NOT touched: outlets, outlet_status, profiles, push_subscriptions,
-- manager_outlets -- these are "current state" tables that stay small
-- and get upserted in place, not appended to.
-- =====================================================================

-- 1. Cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_monitoring_data()
RETURNS void AS $$
BEGIN
    DELETE FROM downtime_log
    WHERE ended_at IS NOT NULL
      AND ended_at < now() - interval '6 months';

    DELETE FROM outlet_alert_messages
    WHERE created_at < now() - interval '6 months';
END;
$$ LANGUAGE plpgsql;

-- 2. Schedule it with pg_cron (Supabase: Database -> Extensions -> enable
--    "pg_cron" first if this errors with "schema cron does not exist").
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any previous schedule with the same name so re-running this
-- script is safe/idempotent.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'cleanup-old-monitoring-data';

-- Runs every day at 03:00 UTC.
SELECT cron.schedule(
    'cleanup-old-monitoring-data',
    '0 3 * * *',
    $$SELECT cleanup_old_monitoring_data();$$
);

-- 3. Manual test run (optional) -- run this once yourself to confirm it
--    works and see how many rows it removes right now:
-- SELECT cleanup_old_monitoring_data();

-- 4. Check the schedule is registered:
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'cleanup-old-monitoring-data';

-- 5. Check run history / whether it's failing:
-- SELECT * FROM cron.job_run_details
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-old-monitoring-data')
-- ORDER BY start_time DESC LIMIT 5;
