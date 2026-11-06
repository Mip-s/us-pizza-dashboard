// "Outlet closed" mode: operations silence an outlet for a set time (power cut, renovation ...).
//
//   POST /api/closure       { outlet_id, until (epoch ms) | hours, reason }   start a closure (replaces a running one)
//   POST /api/closure/end   { outlet_id }                                     end it now
//
// Operations team only. While a closure is active the monitor raises nothing new for the outlet and sends no alerts
// or pushes; /api/status shows it as CLOSED (grey), and the hub's HOD panel shows the devices signal grey too.
// The tables are created by migrations/0002_outlet_closures.sql; until it is applied everything below behaves as "no closures".

export const MAX_CLOSURE_DAYS = 90;
export const REOPEN_GRACE_MIN = 15; // devices need a few minutes to report again after the closure ends
const MIN = 60 * 1000;

export const effectiveEnd = (c) => (c.ended_at != null ? Math.min(c.ended_at, c.closed_until) : c.closed_until);

/** Closures that are running, or ended less than the grace ago: Map outlet_id -> { ...row, quiet_until, active }.
 *  active = closed right now (shown as CLOSED); the grace period after it only keeps the monitor quiet. */
export async function loadClosures(db, now = Date.now()) {
  try {
    const rows = (
      await db
        .prepare(
          `SELECT id, outlet_id, reason, closed_until, created_at, set_by, ended_at FROM outlet_closures
            WHERE MIN(COALESCE(ended_at, closed_until), closed_until) + ? > ? ORDER BY created_at, id`
        )
        .bind(REOPEN_GRACE_MIN * MIN, now)
        .all()
    ).results;
    const out = new Map();
    for (const r of rows) {
      const end = effectiveEnd(r);
      out.set(r.outlet_id, { ...r, until: end, quiet_until: end + REOPEN_GRACE_MIN * MIN, active: now < end });
    }
    return out;
  } catch (err) {
    console.warn('closures unavailable (migration 0002 not applied?):', err.message);
    return new Map();
  }
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// The signed-in operations user, or null
async function opsUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const headers = { apikey: env.SUPABASE_ANON_KEY, Authorization: auth };
  const [uRes, pRes] = await Promise.all([
    fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers }),
    fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=role,full_name`, { headers }), // RLS: only their own row
  ]);
  if (!uRes.ok || !pRes.ok) return null;
  const [p] = await pRes.json();
  if (p?.role !== 'operations_team') return null;
  const u = await uRes.json();
  return { id: u.id, name: p.full_name || u.email || 'operations' };
}

export async function handleClosure(request, env, pathname, now = Date.now()) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const user = await opsUser(request, env);
  if (!user) return json({ error: 'operations team only' }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'body must be JSON' }, 400);
  }
  const outletId = String(body.outlet_id || '');
  const outlet = await env.DB.prepare('SELECT outlet_id FROM outlets WHERE outlet_id = ?').bind(outletId).first();
  if (!outlet) return json({ error: 'unknown outlet' }, 404);

  if (pathname === '/api/closure/end') {
    const r = await env.DB.prepare('UPDATE outlet_closures SET ended_at = ?, ended_by = ? WHERE outlet_id = ? AND ended_at IS NULL AND closed_until > ?')
      .bind(now, user.name, outletId, now)
      .run();
    return json({ ok: true, ended: r.meta?.changes || 0 });
  }

  const reason = String(body.reason || '').trim().slice(0, 200);
  if (reason.length < 3) return json({ error: 'give a reason' }, 400);
  const until = body.until != null ? Number(body.until) : now + Number(body.hours) * 60 * MIN;
  if (!Number.isFinite(until) || until <= now + MIN) return json({ error: 'the end time must be in the future' }, 400);
  if (until > now + MAX_CLOSURE_DAYS * 24 * 60 * MIN) return json({ error: `at most ${MAX_CLOSURE_DAYS} days` }, 400);
  await env.DB.batch([
    env.DB.prepare('UPDATE outlet_closures SET ended_at = ?, ended_by = ? WHERE outlet_id = ? AND ended_at IS NULL AND closed_until > ?').bind(now, user.name, outletId, now),
    env.DB.prepare('INSERT INTO outlet_closures (outlet_id, reason, closed_until, created_at, set_by) VALUES (?, ?, ?, ?, ?)').bind(outletId, reason, Math.round(until), now, user.name),
  ]);
  return json({ ok: true, until: Math.round(until) });
}
