// Shared monitoring logic for the US Pizza POS Uptime Monitor.
// Used by the Pages Functions (functions/api/*) and the cron Worker (monitor/worker.js).
// No external dependencies so it bundles cleanly in both places.

export const CONFIG = {
  HEARTBEAT_TIMEOUT_MIN: 11,   // silence longer than this = suspected (2 missed 5-min heartbeats + margin)
  CONFIRM_AFTER_MIN: 1,        // suspected for this long = confirmed (filters restarts / blips)
  SYNC_EVERY_MIN: 5,           // refresh the Supabase metadata mirror this often
  TZ_OFFSET_MIN: 8 * 60,       // Malaysia & Singapore are both UTC+8, no DST
};

const MIN = 60 * 1000;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Channels: pos = POS terminal, kds = kitchen display, kiosk = self-order kiosk (SOK),
// ods = order display screen (TV), delivery = food delivery platforms (Grab / foodpanda / ShopeeFood)
export const CHANNELS = ['pos', 'kds', 'kiosk', 'ods', 'delivery'];
export const CHANNEL_LABEL = { pos: 'POS', kds: 'KDS', kiosk: 'SOK', ods: 'ODS', delivery: 'Food Delivery' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

// ---------------------------------------------------------------------------
// Opening hours (port of public.is_outlet_open)
//  - per-day ranges, a close time <= open time runs past midnight,
//  - multiple ranges per day = split shift (e.g. Friday prayer break).
// ---------------------------------------------------------------------------
export function isOutletOpen(outlet, now = Date.now()) {
  let hours = null;
  try {
    hours = outlet.operating_hours ? JSON.parse(outlet.operating_hours) : null;
  } catch {
    hours = null;
  }
  if (!hours) {
    if (!outlet.opening_time || !outlet.closing_time) return true;
    const range = [[outlet.opening_time.slice(0, 5), outlet.closing_time.slice(0, 5)]];
    hours = Object.fromEntries(DAYS.map((d) => [d, range]));
  }

  const local = new Date(now + CONFIG.TZ_OFFSET_MIN * MIN);
  const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes();
  const today = DAYS[local.getUTCDay()];
  const yday = DAYS[(local.getUTCDay() + 6) % 7];

  for (const [o, c] of hours[today] || []) {
    const open = toMinutes(o);
    const close = toMinutes(c);
    if (close > open) {
      if (nowMin >= open && nowMin < close) return true;
    } else if (nowMin >= open) {
      return true; // opened today, runs past midnight
    }
  }
  for (const [o, c] of hours[yday] || []) {
    const open = toMinutes(o);
    const close = toMinutes(c);
    if (close <= open && nowMin < close) return true; // yesterday's overnight spill
  }
  return false;
}

// ---------------------------------------------------------------------------
// Severity (port of public.get_channel_severity)
// ---------------------------------------------------------------------------
export function channelSeverity(channel, idleMinutes) {
  // pos/kds stop orders being made; delivery loses online orders; kiosk/ods (TV) are inconveniences
  const chan = { online: 'delivery' }[channel] || channel;
  if (idleMinutes >= 60) return ['kiosk', 'ods'].includes(chan) ? 'high' : 'critical';
  if (idleMinutes >= 30) return ['pos', 'kds'].includes(chan) ? 'critical' : chan === 'delivery' ? 'high' : 'medium';
  if (idleMinutes >= 20) return ['pos', 'kds'].includes(chan) ? 'high' : 'medium';
  return 'medium';
}

// ---------------------------------------------------------------------------
// Outlet rollup (port of public.evaluate_outlet_overall_status)
// Only stations that are actually monitored (status != 'unknown') count.
// ---------------------------------------------------------------------------
function groupByChannel(stations) {
  const byChan = {};
  for (const s of stations) {
    if (s.status === 'unknown') continue;
    (byChan[s.channel] ||= { total: 0, confirmed: 0 });
    byChan[s.channel].total += 1;
    if (s.status === 'confirmed') byChan[s.channel].confirmed += 1;
  }
  return byChan;
}

// ---------------------------------------------------------------------------
// Push notification title: the systems that are down come FIRST, so they are the
// first thing seen on a lock screen (push notifications can't use bold text).
//   🚨 POS DOWN · US Pizza Kota Damansara
//   ⚠️ KDS-2 · ODS DOWN · MFM Kota Damansara
//   🚨 ALL SYSTEMS DOWN · US Pizza Kota Damansara          (every monitored category down)
//   🚨 ALL SYSTEMS DOWN (NO SIGNAL) · US Pizza Kota Damansara (POS stopped reporting: power / internet)
//   ✅ BACK ONLINE · US Pizza Kota Damansara
// A fully-down channel is named by its category (POS, KDS, Food Delivery);
// a partly-down one lists the actual stations (KDS-2, GrabFood).
// ---------------------------------------------------------------------------
const STATION_LABEL = { grab: 'GrabFood', foodpanda: 'foodpanda', shopee: 'ShopeeFood' };

export function downSystems(stations) {
  const parts = [];
  for (const chan of CHANNELS) {
    const monitored = stations.filter((s) => s.channel === chan && s.status !== 'unknown');
    const down = monitored.filter((s) => s.status === 'confirmed');
    if (down.length === 0) continue;
    if (down.length === monitored.length) parts.push(CHANNEL_LABEL[chan] || chan.toUpperCase());
    else parts.push(...down.map((s) => STATION_LABEL[s.station] || s.station).sort());
  }
  return parts;
}

export function pushTitle(outletName, overall, stations, now = Date.now()) {
  const name = outletName || 'Unknown Outlet';
  if (overall === 'HEALTHY') return `✅ BACK ONLINE · ${name}`;

  // Outlet went silent: the POS (which also checks every other device) stopped
  // reporting at all -> likely power / internet loss, nothing at the outlet is visible.
  const pos = stations.filter((s) => s.channel === 'pos' && s.status !== 'unknown');
  const silent = pos.length > 0 && pos.every(
    (s) => s.status === 'confirmed' && s.last_seen_at && now - s.last_seen_at > CONFIG.HEARTBEAT_TIMEOUT_MIN * MIN
  );
  if (silent) return `🚨 ALL SYSTEMS DOWN (NO SIGNAL) · ${name}`;

  // Every monitored category is completely down
  const monitoredChans = [...new Set(stations.filter((s) => s.status !== 'unknown').map((s) => s.channel))];
  const allDown = monitoredChans.length >= 2 && monitoredChans.every((c) =>
    stations.filter((s) => s.channel === c && s.status !== 'unknown').every((s) => s.status === 'confirmed')
  );
  if (allDown) return `🚨 ALL SYSTEMS DOWN · ${name}`;

  const down = downSystems(stations);
  const what = down.length ? `${down.join(' · ')} DOWN` : String(overall).replace('_', ' ');
  return `${overall === 'CRITICAL_DOWN' ? '🚨' : '⚠️'} ${what} · ${name}`;
}

export function evaluateOverall(stations) {
  const byChan = groupByChannel(stations);
  const chans = Object.keys(byChan);
  if (chans.length === 0) return 'UNMONITORED';
  const pos = byChan.pos;
  const fullyDown = chans.filter((c) => byChan[c].total > 0 && byChan[c].confirmed === byChan[c].total).length;
  if ((pos && pos.total > 0 && pos.confirmed === pos.total) || fullyDown >= 2) return 'CRITICAL_DOWN';
  if (chans.some((c) => byChan[c].confirmed > 0)) return 'DEGRADED';
  return 'HEALTHY';
}

// ---------------------------------------------------------------------------
// Alert text (port of public.compose_outlet_alert)
// ---------------------------------------------------------------------------
export function composeAlert(outletName, overall, stations) {
  const name = outletName || 'Unknown Outlet';
  const byChan = groupByChannel(stations);
  const fully = [];
  const partially = [];
  let posFullyDown = false;
  for (const chan of CHANNELS) {
    const c = byChan[chan];
    if (!c || c.confirmed === 0) continue;
    const label = `${CHANNEL_LABEL[chan] || chan.toUpperCase()} (${c.confirmed}/${c.total})`;
    if (c.confirmed === c.total) {
      fully.push(label);
      if (chan === 'pos') posFullyDown = true;
    } else {
      partially.push(label);
    }
  }
  switch (overall) {
    case 'CRITICAL_DOWN':
      return posFullyDown
        ? `🚨 CRITICAL OUTAGE: ${name} cannot take any orders -- POS is completely down (${fully.join(', ')}). Dispatch immediately to restore service.`
        : `🚨 CRITICAL OUTAGE: ${name} has multiple channels completely down: ${fully.join(', ')}. Dispatch immediately to restore service.`;
    case 'DEGRADED':
      return `⚠️ DEGRADED SERVICE: ${name} is operating at reduced capacity.` +
        (fully.length ? ` Fully down: ${fully.join(', ')}.` : '') +
        (partially.length ? ` Partially down: ${partially.join(', ')}.` : '');
    case 'HEALTHY':
      return `✅ RESOLVED: ${name} has recovered to normal operations. All channels online.`;
    default:
      return `INFO: ${name} status is ${overall || 'unknown'}`;
  }
}

// ---------------------------------------------------------------------------
// Heartbeat parsing (Telegraf JSON output, batch or single metric)
//
// Expected Telegraf tags:
//   global:  outlet_code, pos_station (e.g. "POS-1")
//   ping:    peer_channel ("kds" | "kiosk" | "ods"), peer_station ("KDS-1")
// Metrics used:
//   procstat_lookup.running  -> POS app running (>0)
//   ping.result_code / percent_packet_loss -> peer device reachable
//   anything else            -> just proves the POS is alive
// Returns a Map key "channel|station" -> { channel, station, ok|null, ts, detail }
// ---------------------------------------------------------------------------
export function parseTelegraf(body) {
  const metrics = Array.isArray(body) ? body : Array.isArray(body?.metrics) ? body.metrics : body ? [body] : [];
  const out = new Map();
  // Merge every reading about the same station in this batch:
  //  - ts   = newest reading of any kind (proves it is alive)
  //  - ok   = from the newest reading that actually says ok / not ok.
  //    A plain "alive" signal (ok === null) never overwrites a real result,
  //    even if it is timestamped later (e.g. pings finish ~2 s after procstat).
  const put = (channel, station, ok, ts, detail) => {
    const key = `${channel}|${station}`;
    const cur = out.get(key) || { channel, station, ok: null, okTs: -1, ts: 0, detail: {} };
    cur.ts = Math.max(cur.ts, ts);
    if (ok !== null && ts >= cur.okTs) {
      cur.ok = ok;
      cur.okTs = ts;
    }
    cur.detail = { ...cur.detail, ...detail };
    out.set(key, cur);
  };

  for (const m of metrics) {
    if (!m || typeof m !== 'object') continue;
    const tags = m.tags || {};
    const fields = m.fields || {};
    // Telegraf json timestamps default to seconds
    const tsRaw = Number(m.timestamp) || 0;
    const ts = tsRaw > 1e12 ? tsRaw : tsRaw * 1000;
    const posStation = tags.pos_station || 'POS-1';

    if (m.name === 'procstat_lookup') {
      put('pos', posStation, Number(fields.running) > 0 ? 1 : 0, ts, { running: fields.running, host: tags.host });
    } else if (m.name === 'ping' && tags.peer_channel && tags.peer_station) {
      const ok = Number(fields.result_code) === 0 && Number(fields.percent_packet_loss ?? 100) < 100;
      put(tags.peer_channel, tags.peer_station, ok ? 1 : 0, ts, {
        url: tags.url,
        result_code: fields.result_code,
        loss: fields.percent_packet_loss,
      });
      put('pos', posStation, null, ts, { host: tags.host }); // POS reported, so it is alive
    } else {
      put('pos', posStation, null, ts, { host: tags.host, metric: m.name });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// One monitoring pass (run by the cron Worker every minute)
// Returns list of { outlet, overall, message } for outlets whose alert changed.
// ---------------------------------------------------------------------------
export async function runMonitor(db, now = Date.now()) {
  const outlets = (await db.prepare('SELECT * FROM outlets').all()).results;
  const rows = (
    await db
      .prepare(
        `SELECT s.outlet_id, s.channel, s.station,
                st.reported_ok, st.last_seen_at, st.last_ok_at,
                COALESCE(st.status, 'unknown') AS status, st.suspected_since, st.downtime_id
           FROM stations s
           LEFT JOIN station_state st
             ON st.outlet_id = s.outlet_id AND st.channel = s.channel AND st.station = s.station`
      )
      .all()
  ).results;

  const byOutlet = new Map(outlets.map((o) => [o.outlet_id, { outlet: o, stations: [] }]));
  for (const r of rows) byOutlet.get(r.outlet_id)?.stations.push(r);

  const stmts = [];
  const changedOutlets = new Set();
  const timeout = CONFIG.HEARTBEAT_TIMEOUT_MIN * MIN;

  for (const { outlet, stations } of byOutlet.values()) {
    // Closed outlet: no NEW problems (no suspected/confirmed, no down alerts),
    // but a station that is healthy again may still recover (clears old outages).
    const open = isOutletOpen(outlet, now);

    for (const s of stations) {
      if (!s.last_seen_at) continue; // never reported -> not monitored ('unknown')

      const fresh = now - s.last_seen_at <= timeout;
      // Peer devices (KDS/kiosk) are only judged while the POS is still reporting them.
      if (!fresh && s.channel !== 'pos') continue;
      const healthy = fresh && s.reported_ok !== 0;
      const set = (fields) => {
        const keys = Object.keys(fields);
        stmts.push(
          db
            .prepare(
              `UPDATE station_state SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ?
                WHERE outlet_id = ? AND channel = ? AND station = ?`
            )
            .bind(...keys.map((k) => fields[k]), now, s.outlet_id, s.channel, s.station)
        );
      };

      if (healthy) {
        if (s.status === 'confirmed') {
          if (s.downtime_id) {
            stmts.push(db.prepare('UPDATE downtime_log SET ended_at = ? WHERE id = ?').bind(now, s.downtime_id));
          }
          changedOutlets.add(outlet.outlet_id);
        }
        if (s.status !== 'normal') {
          set({ status: 'normal', suspected_since: null, downtime_id: null });
          s.status = 'normal';
        }
      } else if (!open) {
        continue; // closed: not healthy, but don't raise or escalate anything
      } else if (s.status === 'normal' || s.status === 'unknown') {
        set({ status: 'suspected', suspected_since: now });
        s.status = 'suspected';
      } else if (s.status === 'suspected' && now - s.suspected_since >= CONFIG.CONFIRM_AFTER_MIN * MIN) {
        const since = s.last_ok_at || s.last_seen_at || s.suspected_since;
        const idle = (now - since) / MIN;
        const log = await db
          .prepare(
            `INSERT INTO downtime_log (outlet_id, channel, station, started_at, severity, idle_minutes)
             VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
          )
          .bind(s.outlet_id, s.channel, s.station, since, channelSeverity(s.channel, idle), Math.round(idle * 10) / 10)
          .first();
        set({ status: 'confirmed', downtime_id: log.id });
        s.status = 'confirmed';
        changedOutlets.add(outlet.outlet_id);
      }
    }
  }
  if (stmts.length) await db.batch(stmts);

  // Roll up changed outlets and write alerts (port of recalc_and_alert_outlet)
  const alerts = [];
  for (const outletId of changedOutlets) {
    const { outlet, stations } = byOutlet.get(outletId);
    const overall = evaluateOverall(stations);
    const message = composeAlert(outlet.name, overall, stations);
    const prev = await db.prepare('SELECT alert_message FROM outlet_state WHERE outlet_id = ?').bind(outletId).first();
    if (prev?.alert_message === message) continue;
    await db.batch([
      db
        .prepare(
          `INSERT INTO outlet_state (outlet_id, overall_status, alert_message, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT (outlet_id) DO UPDATE SET overall_status = excluded.overall_status,
             alert_message = excluded.alert_message, updated_at = excluded.updated_at`
        )
        .bind(outletId, overall, message, now),
      db
        .prepare('INSERT INTO alerts (outlet_id, overall_status, message, created_at) VALUES (?, ?, ?, ?)')
        .bind(outletId, overall, message, now),
    ]);
    const alert = await db.prepare('SELECT id FROM alerts WHERE outlet_id = ? ORDER BY id DESC LIMIT 1').bind(outletId).first();
    alerts.push({ id: alert.id, outlet, overall, message, title: pushTitle(outlet.name, overall, stations, now) });
  }
  return alerts;
}
