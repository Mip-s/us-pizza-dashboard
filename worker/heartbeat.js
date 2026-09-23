// POST /api/heartbeat — receives Telegraf output from a POS terminal.
//
// Auth: "Authorization: Bearer <outlet heartbeat token>" (one token per outlet;
//       only its SHA-256 hash is stored, in Supabase and mirrored to D1).
// Body: Telegraf JSON (batch format) — see pos-agent/telegraf.conf.template.
// Effect: overwrites the latest state per station in D1 (no history kept).
//         Status transitions + alerts are done by the monitor Worker every minute.

import { parseTelegraf, sha256Hex } from './core.js';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export async function handleHeartbeat(request, env) {
  if (request.method !== 'POST') return json({ error: 'use POST' }, 405);
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json({ error: 'missing token' }, 401);

  const tokenRow = await env.DB.prepare('SELECT outlet_id FROM tokens WHERE token_hash = ?')
    .bind(await sha256Hex(token))
    .first();
  if (!tokenRow) return json({ error: 'invalid token' }, 401);
  const outletId = tokenRow.outlet_id;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'body must be JSON' }, 400);
  }

  const reports = parseTelegraf(body);
  if (reports.size === 0) return json({ ok: true, accepted: 0 });

  // Only accept stations that exist for this outlet
  const known = new Set(
    (await env.DB.prepare('SELECT channel, station FROM stations WHERE outlet_id = ?').bind(outletId).all()).results.map(
      (r) => `${r.channel}|${r.station}`
    )
  );

  const now = Date.now();
  const stmts = [];
  const ignored = [];
  for (const [key, r] of reports) {
    if (!known.has(key)) {
      ignored.push(key);
      continue;
    }
    // ok: 1 / 0 / null (null = "alive" signal only; keep the previous reported_ok)
    stmts.push(
      env.DB.prepare(
        `INSERT INTO station_state (outlet_id, channel, station, reported_ok, last_seen_at, last_ok_at, status, detail, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, CASE WHEN COALESCE(?4, 1) = 1 THEN ?5 END, 'unknown', ?6, ?5)
         ON CONFLICT (outlet_id, channel, station) DO UPDATE SET
           reported_ok  = COALESCE(?4, station_state.reported_ok),
           last_seen_at = ?5,
           last_ok_at   = CASE WHEN COALESCE(?4, station_state.reported_ok, 1) = 1 THEN ?5 ELSE station_state.last_ok_at END,
           detail       = ?6,
           updated_at   = ?5`
      ).bind(outletId, r.channel, r.station, r.ok, now, JSON.stringify(r.detail || {}))
    );
  }
  if (stmts.length) await env.DB.batch(stmts);

  return json({ ok: true, accepted: stmts.length, ignored });
}

