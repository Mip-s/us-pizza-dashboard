import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlatformProxy } from 'wrangler';
import { runMonitor, sha256Hex, isOutletOpen } from '../core.js';
import { handleHeartbeat } from '../heartbeat.js';
import { handleStatus } from '../status.js';

const MIN = 60000;
const ALLDAY = JSON.stringify(Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(d => [d, [['00:00','00:00']]])));
const TOKEN = 'hb_test_token_004';

const { env, dispose } = await getPlatformProxy({ configPath: new URL('../../wrangler.jsonc', import.meta.url).pathname, persist: { path: new URL('../../.wstate/v3', import.meta.url).pathname } });
const db = env.DB;

async function reset() {
  await db.batch([
    ...['outlets','stations','tokens','station_state','outlet_state','downtime_log','alerts','meta'].map(t => db.prepare(`DELETE FROM ${t}`)),
    db.prepare(`INSERT INTO outlets VALUES ('o-004','004','US Pizza SS15','MY',?, '00:00','00:00')`).bind(ALLDAY),
    ...[['pos','POS-1'],['kds','KDS-1'],['kds','KDS-2'],['delivery','grab']].map(([c,s]) =>
      db.prepare('INSERT INTO stations VALUES (?,?,?)').bind('o-004', c, s)),
    db.prepare('INSERT INTO tokens VALUES (?, ?)').bind(await sha256Hex(TOKEN), 'o-004'),
  ]);
}

// Telegraf-shaped batch
const tg = ({ running = 1, kds1 = true, kds2 = true } = {}) => ({ metrics: [
  { name: 'procstat_lookup', tags: { outlet_code: '004', pos_station: 'POS-1', host: 'POS004' }, fields: { running }, timestamp: Math.floor(Date.now()/1000) },
  { name: 'ping', tags: { pos_station: 'POS-1', peer_channel: 'kds', peer_station: 'KDS-1', url: '192.168.0.31' }, fields: { result_code: kds1 ? 0 : 2, percent_packet_loss: kds1 ? 0 : 100 }, timestamp: Math.floor(Date.now()/1000) },
  { name: 'ping', tags: { pos_station: 'POS-1', peer_channel: 'kds', peer_station: 'KDS-2', url: '192.168.0.32' }, fields: { result_code: kds2 ? 0 : 2, percent_packet_loss: kds2 ? 0 : 100 }, timestamp: Math.floor(Date.now()/1000) },
]});

