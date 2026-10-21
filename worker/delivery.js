// Food delivery store status (GrabFood for now) — reported by the store checker (D:\USPIZZA\grabchecker-lambda, an AWS
// Lambda run every few minutes) that reads each outlet's public GrabFood store data and says whether the store is
// open, paused or closed.
//
//   GET  /api/delivery/targets?platform=grab  -> the stores to check: [{ outlet_id, code, name, country, store_id, open_now }]
//   POST /api/delivery/report                 <- { platform, results: [{ outlet_id, state, ok, detail }], checker: { status, note } }
//
// Auth: "Authorization: Bearer <DELIVERY_CHECKER_SECRET>" (Worker secret; the same value in the checker's .env).
// A result becomes the 'delivery' / '<platform>' station of that outlet (the GrabFood row on the dashboard):
//   ok 1 = open (or closed because Grab's own hours say so) · ok 0 = paused / closed during its Grab hours.
// The monitor (core.js) raises and clears the alert like any other station.

import { isOutletOpen, sha256Hex } from './core.js';

const PLATFORMS = { grab: { column: 'grabfood_store_id', station: 'grab' } };
const STATES = new Set(['open', 'paused', 'closed', 'closed_by_schedule']);

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function authorised(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !env.DELIVERY_CHECKER_SECRET) return false;
  // compare hashes, not the strings (constant length)
  return (await sha256Hex(token)) === (await sha256Hex(env.DELIVERY_CHECKER_SECRET));
}

export async function handleDelivery(request, env, pathname) {
  if (!(await authorised(request, env))) return json({ error: 'unauthorised' }, 401);
  if (pathname === '/api/delivery/targets' && request.method === 'GET') return targets(request, env);
  if (pathname === '/api/delivery/report' && request.method === 'POST') return report(request, env);
  return json({ error: 'not found' }, 404);
}

async function targets(request, env) {
  const platform = new URL(request.url).searchParams.get('platform') || 'grab';
  const p = PLATFORMS[platform];
  if (!p) return json({ error: 'unknown platform' }, 400);
  // Store IDs live in Supabase (public.outlets); opening hours come from the D1 mirror
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/outlets?select=outlet_id,code,name,country,${p.column}&${p.column}=not.is.null&monitored=is.true&order=code`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  if (!res.ok) return json({ error: `could not load outlets (${res.status})` }, 502);
  const outlets = await res.json();
  const mirror = Object.fromEntries((await env.DB.prepare('SELECT * FROM outlets').all()).results.map((o) => [o.outlet_id, o]));
  const watched = new Set(
    (await env.DB.prepare('SELECT outlet_id FROM stations WHERE channel = ? AND station = ?').bind('delivery', p.station).all())
      .results.map((r) => r.outlet_id)
  );
  const now = Date.now();
  return json({
    platform,
    targets: outlets
      .filter((o) => watched.has(o.outlet_id))
      .map((o) => ({
        outlet_id: o.outlet_id,
        code: o.code,
        name: o.name,
        country: o.country || 'MY',
        store_id: o[p.column],
        open_now: mirror[o.outlet_id] ? isOutletOpen(mirror[o.outlet_id], now) : true,
      })),
  });
}

async function report(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'body must be JSON' }, 400);
  }
  const p = PLATFORMS[body?.platform];
  if (!p) return json({ error: 'unknown platform' }, 400);
  const results = Array.isArray(body.results) ? body.results.slice(0, 200) : [];
  const now = Date.now();
  const db = env.DB;

  const known = new Set(
    (await db.prepare('SELECT outlet_id FROM stations WHERE channel = ? AND station = ?').bind('delivery', p.station).all())
      .results.map((r) => r.outlet_id)
  );
  const stmts = [];
  const ignored = [];
  for (const r of results) {
    if (!known.has(r?.outlet_id) || !STATES.has(r.state)) {
      ignored.push(r?.outlet_id || '?');
      continue;
    }
    const ok = r.state === 'open' || r.state === 'closed_by_schedule' ? 1 : 0;
    const detail = JSON.stringify({ via: 'store_checker', platform: body.platform, state: r.state, ...(r.detail || {}) }).slice(0, 2000);
    stmts.push(
      db.prepare(
        `INSERT INTO station_state (outlet_id, channel, station, reported_ok, last_seen_at, last_ok_at, status, detail, updated_at)
         VALUES (?1, 'delivery', ?2, ?3, ?4, CASE WHEN ?3 = 1 THEN ?4 END, 'unknown', ?5, ?4)
         ON CONFLICT (outlet_id, channel, station) DO UPDATE SET
           reported_ok  = ?3,
           last_seen_at = ?4,
           last_ok_at   = CASE WHEN ?3 = 1 THEN ?4 ELSE station_state.last_ok_at END,
           detail       = ?5,
           updated_at   = ?4`
      ).bind(r.outlet_id, p.station, ok, now, detail)
    );
  }
  // The checker itself: last report time + whether it is running or blocked (shown on the dashboard)
  const checker = { status: String(body.checker?.status || 'running').slice(0, 20), note: String(body.checker?.note || '').slice(0, 200), at: now };
  stmts.push(
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .bind(`checker_${body.platform}`, JSON.stringify(checker))
  );
  await db.batch(stmts);
  return json({ ok: true, accepted: stmts.length - 1, ignored });
}
