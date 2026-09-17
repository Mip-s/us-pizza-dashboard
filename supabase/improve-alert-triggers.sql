-- =====================================================================
-- Improve outlet alert freshness, CONFIRMED-ONLY visibility, AND severity
-- based on whole-channel outage (not idle-duration severity):
--
-- DECISION 1: The dashboard should only ever show/notify "confirmed" (down,
-- red) or "healthy" (green). 'suspected' is purely an internal 5-minute
-- grace period before a channel is confirmed down and must never surface
-- in status buckets, alert messages, or push notifications.
--
-- DECISION 2 (severity rule): outlet-level severity is now based on
-- whether a whole CHANNEL (POS/KDS/SOK/ODS) is entirely down, not on
-- individual station idle-duration severity buckets:
--   - CRITICAL_DOWN if POS is 100% confirmed-down (no working POS
--     terminal at all -- the outlet literally cannot take any orders),
--     OR if 2+ channels are each 100% confirmed-down at the same time.
--   - DEGRADED if any channel (POS/KDS/SOK/ODS) is 100% confirmed-down
--     but that's the only one (and it isn't POS), OR any channel has a
--     partial confirmed outage (some stations down, some still fine).
--   - HEALTHY otherwise.
--
-- PROBLEM: The old `outlet_alert_trigger` (AFTER UPDATE ON outlets) only
-- recomposes the alert message when `overall_status` changes to a
-- DIFFERENT bucket (CRITICAL_DOWN / DEGRADED / HEALTHY). If a second
-- channel goes down while already CRITICAL_DOWN, or one channel recovers
-- but the outlet is still DEGRADED, the alert message text (with its
-- counts) goes stale because the bucket itself didn't change.
--
-- FIX: Recalculate directly off `outlet_status` (the real source of
-- truth, updated every minute by run_condition_check()) every time a
-- channel/station enters or leaves the 'confirmed' state, and insert a
-- fresh alert whenever the *composed message content* changes -- not
-- just when the status bucket changes. 'suspected' transitions are
-- ignored entirely, so nothing is shown/notified until confirmed.
-- =====================================================================

-- 0. Outlet-level status based on whole-channel outage. Per channel
--    (pos/kds/kiosk/online), count total stations vs confirmed-down
--    stations. A channel is "fully down" when confirmed = total (and
--    total > 0). 'suspected' rows are intentionally never counted.
CREATE OR REPLACE FUNCTION evaluate_outlet_overall_status(p_outlet_id UUID)
RETURNS TEXT AS $$
DECLARE
    rec RECORD;
    v_pos_total INT := 0;
    v_pos_confirmed INT := 0;
    v_fully_down_channels INT := 0;
    v_any_confirmed BOOLEAN := false;
BEGIN
    FOR rec IN
        SELECT
            channel,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed
        FROM outlet_status
        WHERE outlet_id = p_outlet_id
        GROUP BY channel
    LOOP
        IF rec.confirmed > 0 THEN
            v_any_confirmed := true;
        END IF;

        IF rec.channel = 'pos' THEN
            v_pos_total := rec.total;
            v_pos_confirmed := rec.confirmed;
        END IF;

        IF rec.total > 0 AND rec.confirmed = rec.total THEN
            v_fully_down_channels := v_fully_down_channels + 1;
        END IF;
    END LOOP;

    -- Rule (a): POS entirely down -- the outlet can't take any orders.
    IF v_pos_total > 0 AND v_pos_confirmed = v_pos_total THEN
        RETURN 'CRITICAL_DOWN';
    END IF;

    -- Rule (b): two or more channels entirely down at the same time.
    IF v_fully_down_channels >= 2 THEN
        RETURN 'CRITICAL_DOWN';
    END IF;

    -- Any other confirmed downtime (one non-POS channel fully down, or
    -- any channel partially down) is DEGRADED, not CRITICAL_DOWN.
    IF v_any_confirmed THEN
        RETURN 'DEGRADED';
    END IF;

    RETURN 'HEALTHY';
END;
$$ LANGUAGE plpgsql;

-- 0b. Compose the outlet-level alert message. Describes which channels
--     are fully down vs partially down, in plain terms, with no mention
--     of 'suspected'/investigating channels.
CREATE OR REPLACE FUNCTION compose_outlet_alert(
    p_outlet_id UUID,
    p_overall_status TEXT
)
RETURNS TEXT AS $$
DECLARE
    v_outlet_name TEXT;
    v_fully_down TEXT[] := '{}';
    v_partially_down TEXT[] := '{}';
    v_pos_fully_down BOOLEAN := false;
    v_channel_label TEXT;
    v_message TEXT;
    rec RECORD;
