// Mirrors Supabase reference data into D1 (Supabase stays the source of truth):
// outlets + opening hours, station list, heartbeat token hashes.

import { CONFIG } from './core.js';

async function supabase(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function syncMetadata(env, now = Date.now(), force = false) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY secret is not set');
  const db = env.DB;
  const last = await db.prepare("SELECT value FROM meta WHERE key = 'last_sync'").first();
  if (!force && last && now - Number(last.value) < CONFIG.SYNC_EVERY_MIN * 60 * 1000) return false;

  const [outlets, stations, tokens] = await Promise.all([
    supabase(env, 'outlets?select=outlet_id,code,name,country,operating_hours,opening_time,closing_time'),
    supabase(env, 'outlet_stations?select=outlet_id,channel,station'),
    supabase(env, 'heartbeat_tokens?select=outlet_id,token_hash'),
  ]);

  const stmts = [db.prepare('DELETE FROM outlets'), db.prepare('DELETE FROM stations'), db.prepare('DELETE FROM tokens')];
  for (const o of outlets) {
    stmts.push(
      db
        .prepare('INSERT INTO outlets (outlet_id, code, name, country, operating_hours, opening_time, closing_time) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(
          o.outlet_id,
          o.code,
          o.name,
          o.country,
          o.operating_hours ? JSON.stringify(o.operating_hours) : null,
          o.opening_time ? String(o.opening_time).slice(0, 5) : null,
          o.closing_time ? String(o.closing_time).slice(0, 5) : null
        )
    );
  }
  for (const s of stations) {
    stmts.push(db.prepare('INSERT INTO stations (outlet_id, channel, station) VALUES (?, ?, ?)').bind(s.outlet_id, s.channel, s.station));
  }
  for (const t of tokens) {
    stmts.push(db.prepare('INSERT INTO tokens (token_hash, outlet_id) VALUES (?, ?)').bind(t.token_hash, t.outlet_id));
  }
  // Drop live state for stations that no longer exist
  stmts.push(
    db.prepare(
      `DELETE FROM station_state WHERE NOT EXISTS (
         SELECT 1 FROM stations s WHERE s.outlet_id = station_state.outlet_id
           AND s.channel = station_state.channel AND s.station = station_state.station)`
    )
  );
  stmts.push(
    db.prepare("INSERT INTO meta (key, value) VALUES ('last_sync', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(String(now))
  );
  await db.batch(stmts);
  return true;
}
