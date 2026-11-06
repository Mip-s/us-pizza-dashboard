-- "Outlet closed" mode (6/11): operations silence an outlet for a set time (power cut, renovation ...).
-- While a closure is active no NEW problems are raised for the outlet and no alerts or pushes go out; the dashboard
-- shows it grey as "Closed". One row per closure; history is kept.
--   closed_until  epoch ms the closure was set to last until
--   ended_at      epoch ms it was ended early by hand (NULL = ran / is running to closed_until)
--   effective end = COALESCE(ended_at, closed_until); monitoring stays quiet for a short grace after it
--   (devices need a few minutes to report again after a power cut)
CREATE TABLE IF NOT EXISTS outlet_closures (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet_id     TEXT NOT NULL,
  reason        TEXT NOT NULL,
  closed_until  INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  set_by        TEXT,
  ended_at      INTEGER,
  ended_by      TEXT
);
CREATE INDEX IF NOT EXISTS idx_closures_outlet ON outlet_closures (outlet_id, created_at);