BEGIN
    SELECT name INTO v_outlet_name FROM outlets WHERE outlet_id = p_outlet_id;
    v_outlet_name := COALESCE(v_outlet_name, 'Unknown Outlet');

    FOR rec IN
        SELECT
            channel,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed
        FROM outlet_status
        WHERE outlet_id = p_outlet_id
        GROUP BY channel
    LOOP
        CONTINUE WHEN rec.confirmed = 0;

        v_channel_label := CASE rec.channel
            WHEN 'pos' THEN 'POS'
            WHEN 'kds' THEN 'KDS'
            WHEN 'kiosk' THEN 'SOK'
            WHEN 'online' THEN 'ODS'
            ELSE upper(rec.channel)
        END;

        IF rec.confirmed = rec.total THEN
            v_fully_down := array_append(v_fully_down, FORMAT('%s (%s/%s)', v_channel_label, rec.confirmed, rec.total));
            IF rec.channel = 'pos' THEN
                v_pos_fully_down := true;
            END IF;
        ELSE
            v_partially_down := array_append(v_partially_down, FORMAT('%s (%s/%s)', v_channel_label, rec.confirmed, rec.total));
        END IF;
    END LOOP;

    v_message := CASE p_overall_status
        WHEN 'CRITICAL_DOWN' THEN
            CASE
                WHEN v_pos_fully_down THEN
                    FORMAT(
                        '🚨 CRITICAL OUTAGE: %s cannot take any orders -- POS is completely down (%s). Dispatch immediately to restore service.',
                        v_outlet_name,
                        array_to_string(v_fully_down, ', ')
                    )
                ELSE
                    FORMAT(
                        '🚨 CRITICAL OUTAGE: %s has multiple channels completely down: %s. Dispatch immediately to restore service.',
                        v_outlet_name,
                        array_to_string(v_fully_down, ', ')
                    )
            END

        WHEN 'DEGRADED' THEN
            FORMAT(
                '⚠️ DEGRADED SERVICE: %s is operating at reduced capacity.%s%s',
                v_outlet_name,
                CASE WHEN array_length(v_fully_down, 1) > 0
                    THEN FORMAT(' Fully down: %s.', array_to_string(v_fully_down, ', '))
                    ELSE ''
                END,
                CASE WHEN array_length(v_partially_down, 1) > 0
                    THEN FORMAT(' Partially down: %s.', array_to_string(v_partially_down, ', '))
                    ELSE ''
                END
            )

        WHEN 'HEALTHY' THEN
            FORMAT(
                '✅ RESOLVED: %s has recovered to normal operations. All channels online.',
                v_outlet_name
            )

        ELSE
            FORMAT('INFO: %s status is %s', v_outlet_name, COALESCE(p_overall_status, 'unknown'))
    END;

    RETURN v_message;
END;
$$ LANGUAGE plpgsql;

-- 1. Single function that recalculates status + refreshes the alert
--    message whenever anything meaningful changed.
CREATE OR REPLACE FUNCTION recalc_and_alert_outlet(p_outlet_id UUID)
RETURNS void AS $$
DECLARE
    v_new_status TEXT;
    v_message TEXT;
    v_last_message TEXT;
BEGIN
    v_new_status := evaluate_outlet_overall_status(p_outlet_id);

    -- Keep outlets.overall_status fresh (also updates any listeners on `outlets`).
    UPDATE outlets
    SET overall_status = v_new_status
    WHERE outlet_id = p_outlet_id;

    v_message := compose_outlet_alert(p_outlet_id, v_new_status);

    SELECT alert_message INTO v_last_message
    FROM outlet_alert_messages
    WHERE outlet_id = p_outlet_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Insert a fresh alert row whenever the composed message actually
    -- differs from the last one -- covers both bucket changes AND
    -- count-only changes within the same bucket.
    IF v_last_message IS DISTINCT FROM v_message THEN
        INSERT INTO outlet_alert_messages (outlet_id, overall_status, alert_message)
        VALUES (p_outlet_id, v_new_status, v_message);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger directly off outlet_status, but ONLY react when a row enters
--    or leaves the 'confirmed' state. Transitions in/out of 'suspected'
--    are intentionally ignored so nothing is shown/notified until
--    a channel is actually confirmed down (or recovers from confirmed).
CREATE OR REPLACE FUNCTION trg_fn_outlet_status_recalc()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.status = 'confirmed')
       OR (TG_OP = 'UPDATE' AND (OLD.status = 'confirmed') IS DISTINCT FROM (NEW.status = 'confirmed')) THEN
        PERFORM recalc_and_alert_outlet(NEW.outlet_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_outlet_status_recalc ON outlet_status;
CREATE TRIGGER trg_outlet_status_recalc
AFTER INSERT OR UPDATE ON outlet_status
FOR EACH ROW
EXECUTE FUNCTION trg_fn_outlet_status_recalc();

-- 3. Keep a safety-net trigger on downtime_log too (e.g. if ended_at is
--    ever updated directly without an outlet_status write in between).
--    recalc_and_alert_outlet() is idempotent -- it only inserts a new
--    alert row if the composed message actually changed, so double
--    firing from both triggers is harmless.
CREATE OR REPLACE FUNCTION trg_fn_downtime_log_recalc()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM recalc_and_alert_outlet(NEW.outlet_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_outlet_status ON downtime_log;
CREATE TRIGGER trg_update_outlet_status
AFTER INSERT OR UPDATE ON downtime_log
FOR EACH ROW
EXECUTE FUNCTION trg_fn_downtime_log_recalc();

-- 4. Remove the old outlets-level trigger -- it's superseded by
--    recalc_and_alert_outlet(), which now handles both the status update
--    AND the alert composition/insert in one consistent place.
DROP TRIGGER IF EXISTS outlet_alert_trigger ON outlets;

-- =====================================================================
-- Verify: force a recalculation for every outlet right now, and check
-- the latest alert per outlet.
-- =====================================================================
-- SELECT recalc_and_alert_outlet(outlet_id) FROM outlets;
-- SELECT * FROM outlet_alert_status;
