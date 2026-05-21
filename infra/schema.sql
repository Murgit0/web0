PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio TEXT DEFAULT '',
  favorite_color TEXT DEFAULT '#336699',
  obsession TEXT DEFAULT '',
  mood TEXT DEFAULT '😐',
  profile_song_url TEXT DEFAULT '',
  background_css TEXT DEFAULT '',
  wheat_balance INTEGER NOT NULL DEFAULT 100,
  crop_balance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  html TEXT NOT NULL DEFAULT '',
  css TEXT NOT NULL DEFAULT '',
  js TEXT NOT NULL DEFAULT '',
  blocks_meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wheat_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS economy_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  multiplier REAL NOT NULL DEFAULT 1,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS farm_plots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plot_index INTEGER NOT NULL,
  crop TEXT,
  planted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, plot_index)
);

CREATE TABLE IF NOT EXISTS global_farm (
  plot_index INTEGER PRIMARY KEY,
  crop TEXT,
  planted_by TEXT REFERENCES users(id),
  planted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weather_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  weather TEXT NOT NULL DEFAULT 'clear',
  yield_modifier REAL NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO weather_state (id, weather, yield_modifier) VALUES (1, 'clear', 1);

CREATE TABLE IF NOT EXISTS casino_bets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  bet INTEGER NOT NULL,
  payout INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS heist_log (
  id TEXT PRIMARY KEY,
  attacker_id TEXT NOT NULL REFERENCES users(id),
  target_id TEXT NOT NULL REFERENCES users(id),
  success INTEGER NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shop_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  item_id TEXT NOT NULL,
  wheat_cost INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mug_drops (
  id TEXT PRIMARY KEY,
  drop_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mug_catches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  drop_id TEXT NOT NULL REFERENCES mug_drops(id),
  drop_number INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mug_memorial (
  id TEXT PRIMARY KEY,
  drop_number INTEGER NOT NULL,
  cause TEXT NOT NULL DEFAULT 'shattered on landing',
  died_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mug_shards (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO mug_shards (id, count) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS kitchen_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  drought INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO kitchen_state (id, drought) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS game_scores (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  game TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_matches (
  id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  player1_id TEXT NOT NULL REFERENCES users(id),
  player2_id TEXT REFERENCES users(id),
  state TEXT NOT NULL DEFAULT '{}',
  stake INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wagers (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES game_matches(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  badge TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, badge)
);

CREATE TABLE IF NOT EXISTS profile_wall (
  id TEXT PRIMARY KEY,
  profile_user_id TEXT NOT NULL REFERENCES users(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sites_slug ON sites(slug);
CREATE INDEX IF NOT EXISTS idx_sites_owner ON sites(owner_id);
CREATE INDEX IF NOT EXISTS idx_farm_user ON farm_plots(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON wheat_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_heist_attacker ON heist_log(attacker_id, created_at);
CREATE INDEX IF NOT EXISTS idx_game_scores ON game_scores(game, score);

-- seed global farm plots 0-7
INSERT OR IGNORE INTO global_farm (plot_index) VALUES (0),(1),(2),(3),(4),(5),(6),(7);
