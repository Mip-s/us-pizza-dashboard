# POS Uptime Monitor (inside the dashboard Worker)

**Served two ways:** inside the Operations hub at `us-pizza-operations…/uptime` (the hub Worker
forwards `/uptime/*` here through a service binding, so login and alerts are shared with the hub),
and still directly on this Worker's own URL. The app is built under `/uptime` (`homepage` in
`package.json`); `worker/index.js` strips the `/uptime` prefix. **`/api/heartbeat` on this Worker's
own URL must keep working** — every POS agent (Telegraf / Automate) posts there.

One Cloudflare Worker (`uptime-us-pizza-dashboard`, config in `/wrangler.jsonc`) does everything:

```
POS (Telegraf) ──POST /api/heartbeat──▶ Worker ──▶ D1 station_state (latest only, overwritten)
Dashboard      ──GET  /api/status ────▶ Worker ──▶ D1, filtered by the user's Supabase permissions (RLS)
anything else  ─────────────────────────▶ React app (./build)
cron every minute ─▶ Worker: mirror outlets/stations/tokens from Supabase (every 5 min)
                           → silent > 11 min or reported failure → suspected → confirmed (1 min)
                           → skip outlets outside opening hours
                           → downtime_log + alerts in D1 → Web Push
```

Supabase = reference data only (outlets, `outlet_stations`, `heartbeat_tokens`, users, managers,
`push_subscriptions`). D1 (`us-pizza-monitoring`) = live monitoring state.

| File | What |
|---|---|
| `worker/index.js` | Entry: routes `/api/*`, serves the app, runs the cron |
| `worker/heartbeat.js` | Receives Telegraf output (per-outlet Bearer token) |
| `worker/status.js` | Live status for the signed-in user |
| `worker/core.js` | Opening hours, severity, rollup, alert text, Telegraf parsing, state machine |
| `worker/sync.js` | Supabase → D1 mirror |
| `worker/push.js` | Web Push (VAPID) |
| `migrations/0001_init.sql` | D1 schema (already applied) |
| `worker/test/` | End-to-end tests on a local D1: `npm run test:worker` |

## One-time setup (Cloudflare dashboard)

The D1 database is already created and its tables exist. Only the two secrets are missing:

Workers & Pages → **uptime-us-pizza-dashboard** → Settings → Variables and Secrets → Add (type **Secret**):

- `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Project Settings → API Keys → service_role / secret key
- `VAPID_PRIVATE_KEY` — the private key that pairs with `REACT_APP_VAPID_PUBLIC_KEY`
  (the one the old `send-outlet-alert-push` Edge Function used)

Everything else (D1 binding, cron, public vars) comes from `wrangler.jsonc` on each push.

## Local development

`npm start` (React dev server) has **no** `/api` — the dashboard will show 0 outlets.
To run the full thing locally: `npm run build && npx wrangler dev`.

## Tuning (`worker/core.js` → `CONFIG`)

- `HEARTBEAT_TIMEOUT_MIN` (11): silence before a POS is suspected. Telegraf re-sends every 5 min.
- `CONFIRM_AFTER_MIN` (1): suspected → confirmed.

## Free plan budget

77 POS × one request per 5 min (+ instant reports on change) ≈ 15–22k requests/day + dashboard polling.
Workers Free = 100k requests/day; D1 Free = 100k rows written/day.
