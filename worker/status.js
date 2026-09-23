// GET /api/status — live outlet + station status for the signed-in user.
//
// Auth: the dashboard sends the user's Supabase access token. We verify it with
// Supabase, then ask Supabase which outlets this user may see (RLS does the
// filtering: ops = all, area manager = their outlets, outlet manager = own outlet),
// and return live state for just those outlets from D1.
//
// Query: ?since=<alert id>  -> also return alerts newer than that id (for toasts)

import { evaluateOverall } from './core.js';

// D1 can return rare transient errors (and the local simulator does on Windows): retry once.
async function withRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    console.warn('D1 read failed, retrying once:', err.message);
    await new Promise((r) => setTimeout(r, 150));
    return fn();
  }
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function handleStatus(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'not signed in' }, 401);

  // Which outlets can this user see? (Supabase RLS decides; an invalid token -> 401)
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/outlets?select=outlet_id,code,name,region&order=code`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: auth },
  });
  if (res.status === 401 || res.status === 403) return json({ error: 'session expired' }, 401);
  if (!res.ok) return json({ error: 'could not load outlets' }, 502);
  const outlets = await res.json();
  if (outlets.length === 0) return json({ generated_at: Date.now(), outlets: [], alerts: [], last_alert_id: 0 });

  const ids = outlets.map((o) => o.outlet_id);
  const ph = ids.map(() => '?').join(',');
  const db = env.DB;

  const [stationRows, outletRows, lastAlerts, maxAlert] = await withRetry(() => db.batch([
    db
      .prepare(
        `SELECT s.outlet_id, s.channel, s.station, COALESCE(st.status, 'unknown') AS status,
                st.last_seen_at, st.last_ok_at, st.reported_ok
           FROM stations s
           LEFT JOIN station_state st
             ON st.outlet_id = s.outlet_id AND st.channel = s.channel AND st.station = s.station
          WHERE s.outlet_id IN (${ph})`
      )
      .bind(...ids),
    db.prepare(`SELECT outlet_id, overall_status, alert_message, updated_at FROM outlet_state WHERE outlet_id IN (${ph})`).bind(...ids),
    db
      .prepare(
        `SELECT a.outlet_id, a.message, a.created_at FROM alerts a
          JOIN (SELECT outlet_id, MAX(id) AS id FROM alerts WHERE outlet_id IN (${ph}) GROUP BY outlet_id) m ON m.id = a.id`
      )
      .bind(...ids),
    db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM alerts'),
  ]));

  const stationsBy = {};
  for (const r of stationRows.results) (stationsBy[r.outlet_id] ||= []).push(r);
  const stateBy = Object.fromEntries(outletRows.results.map((r) => [r.outlet_id, r]));
  const lastAlertBy = Object.fromEntries(lastAlerts.results.map((r) => [r.outlet_id, r]));

  const payload = outlets.map((o) => {
    const stations = stationsBy[o.outlet_id] || [];
    const overall = evaluateOverall(stations); // live, from current station states
    return {
      outlet_id: o.outlet_id,
      code: o.code,
      outlet_name: o.name,
      region: o.region,
      overall_status: overall,
      alert_message: overall === 'HEALTHY' || overall === 'UNMONITORED' ? null : stateBy[o.outlet_id]?.alert_message || null,
      last_alert_time: lastAlertBy[o.outlet_id]?.created_at || null,
      active_downtime_count: stations.filter((s) => s.status === 'confirmed').length,
      stations: stations.map(({ channel, station, status, last_seen_at }) => ({ channel, station, status, last_seen_at })),
    };
  });

  // New alerts since the client's last poll (only for outlets this user can see)
  const since = Number(new URL(request.url).searchParams.get('since') || 0);
  let alerts = [];
  let lastAlertId = maxAlert.results[0].id;
  if (since > 0) {
    try {
      alerts = (
        await withRetry(() =>
          db
            .prepare(
              `SELECT id, outlet_id, overall_status, message, created_at FROM alerts
                WHERE id > ? AND outlet_id IN (${ph}) ORDER BY id LIMIT 50`
            )
            .bind(since, ...ids)
            .all()
        )
      ).results;
    } catch (err) {
      // Don't fail the whole dashboard over the toast feed: return the status now,
      // and keep the client's cursor so these alerts are picked up on the next poll.
      console.error('alerts-since query failed, will retry next poll:', err.message);
      lastAlertId = since;
    }
  }

  return json({ generated_at: Date.now(), outlets: payload, alerts, last_alert_id: lastAlertId });
}
