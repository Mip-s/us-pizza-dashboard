-- =====================================================================
-- Update RLS & Security Functions for Refactored Manager Schema
-- Reflects renaming of manager_outlets -> outlet_managers and
-- addition of area_managers table.
-- ============================================================

-- 1. Enable RLS on newly created area_managers & renamed outlet_managers
ALTER TABLE outlet_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_managers ENABLE ROW LEVEL SECURITY;

-- 2. Policies for outlet_managers and area_managers (users can read their own assignment)
DROP POLICY IF EXISTS "Users can read own outlet assignments" ON outlet_managers;
CREATE POLICY "Users can read own outlet assignments"
  ON outlet_managers
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own area assignments" ON area_managers;
CREATE POLICY "Users can read own area assignments"
  ON area_managers
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Update the access helper function `has_outlet_access(target_outlet_id)`
-- A user has access to an outlet if:
--   a) They are assigned as the outlet_manager (in outlet_managers by outlet_id OR via outlets.outlet_manager_id)
--   b) They are assigned as the area_manager (via outlets.area_manager_id OR matching region in area_managers)
CREATE OR REPLACE FUNCTION has_outlet_access(target_outlet_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    -- Direct outlet manager check
    SELECT 1 FROM outlet_managers
    WHERE user_id = auth.uid() AND outlet_id = target_outlet_id
    UNION ALL
    -- Direct area manager FK on outlets check
    SELECT 1 FROM area_managers am
    JOIN outlets o ON o.area_manager_id = am.id
    WHERE am.user_id = auth.uid() AND o.outlet_id = target_outlet_id
    UNION ALL
    -- Region-based area manager match check
    SELECT 1 FROM area_managers am
    JOIN outlets o ON o.region = am.region
    WHERE am.user_id = auth.uid() AND o.outlet_id = target_outlet_id
  );
$$;

-- 4. Re-apply scoped read access policies across all base tables
DROP POLICY IF EXISTS "Scoped read access" ON outlets;
CREATE POLICY "Scoped read access"
  ON outlets
  FOR SELECT
  TO authenticated
  USING (is_operations_team() OR has_outlet_access(outlet_id));

DROP POLICY IF EXISTS "Scoped read access" ON outlet_alert_messages;
CREATE POLICY "Scoped read access"
  ON outlet_alert_messages
  FOR SELECT
  TO authenticated
  USING (is_operations_team() OR has_outlet_access(outlet_id));

DROP POLICY IF EXISTS "Scoped read access" ON outlet_status;
CREATE POLICY "Scoped read access"
  ON outlet_status
  FOR SELECT
  TO authenticated
  USING (is_operations_team() OR has_outlet_access(outlet_id));

-- 5. Ensure the dashboard view enforces the querying user's RLS
ALTER VIEW outlet_alert_status SET (security_invoker = true);
