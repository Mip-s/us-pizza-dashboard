-- US Pizza POS Uptime Monitor — live monitoring state (Cloudflare D1)
-- Reference data (outlets, stations, tokens) is a read-only mirror of Supabase,
-- refreshed by the monitor Worker every few minutes. Supabase stays the source of truth.

-- Mirror: outlets + opening hours (from Supabase public.outlets)
CREATE TABLE IF NOT EXISTS outlets (
  outlet_id        TEXT PRIMARY KEY,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  country          TEXT,
  operating_hours  TEXT,          -- JSON: {"mon":[["10:30","02:00"]], ...}
  opening_time     TEXT,          -- fallback "HH:MM"
  closing_time     TEXT
);

-- Mirror: monitored stations per outlet (from Supabase public.outlet_stations)
CREATE TABLE IF NOT EXISTS stations (
  outlet_id  TEXT NOT NULL,
  channel    TEXT NOT NULL,       -- pos | kds | kiosk | online
  station    TEXT NOT NULL,       -- POS-1, KDS-1, SOK-1, grab ...
  PRIMARY KEY (outlet_id, channel, station)
);

-- Mirror: heartbeat token hashes (from Supabase public.heartbeat_tokens)
CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  outlet_id  TEXT NOT NULL
);

-- Live: latest known state per station (overwritten, no history)
CREATE TABLE IF NOT EXISTS station_state (
  outlet_id        TEXT NOT NULL,
  channel          TEXT NOT NULL,
  station          TEXT NOT NULL,
  reported_ok      INTEGER,        -- last value reported by the POS (1 ok / 0 not ok / NULL no check)
  last_seen_at     INTEGER,        -- epoch ms of the last report about this station
  last_ok_at       INTEGER,        -- epoch ms of the last report where it was healthy
  status           TEXT NOT NULL DEFAULT 'unknown',  -- unknown | normal | suspected | confirmed
  suspected_since  INTEGER,
  downtime_id      INTEGER,
  detail           TEXT,           -- JSON of the last raw report
  updated_at       INTEGER,
  PRIMARY KEY (outlet_id, channel, station)
);

-- Live: per-outlet rollup + current alert text
CREATE TABLE IF NOT EXISTS outlet_state (
  outlet_id       TEXT PRIMARY KEY,
  overall_status  TEXT NOT NULL,   -- HEALTHY | DEGRADED | CRITICAL_DOWN
  alert_message   TEXT,
  updated_at      INTEGER
);

-- History: confirmed outages (Finance uses this)
CREATE TABLE IF NOT EXISTS downtime_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet_id     TEXT NOT NULL,
  channel       TEXT NOT NULL,
  station       TEXT NOT NULL,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER,
  severity      TEXT,
  idle_minutes  REAL
);
CREATE INDEX IF NOT EXISTS idx_downtime_outlet ON downtime_log (outlet_id, started_at);

-- History: alert messages shown as toasts / sent as push
CREATE TABLE IF NOT EXISTS alerts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet_id       TEXT NOT NULL,
  overall_status  TEXT NOT NULL,
  message         TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  push_sent       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts (created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_outlet ON alerts (outlet_id, created_at);

-- Small key/value store (e.g. last metadata sync time)
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