async function send(body, token = TOKEN) {
  const req = new Request('https://x/api/heartbeat', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const res = await handleHeartbeat(req, env);
  return { status: res.status, body: await res.json() };
}
// heartbeat.js stamps Date.now(); shift stored timestamps to simulate time
const shift = (ms) => db.prepare('UPDATE station_state SET last_seen_at = last_seen_at + ?, last_ok_at = last_ok_at + ?').bind(ms, ms).run();
const states = async () => Object.fromEntries((await db.prepare('SELECT channel||"/"||station k, status FROM station_state').all()).results.map(r => [r.k, r.status]));

test('rejects bad token', async () => {
  await reset();
  assert.equal((await send(tg(), 'nope')).status, 401);
});

test('healthy heartbeat -> normal, grab stays unmonitored, no alert', async () => {
  await reset();
  const r = await send(tg());
  assert.equal(r.status, 200); assert.equal(r.body.accepted, 3);
  const alerts = await runMonitor(db, Date.now());
  assert.equal(alerts.length, 0);
  assert.deepEqual(await states(), { 'pos/POS-1': 'normal', 'kds/KDS-1': 'normal', 'kds/KDS-2': 'normal' });
});

test('KDS-1 unreachable -> suspected -> confirmed -> DEGRADED alert -> recovers', async () => {
  await reset();
  await send(tg()); await runMonitor(db, Date.now());
  await send(tg({ kds1: false }));
  const t0 = Date.now();
  assert.equal((await runMonitor(db, t0)).length, 0);
  assert.equal((await states())['kds/KDS-1'], 'suspected');
  const a = await runMonitor(db, t0 + 1.1*MIN);
  assert.equal(a.length, 1); assert.equal(a[0].overall, 'DEGRADED');
  assert.match(a[0].message, /Partially down: KDS \(1\/2\)/);
  await send(tg());
  const b = await runMonitor(db, t0 + 2*MIN);
  assert.equal(b[0].overall, 'HEALTHY');
  const dl = await db.prepare('SELECT * FROM downtime_log').all();
  assert.equal(dl.results.length, 1); assert.ok(dl.results[0].ended_at);
});

test('POS app closed -> CRITICAL_DOWN', async () => {
  await reset();
  await send(tg()); await runMonitor(db, Date.now());
  await send(tg({ running: 0 }));
  const t0 = Date.now(); await runMonitor(db, t0);
  const a = await runMonitor(db, t0 + 1.1*MIN);
  assert.equal(a[0].overall, 'CRITICAL_DOWN');
  assert.match(a[0].message, /cannot take any orders -- POS is completely down \(POS \(1\/1\)\)/);
});

test('POS goes silent -> only after heartbeat timeout; KDS not double-counted', async () => {
  await reset();
  await send(tg()); await runMonitor(db, Date.now());
  const t0 = Date.now();
  assert.equal((await runMonitor(db, t0 + 10*MIN)).length, 0);           // within 11 min: fine
  assert.equal((await states())['pos/POS-1'], 'normal');
  await runMonitor(db, t0 + 12*MIN);                                        // suspected
  const a = await runMonitor(db, t0 + 13.2*MIN);                            // confirmed
  assert.equal(a[0].overall, 'CRITICAL_DOWN');
  const s = await states();
  assert.equal(s['pos/POS-1'], 'confirmed'); assert.equal(s['kds/KDS-1'], 'normal');
});

test('closed outlet: no transitions', async () => {
  await reset();
  await db.prepare(`UPDATE outlets SET operating_hours = ? WHERE outlet_id='o-004'`)
    .bind(JSON.stringify(Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(d => [d, [['03:00','03:01']]])))).run();
  await send(tg({ running: 0 }));
  const t0 = Date.now(); await runMonitor(db, t0); await runMonitor(db, t0 + 5*MIN);
  assert.equal((await states())['pos/POS-1'], 'unknown');
});

test('opening hours: overnight, split shift, SG', () => {
  const o = { operating_hours: JSON.stringify({ mon:[['10:30','02:00']], tue:[['10:30','02:00']], wed:[['10:30','02:00']], thu:[['10:30','02:00']], fri:[['10:30','12:30'],['14:30','23:30']], sat:[['10:30','02:00']], sun:[['10:30','02:00']] }) };
  const at = (iso) => Date.parse(iso);
  assert.equal(isOutletOpen(o, at('2026-09-23T01:30:00+08:00')), true);   // Wed 01:30 (Tue spill)
  assert.equal(isOutletOpen(o, at('2026-09-23T02:30:00+08:00')), false);
  assert.equal(isOutletOpen(o, at('2026-09-25T13:30:00+08:00')), false);  // Fri prayer break
  assert.equal(isOutletOpen(o, at('2026-09-25T15:00:00+08:00')), true);
  assert.equal(isOutletOpen(o, at('2026-09-26T01:00:00+08:00')), false);  // Fri closes 23:30, no spill
});

test('status API: rejects missing auth', async () => {
  const res = await handleStatus(new Request('https://x/api/status'), env);
  assert.equal(res.status, 401);
});

test('procstat result survives later ping "alive" signals (real Telegraf timing)', async () => {
  await reset();
  const t = Math.floor(Date.now()/1000);
  const batch = (running) => ({ metrics: [
    { name: 'mem', tags: { outlet_code: '004', pos_station: 'POS-1', host: 'X' }, fields: { total: 1 }, timestamp: t },
    { name: 'procstat_lookup', tags: { outlet_code: '004', pos_station: 'POS-1', host: 'X' }, fields: { running }, timestamp: t },
    { name: 'ping', tags: { pos_station: 'POS-1', peer_channel: 'kds', peer_station: 'KDS-1' }, fields: { result_code: 0, percent_packet_loss: 0 }, timestamp: t + 2 },
    { name: 'ping', tags: { pos_station: 'POS-1', peer_channel: 'kds', peer_station: 'KDS-2' }, fields: { result_code: 0, percent_packet_loss: 0 }, timestamp: t + 2 },
  ]});
  await send(batch(1)); await runMonitor(db, Date.now());
  let row = await db.prepare("SELECT reported_ok FROM station_state WHERE channel='pos'").first();
  assert.equal(row.reported_ok, 1);
  await send(batch(0));
  row = await db.prepare("SELECT reported_ok FROM station_state WHERE channel='pos'").first();
  assert.equal(row.reported_ok, 0);
  const t0 = Date.now(); await runMonitor(db, t0);
  const a = await runMonitor(db, t0 + 1.1*MIN);
  assert.equal(a[0].overall, 'CRITICAL_DOWN');
});

