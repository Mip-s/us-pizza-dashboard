-- =====================================================================
-- Push notification subscriptions
--
-- Stores one row per browser/device a user has enabled notifications on.
-- The Edge Function (send-outlet-alert-push) reads from this table to
-- know who to push to and filters by role/outlet access, mirroring the
-- same visibility rules as the dashboard's RLS policies.
-- =====================================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

-- Users can manage (insert/select/delete) only their own subscriptions.
drop policy if exists "Users manage own push subscriptions" on push_subscriptions;
create policy "Users manage own push subscriptions"
  on push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =====================================================================
-- Trigger: whenever a new outlet_alert_messages row is inserted, call the
-- send-outlet-alert-push Edge Function so it can push-notify the right
-- users (operations_team = everyone, area/outlet managers = their outlets).
--
-- Requires: `pg_net` extension (enabled by default on Supabase) and the
-- Edge Function deployed as `send-outlet-alert-push`.
-- Before running this script: deploy the Edge Function, then replace
-- <SERVICE_ROLE_KEY> below with your project's service_role key
-- (Project Settings -> API -> service_role, keep it secret).
-- =====================================================================
create extension if not exists pg_net;

-- Store the service_role key securely in Supabase Vault instead of pasting
-- it in plaintext into this function. Replace <SERVICE_ROLE_KEY> below with
-- the real key from Project Settings -> API -> service_role.
-- This upserts the secret, so it's safe to re-run this script.
do $$
begin
  if exists (select 1 from vault.secrets where name = 'service_role_key') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'service_role_key'),
      '<SERVICE_ROLE_KEY>'
    );
  else
    perform vault.create_secret(
      '<SERVICE_ROLE_KEY>',
      'service_role_key',
      'Used by notify_outlet_alert_push() to call the push Edge Function'
    );
  end if;
end $$;

create or replace function notify_outlet_alert_push()
returns trigger as $$
declare
  v_service_key text;
begin
  select decrypted_secret into v_service_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  perform net.http_post(
    url := 'https://yqigynppqmhmsohwrdof.supabase.co/functions/v1/send-outlet-alert-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'outlet_id', NEW.outlet_id,
      'overall_status', NEW.overall_status,
      'alert_message', NEW.alert_message
    )
  );
  return NEW;
end;
$$ language plpgsql security definer set search_path = public, vault, extensions;

drop trigger if exists trg_notify_outlet_alert_push on outlet_alert_messages;
create trigger trg_notify_outlet_alert_push
after insert on outlet_alert_messages
for each row
execute function notify_outlet_alert_push();
