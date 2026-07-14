-- FRC Pit Scout sync schema (D1 / SQLite)

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  invite_code TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_teams (
  event_id TEXT NOT NULL,
  team_number INTEGER NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  division TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (event_id, team_number),
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id),
  FOREIGN KEY (event_id) REFERENCES events(id)
);

-- Full team pit record (matches current PWA shape; photos stripped in sync payload)
CREATE TABLE IF NOT EXISTS team_records (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  team_number INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  device_id TEXT,
  deleted_at TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (event_id, team_number)
);

CREATE TABLE IF NOT EXISTS qual_matches (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  match_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  device_id TEXT,
  deleted_at TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (event_id, match_key)
);

CREATE TABLE IF NOT EXISTS prescout_records (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  team_number INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  device_id TEXT,
  deleted_at TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (event_id, team_number)
);

CREATE TABLE IF NOT EXISTS match_observations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  team_number INTEGER NOT NULL,
  match_key TEXT,
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  device_id TEXT,
  deleted_at TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS processed_operations (
  operation_id TEXT PRIMARY KEY,
  device_id TEXT,
  result_json TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS change_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_change_log_event_seq ON change_log(event_id, seq);
CREATE INDEX IF NOT EXISTS idx_team_records_event ON team_records(event_id);
CREATE INDEX IF NOT EXISTS idx_qual_matches_event ON qual_matches(event_id);
CREATE INDEX IF NOT EXISTS idx_prescout_event ON prescout_records(event_id);
CREATE INDEX IF NOT EXISTS idx_match_obs_event ON match_observations(event_id);
