// Supabase Edge Function: send-outlet-alert-push
//
// Triggered by the `trg_notify_outlet_alert_push` DB trigger whenever a new
// row is inserted into `outlet_alert_messages`. Looks up which users should
// be notified (operations_team = everyone, area/outlet managers = only if
// they're assigned to this outlet), then sends a Web Push notification to
// every device/browser subscription those users registered.
//
// Deploy with:
//   supabase functions deploy send-outlet-alert-push
//
// Required secrets (set with `supabase secrets set KEY=value`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
//   are already auto-injected into every Edge Function by Supabase).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  try {
    const { outlet_id, overall_status, alert_message } = await req.json();

    // Look up the outlet name for a friendlier notification title.
    const { data: outlet } = await supabase
      .from('outlets')
      .select('name')
      .eq('outlet_id', outlet_id)
      .maybeSingle();

    const outletName = outlet?.name?.trim() || 'An outlet';

    // 1. Every operations_team user gets notified, regardless of outlet.
    const { data: opsUsers } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('role', 'operations_team');

    // 2. Area/outlet managers only get notified if assigned to this outlet.
    const { data: assignedManagers } = await supabase
      .from('manager_outlets')
      .select('user_id')
      .eq('outlet_id', outlet_id);

    const recipientIds = new Set([
      ...(opsUsers || []).map((u) => u.user_id),
      ...(assignedManagers || []).map((m) => m.user_id),
    ]);

    if (recipientIds.size === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no recipients' }), { status: 200 });
    }

    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', Array.from(recipientIds));

    const payload = JSON.stringify({
      title: `${outletName}: ${String(overall_status || '').replace('_', ' ')}`,
      body: alert_message || 'Outlet status updated.',
      tag: `outlet-${outlet_id}`,
      url: '/',
    });

    let sent = 0;
    const staleEndpoints = [];

    await Promise.all(
      (subscriptions || []).map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
          sent += 1;
        } catch (err) {
          // 404/410 means the subscription is no longer valid (user revoked
          // permission, cleared site data, etc.) -- clean it up.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            staleEndpoints.push(sub.endpoint);
          } else {
            console.error('Push send failed:', err);
          }
        }
      })
    );

    if (staleEndpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints);
    }

    return new Response(JSON.stringify({ sent, removed: staleEndpoints.length }), { status: 200 });
  } catch (err) {
    console.error('send-outlet-alert-push error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
