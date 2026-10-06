// ODS pinged by several devices (POS + SOK): online wins. Run: node worker/test/ping-combine.test.mjs
import { combinePings, parseTelegraf } from '../core.js';
import assert from 'node:assert/strict';
const MIN = 60000, t0 = 1_000_000_000_000;
let r = combinePings({}, 'pos|POS-1', 1, t0);            assert.equal(r.ok, 1);
r = combinePings(r.reporters, 'kiosk|SOK-1', 0, t0 + MIN); assert.equal(r.ok, 1, 'POS still ok -> online wins');
r = combinePings(r.reporters, 'pos|POS-1', 0, t0 + 5*MIN); assert.equal(r.ok, 0, 'both fail -> down');
r = combinePings(r.reporters, 'kiosk|SOK-1', 1, t0 + 6*MIN); assert.equal(r.ok, 1, 'one back -> up');
// POS stopped reporting long ago with ok=1: must not keep it green
r = combinePings({ 'pos|POS-1': { ok: 1, ts: t0 } }, 'kiosk|SOK-1', 0, t0 + 20*MIN); assert.equal(r.ok, 0, 'stale ok drops out');
assert.deepEqual(Object.keys(r.reporters), ['kiosk|SOK-1']);
const p = parseTelegraf({ metrics: [{ name: 'ping', tags: { channel: 'kiosk', station: 'SOK-1', peer_channel: 'ods', peer_station: 'ODS-1' }, fields: { result_code: 0, percent_packet_loss: 0 } }] });
assert.equal(p.get('ods|ODS-1').detail.by, 'kiosk|SOK-1');
console.log('all ok');
