// US Pizza Operations — single Cloudflare Worker
//
//   fetch      /api/heartbeat  ← Telegraf on each POS
//              /api/status     ← the React dashboard (every 15 s)
//              everything else → the React app (static assets from ./build)
//   scheduled  every minute    → metadata sync + monitoring pass + Web Push
//
// Config: wrangler.jsonc (bindings, cron, vars). Secrets: SUPABASE_SERVICE_ROLE_KEY, VAPID_PRIVATE_KEY.

import { runMonitor } from './core.js';
import { handleHeartbeat } from './heartbeat.js';
import { handleStatus } from './status.js';
import { sendAlertPush } from './push.js';
import { syncMetadata } from './sync.js';

async function tick(env) {
  const now = Date.now();
  try {
    await syncMetadata(env, now);
  } catch (err) {
    // Keep monitoring with the last good mirror if Supabase is unreachable.
    console.error('metadata sync failed:', err.message);
  }

  const alerts = await runMonitor(env.DB, now);
  for (const a of alerts) {
    try {
      const sent = await sendAlertPush(env, a);
      await env.DB.prepare('UPDATE alerts SET push_sent = ? WHERE id = ?').bind(sent, a.id).run();
    } catch (err) {
      console.error(`push failed for alert ${a.id}:`, err.message);
    }
  }
  if (alerts.length) {
    console.log(`monitor: ${alerts.length} alert(s)`, alerts.map((a) => `${a.outlet.code} ${a.overall}`).join(', '));
  }
}

export default {
  async fetch(request, env, ctx) {
    // The app is built under /uptime and the Operations hub forwards /uptime/* here.
    // Strip the prefix so /uptime/api/status -> /api/status, /uptime/static/.. -> /static/..
    // (/api/heartbeat without prefix keeps working for Telegraf / Automate.)
    const url = new URL(request.url);
    if (url.pathname === '/uptime' || url.pathname.startsWith('/uptime/')) {
      url.pathname = url.pathname.slice('/uptime'.length) || '/';
      request = new Request(url, request);
    }
    const { pathname } = url;
    try {
      if (pathname === '/api/heartbeat') return await handleHeartbeat(request, env);
      if (pathname === '/api/status') return await handleStatus(request, env);
    } catch (err) {
      console.error(`${pathname} failed:`, err.stack || err.message);
      return new Response(JSON.stringify({ error: 'internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(tick(env));
  },
};
