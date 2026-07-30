ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'zh';
ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';

CREATE TABLE IF NOT EXISTS measurements (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_kg REAL,
  body_fat_pct REAL,
  waist_cm REAL,
  arm_cm REAL,
  note TEXT,
  measured_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS measurements_user_time_idx ON measurements(user_id, measured_at);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  duration_minutes INTEGER,
  rpe INTEGER,
  pain INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, plan_id, day_index)
);
CREATE INDEX IF NOT EXISTS workout_sessions_user_time_idx ON workout_sessions(user_id, completed_at);

CREATE TABLE IF NOT EXISTS generation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  model TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  request_id TEXT,
  error_code TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS generation_runs_time_idx ON generation_runs(created_at);
CREATE INDEX IF NOT EXISTS generation_runs_status_time_idx ON generation_runs(status, created_at);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_audit_events_time_idx ON admin_audit_events(created_at);

INSERT OR IGNORE INTO site_settings (key, value_json, updated_by, updated_at)
VALUES
  ('disclaimer_version', '"health-v2"', 'system', CURRENT_TIMESTAMP),
  ('announcement', '""', 'system', CURRENT_TIMESTAMP),
  ('maintenance_mode', 'false', 'system', CURRENT_TIMESTAMP);