test('an "alive"-only batch keeps the last known app state', async () => {
  await reset();
  await send(tg({ running: 0 }));
  await send({ metrics: [{ name: 'mem', tags: { pos_station: 'POS-1' }, fields: { total: 1 }, timestamp: Math.floor(Date.now()/1000) }] });
  const row = await db.prepare("SELECT reported_ok FROM station_state WHERE channel='pos'").first();
  assert.equal(row.reported_ok, 0);
});

test('status API: returns outlets, stations and new alerts since cursor', async () => {
  await reset();
  await send(tg({ running: 0 }));
  const t0 = Date.now(); await runMonitor(db, t0); await runMonitor(db, t0 + 1.1*MIN); // -> CRITICAL alert
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([{ outlet_id: 'o-004', code: '004', name: 'US Pizza SS15', region: 'Klang Valley' }]), { status: 200 });
  try {
    const env2 = { ...env, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon' };
    const call = async (q = '') => (await handleStatus(new Request('https://x/api/status' + q, { headers: { Authorization: 'Bearer user-jwt' } }), env2)).json();
    const first = await call();
    assert.equal(first.outlets.length, 1);
    assert.equal(first.outlets[0].overall_status, 'CRITICAL_DOWN');
    assert.ok(first.last_alert_id > 0);
    const second = await call(`?since=${first.last_alert_id - 1}`);
    assert.equal(second.alerts.length, 1);
    assert.match(second.alerts[0].message, /🚨/);
    const third = await call(`?since=${first.last_alert_id}`);
    assert.equal(third.alerts.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test.after(() => dispose());

test('push title puts the down systems first', async () => {
  const { pushTitle } = await import('../core.js');
  const st = (channel, station, status) => ({ channel, station, status });
  const name = 'US Pizza Kota Damansara';
  assert.equal(
    pushTitle(name, 'CRITICAL_DOWN', [st('pos', 'POS-1', 'confirmed'), st('kds', 'KDS-1', 'normal')]),
    '🚨 POS DOWN · US Pizza Kota Damansara'
  );
  assert.equal(
    pushTitle(name, 'DEGRADED', [
      st('pos', 'POS-1', 'normal'), st('kds', 'KDS-1', 'normal'), st('kds', 'KDS-2', 'confirmed'),
      st('ods', 'ODS-1', 'confirmed'), st('delivery', 'grab', 'confirmed'), st('delivery', 'shopee', 'normal'),
      st('kiosk', 'SOK-1', 'unknown'),
    ]),
    '⚠️ KDS-2 · ODS · GrabFood DOWN · US Pizza Kota Damansara'
  );
  assert.equal(pushTitle(name, 'HEALTHY', [st('pos', 'POS-1', 'normal')]), '✅ BACK ONLINE · US Pizza Kota Damansara');
  assert.equal(
    pushTitle(name, 'CRITICAL_DOWN', [st('pos', 'POS-1', 'confirmed'), st('kds', 'KDS-1', 'confirmed'), st('kiosk', 'SOK-1', 'unknown')]),
    '🚨 ALL SYSTEMS DOWN · US Pizza Kota Damansara'
  );
  const now = Date.now();
  assert.equal(
    pushTitle(name, 'CRITICAL_DOWN', [
      { channel: 'pos', station: 'POS-1', status: 'confirmed', last_seen_at: now - 15 * MIN },
      st('kds', 'KDS-1', 'normal'),
    ], now),
    '🚨 ALL SYSTEMS DOWN (NO SIGNAL) · US Pizza Kota Damansara'
  );
  // POS app closed but the PC is still reporting -> just POS
  assert.equal(
    pushTitle(name, 'CRITICAL_DOWN', [
      { channel: 'pos', station: 'POS-1', status: 'confirmed', last_seen_at: now - 1 * MIN },
      st('kds', 'KDS-1', 'normal'),
    ], now),
    '🚨 POS DOWN · US Pizza Kota Damansara'
  );
});
