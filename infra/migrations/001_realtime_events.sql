-- Run on existing D1 DB if schema was applied before realtime_events existed
CREATE TABLE IF NOT EXISTS realtime_events (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_realtime_channel ON realtime_events(channel, created_at);
