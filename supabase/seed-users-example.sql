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
-- 2) Area Manager — oversees multiple outlets (example: Kepong + Sri Petaling).
--    Replace '00000000-0000-0000-0000-000000000002' with the real auth user UUID.
-- ---------------------------------------------------------------------
insert into profiles (user_id, full_name, role)
values ('00000000-0000-0000-0000-000000000002', 'Farid Hassan', 'area_manager');

insert into manager_outlets (user_id, outlet_id)
values
  ('00000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444'), -- US Pizza Kepong
  ('00000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333'); -- US Pizza Sri Petaling

-- ---------------------------------------------------------------------
-- 3) Outlet Manager — exactly one outlet (example: US Pizza Ampang).
--    Replace '00000000-0000-0000-0000-000000000003' with the real auth user UUID.
-- ---------------------------------------------------------------------
insert into profiles (user_id, full_name, role)
values ('00000000-0000-0000-0000-000000000003', 'Nurul Aina', 'outlet_manager');

insert into manager_outlets (user_id, outlet_id)
values ('00000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111'); -- US Pizza Ampang

-- =====================================================================
-- Quick verification queries:
--
--   select * from profiles;
--   select p.full_name, p.role, mo.outlet_id
--   from profiles p
--   left join manager_outlets mo on mo.user_id = p.user_id
--   order by p.role;
-- =====================================================================
