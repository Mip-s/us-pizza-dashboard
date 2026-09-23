-- =====================================================================
-- Example seed data: one user per role, using your real outlet IDs.
--
-- IMPORTANT: This script only inserts into `profiles` and `manager_outlets`.
-- You must FIRST create each auth user (Supabase Dashboard -> Authentication
-- -> Users -> Add user, or Invite) and then replace the placeholder UUIDs
-- below with the real UUIDs Supabase generates for each user.
--
-- Outlet reference (from outlet_alert_status):
--   11111111-1111-1111-1111-111111111111  US Pizza Ampang
--   22222222-2222-2222-2222-222222222222  US Pizza Dang Wangi
--   33333333-3333-3333-3333-333333333333  US Pizza Sri Petaling
--   44444444-4444-4444-4444-444444444444  US Pizza Kepong
--   55555555-5555-5555-5555-555555555555  US Pizza SS15 Subang Jaya
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Operations Team member — sees every outlet, no manager_outlets rows needed.
--    Replace '00000000-0000-0000-0000-000000000001' with the real auth user UUID.
-- ---------------------------------------------------------------------
insert into profiles (user_id, full_name, role)
values ('00000000-0000-0000-0000-000000000001', 'Aisyah Rahman', 'operations_team');

-- ---------------------------------------------------------------------
-- 2) Area Manager — oversees multiple outlets (example: Kepong + Sri Petaling / North Zone).
--    Replace '00000000-0000-0000-0000-000000000002' with the real auth user UUID.
-- ---------------------------------------------------------------------
insert into profiles (user_id, full_name, role)
values ('00000000-0000-0000-0000-000000000002', 'Farid Hassan', 'area_manager');

-- Assign area manager using helper:
SELECT assign_area_manager(
  '00000000-0000-0000-0000-000000000002',
  'Central Region',
  '+60198765432',
  'farid@uspizza.com'
);

-- Link specific outlets to area manager:
UPDATE outlets
SET area_manager_id = (SELECT id FROM area_managers WHERE user_id = '00000000-0000-0000-0000-000000000002')
WHERE outlet_id IN (
  '44444444-4444-4444-4444-444444444444', -- US Pizza Kepong
  '33333333-3333-3333-3333-333333333333'  -- US Pizza Sri Petaling
);

-- ---------------------------------------------------------------------
-- 3) Outlet Manager — exactly one outlet (example: US Pizza Ampang).
--    Replace '00000000-0000-0000-0000-000000000003' with the real auth user UUID.
-- ---------------------------------------------------------------------
insert into profiles (user_id, full_name, role)
values ('00000000-0000-0000-0000-000000000003', 'Nurul Aina', 'outlet_manager');

-- Assign outlet manager using helper:
SELECT assign_outlet_manager(
  '11111111-1111-1111-1111-111111111111', -- US Pizza Ampang
  '00000000-0000-0000-0000-000000000003', -- user_id
  '+60122383479',
  'nurul@uspizza.com'
);

-- =====================================================================
-- Quick verification queries:
--
--   select * from profiles;
--   select * from outlet_managers;
--   select * from area_managers;
--   select * from outlet_with_managers;
-- =====================================================================
