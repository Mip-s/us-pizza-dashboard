// Web Push for outlet alerts (replaces the Supabase Edge Function "send-outlet-alert-push").
// Recipients: every operations_team user + outlet manager(s) of the outlet + its area manager.
// Subscriptions are stored in Supabase (public.push_subscriptions) by the dashboard.

import { buildPushPayload } from '@block65/webcrypto-web-push';
import { pickLang } from './push-i18n.js';

async function sb(env, path, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${await res.text()}`);
  return init.method === 'DELETE' ? null : res.json();
}

async function recipientUserIds(env, outletId) {
  const [ops, outletMgrs, outletRow] = await Promise.all([
    sb(env, 'profiles?select=user_id&role=eq.operations_team'),
    sb(env, `outlet_managers?select=user_id&outlet_id=eq.${outletId}`),
    sb(env, `outlets?select=area_manager_id&outlet_id=eq.${outletId}`),
  ]);
  const ids = new Set([...ops, ...outletMgrs].map((r) => r.user_id));
  const areaManagerId = outletRow[0]?.area_manager_id;
  if (areaManagerId) {
    const am = await sb(env, `area_managers?select=user_id&id=eq.${areaManagerId}`);
    am.forEach((r) => ids.add(r.user_id));
  }
  return [...ids];
}

// One request for all rows; never fails the alert.
async function saveNotifications(env, rows) {
  if (!rows.length) return;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) console.error('notification centre: saving failed:', res.status, (await res.text()).slice(0, 200));
  } catch (err) {
    console.error('notification centre: saving failed:', err.message);
  }
}

// Returns number of notifications delivered.
// texts = { en: { title, body }, ms: …, zh: …, my: … } from core.js; each person gets their hub language.
export async function sendAlertPush(env, { outlet, overall, message, title, texts }) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return 0;
  const userIds = await recipientUserIds(env, outlet.outlet_id);
  if (userIds.length === 0) return 0;

  const [subs, profiles] = await Promise.all([
    sb(env, `push_subscriptions?select=user_id,endpoint,p256dh,auth&user_id=in.(${userIds.join(',')})`),
    sb(env, `profiles?select=user_id,preferred_language&user_id=in.(${userIds.join(',')})`),
  ]);
  const langOf = new Map(profiles.map((p) => [p.user_id, pickLang(p.preferred_language)]));
  const vapid = {
    subject: env.VAPID_SUBJECT || 'mailto:admin@uspizza.com',
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const dataFor = (lang) => {
    const txt = texts?.[lang] || texts?.en || {};
    return JSON.stringify({
      title: txt.title || title || `${outlet.name}: ${String(overall).replace('_', ' ')}`, // e.g. "🚨 POS DOWN · US Pizza Kota Damansara"
      body: txt.body || message,
      tag: `outlet-${outlet.outlet_id}`,
      // 12/10: opens the uptime page searched to this outlet (hub: /uptime; old URL: /uptime is stripped to /)
      url: `/uptime?q=${encodeURIComponent(outlet.code || '')}`,
    });
  };

  let sent = 0;
  const stale = [];
  const reached = new Map(); // user -> devices reached
  await Promise.all(
    subs.map(async (s) => {
      try {
        const payload = await buildPushPayload(
          { data: dataFor(langOf.get(s.user_id) || 'en'), options: { ttl: 3600, urgency: overall === 'HEALTHY' ? 'normal' : 'high' } },
          { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } },
          vapid
        );
        const res = await fetch(s.endpoint, payload);
        if (res.ok) {
          sent += 1;
          reached.set(s.user_id, (reached.get(s.user_id) || 0) + 1);
        } else {
          const body = await res.text();
          // 404/410 = subscription expired / revoked.
          // VapidPkHashMismatch (400/403) = subscription was made with a different VAPID
          // public key (e.g. after rotating keys) — it can never succeed, so drop it;
          // the user re-subscribes by clicking "Enable alerts" again.
          if (res.status === 404 || res.status === 410 || /VapidPkHashMismatch|mismatch/i.test(body)) {
            stale.push(s.endpoint);
            console.warn('removing stale push subscription:', res.status, body.slice(0, 120));
          } else {
            console.error('push rejected', res.status, body);
          }
        }
      } catch (err) {
        console.error('push error', err.message);
      }
    })
  );

  // 15/10: notification centre (hub /notifications): one row per person, also people with alerts off (delivered false)
  await saveNotifications(env, userIds.filter(Boolean).map((uid) => {
    const d = JSON.parse(dataFor(langOf.get(uid) || 'en'));
    return { user_id: uid, module: 'uptime', category: String(overall || '').toLowerCase() || 'alert', title: d.title, body: d.body || null, url: d.url, outlet_id: outlet.outlet_id || null, delivered: (reached.get(uid) || 0) > 0 };
  }));

  // Clean up subscriptions the browser has revoked
  for (const endpoint of stale) {
    await sb(env, `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' });
  }
  return sent;
}
